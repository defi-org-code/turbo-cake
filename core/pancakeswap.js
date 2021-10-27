const {getPastEventsLoop} = require('../bscFetcher')
const {SMARTCHEF_FACTORY_ABI, CAKE_ABI, BEP_20_ABI, SMARTCHEF_INITIALIZABLE_ABI,  ROUTER_V2_ABI} = require('../abis')
const {MASTER_CHEF_ADDRESS, SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS, BNB_ADDRESS, BUSD_ADDRESS, ROUTER_V2_ADDRESS, ROUTES_TO_CAKE} = require('./params')
const nodeFetch = require("node-fetch")
const Contract = require('web3-eth-contract') // workaround for web3 leakage

const {FatalError} = require('../errors');
require('dotenv').config();

const BigNumber = require('bignumber.js')
BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})

const {Logger} = require('../logger')
const logger = new Logger('pancakeswap')

const {assert} = require('../helpers')


class Pancakeswap {

	SEC_PER_HOUR = 3600
	AVG_BLOCK_SEC = 3
	SECONDS_PER_DAY = this.SEC_PER_HOUR * 24
	BLOCKS_PER_DAY = this.SECONDS_PER_DAY / this.AVG_BLOCK_SEC
	BLOCKS_PER_YEAR = this.BLOCKS_PER_DAY * 365

	PAST_EVENTS_N_DAYS =  90
	PAST_EVENTS_N_BLOCKS = Math.floor(this.PAST_EVENTS_N_DAYS * this.BLOCKS_PER_DAY)

	EXCLUDED_POOLS = ["0xa80240Eb5d7E05d3F250cF000eEc0891d00b51CC"]

    constructor(redisClient, web3, notif, bestRouteUpdateInterval) {
        this.redisClient = redisClient;
        this.bestRouteUpdateInterval = bestRouteUpdateInterval;
        this.psLastUpdate = null;
        this.web3 = web3
        this.notif = notif

        this.poolsInfo = {}
		this.lastBlockUpdate = null

        this.investInfo = {}
        this.workersAddr = []
        this.totalBalance = null
    }

	async init() {

		this.smartchefFactoryContract = this.getContract(SMARTCHEF_FACTORY_ABI, SMARTCHEF_FACTORY_ADDRESS)
		this.cakeContract = this.getContract(CAKE_ABI, CAKE_ADDRESS)
		this.routerV2Contract = this.getContract(ROUTER_V2_ABI, ROUTER_V2_ADDRESS)

		await this.getPsLastUpdate()
		await this.getPoolsInfo()

		await this.update({'staked': 0, 'unstaked': 0})

 		logger.debug(`init ps ended successfully`)
	}

    async update(totalBalance, stakingAddr) {

		this.totalBalance = totalBalance
		this.stakingAddr = stakingAddr

		await this.fetchPools();
		await this.setActivePools()

		if (Date.now() - this.psLastUpdate > this.bestRouteUpdateInterval) {
			await this.updateBestRoute()
		}

		await this.updatePoolsApy()
		await this.setPsLastUpdate()
    }

	async getPsLastUpdate() {

		let reply = await this.redisClient.get(`psLastUpdate.${process.env.BOT_ID}`)

		if (reply == null) {
			this.psLastUpdate = 0
			return
		}

		this.psLastUpdate = Number(reply)
		logger.debug(`PS lastUpdate was successfully loaded: ${reply}`)
	}

	async setPsLastUpdate() {
		this.psLastUpdate = Date.now()
		await this.redisClient.set(`psLastUpdate.${process.env.BOT_ID}`, this.psLastUpdate)
	}

	updateWorkersAddr(workersAddr) {
		this.workersAddr = workersAddr
	}

	getContract(contractAbi, contractAddress) {
		const contract = new Contract(contractAbi, contractAddress)
		contract.setProvider(this.web3.currentProvider)
		return contract
	}

	async getInvestReport(totalBalance, curSyrupPoolAddr, blockNum) {

		this.totalBalance = totalBalance

		if(Object.keys(this.investInfo).length === 0) {
			await this.getInvestInfo(curSyrupPoolAddr, blockNum)
			return null
		}

		if ((blockNum === null) || (curSyrupPoolAddr === null)) {
			return null
		}

		const startBalance = (new BigNumber(this.investInfo['startBalance'].staked)).plus(this.investInfo['startBalance'].unstaked)
		const endBalance = (new BigNumber(this.totalBalance.staked)).plus(this.totalBalance.unstaked)
		const balanceCngPct = this.changePct(startBalance, endBalance)
		const blocksPeriod = Number(blockNum - this.investInfo['startBlock'])

		logger.debug(`getInvestReport: startBalance=${startBalance}, endBalance=${endBalance}, balanceCngPct=${balanceCngPct}, blockNum=${blockNum}, blocksPeriod=${blocksPeriod}`)
		logger.debug('investInfo')
		console.log(this.investInfo)

		const apy = this.aprToApy(balanceCngPct.multipliedBy(this.BLOCKS_PER_YEAR).toString() / blocksPeriod)
		logger.info(`Investment APY: ${apy}`)

		const cakeUsdRate = await this.getCakeUSDRate()
		const balanceUsd = totalBalance.staked.plus(totalBalance.unstaked).dividedBy(1e18).multipliedBy(cakeUsdRate)

		return {apy: apy, roi: balanceCngPct.toString(), roiBlockPeriod: blocksPeriod, roiDaysPeriod: blocksPeriod / this.BLOCKS_PER_DAY,
				balanceUsd: balanceUsd, stakedCakeBalance: totalBalance.staked.dividedBy(1e18).toString(), unstakedCakeBalance: totalBalance.unstaked.dividedBy(1e18).toString(),
				poolAddr: curSyrupPoolAddr, poolTvl: await this.getPoolTvl(curSyrupPoolAddr), blockNum: blockNum}
	}

	async getPoolsApyReport(curSyrupPoolAddr) {

		let apyDict = {}

		if (curSyrupPoolAddr != null) {
			apyDict['active-pool'] =  this.poolsInfo[curSyrupPoolAddr]['apy']
		}

		for (const poolAddr of Object.keys(this.poolsInfo)) {

			if ((this.poolsInfo[poolAddr]['active'] === false) || (this.poolsInfo[poolAddr]['apy'] === null)) {
				continue
			}

			apyDict[this.poolsInfo[poolAddr]['rewardSymbol']] = this.poolsInfo[poolAddr]['apy']
		}

		return apyDict
	}

	async getInvestInfo(curSyrupPoolAddr, blockNum) {
		let reply = await this.redisClient.get(`investInfo.${process.env.BOT_ID}`)

		if (reply == null) {

			if (curSyrupPoolAddr === null) {
				logger.info('curSyrupPoolAddr is null, no active investment')
				return
			}

			reply = JSON.stringify({startBalance: this.totalBalance, startBlock: blockNum})
			await this.redisClient.set(`investInfo.${process.env.BOT_ID}`, reply)
			logger.info(`investInfo is not set, resetting info to current block: balance=${JSON.stringify(this.totalBalance)}, startBlock=${blockNum}`)
		}

		this.investInfo = JSON.parse(reply)
		logger.debug(`investInfo was successfully loaded: ${JSON.stringify(this.investInfo)}`)
	}

	setTotalBalance(totalBalance) {
		this.totalBalance = totalBalance
	}

	changePct(start, end) {
		return new BigNumber(100).multipliedBy(new BigNumber(end).div(new BigNumber(start)) - new BigNumber(1))
	}

	async getPoolTvl(addr) {
		assert (addr != null, `pool addr is null, can npt fetch pool tvl`)
		return await this.cakeContract.methods.balanceOf(addr).call();
	}

	aprToApy(apr, n=365, t=1.0) {
		return 100 * ((1 + apr / 100 / n) ** (n*t) - 1)
	}

	async updateSingleRoute(poolAddr) {
		let res, amount, bestRes

		if (this.poolsInfo[poolAddr]['active'] === false) {
			return
		}

		const rewardPerBlock = new BigNumber(this.poolsInfo[poolAddr]['rewardPerBlock'])
		// estimate route based on daily rewards
		// const rewardForDay = rewardPerBlock.multipliedBy(this.BLOCKS_PER_DAY)

		bestRes = new BigNumber(0)

		for (let route of ROUTES_TO_CAKE) {

			route = [this.poolsInfo[poolAddr]['rewardToken']].concat(route)
			try {
				res = await this.routerV2Contract.methods.getAmountsOut(rewardPerBlock, route).call()
			}
			catch (e) {
				continue
			}

			amount = new BigNumber(res[res.length-1])

			// console.log(`poolAddr ${poolAddr}: route: ${route}, amount ${amount.toString()}, bestRes ${bestRes.toString()}`)

			if (amount.gt(bestRes)) {
				bestRes = amount
				this.poolsInfo[poolAddr]['routeToCake'] = route
				logger.debug(`setting ${this.poolsInfo[poolAddr]['rewardSymbol']} (addr=${poolAddr}) best route to ${route}`)
			}
		}
	}

	async updateBestRoute() {

		// logger.info(`updateBestRoute: `)
		for (const poolAddr of Object.keys(this.poolsInfo)) {
			await this.updateSingleRoute(poolAddr)
		}

		logger.debug('updateBestRoute ended')
	}

	async getCakeUSDRate() {

		let res;
		const amountIn = new BigNumber(100e18)
		res = await this.routerV2Contract.methods.getAmountsOut(amountIn, [CAKE_ADDRESS, BUSD_ADDRESS]).call()

		return (new BigNumber(res[res.length-1]).dividedBy(amountIn)).toString()
	}

	async getTokenCakeRate(poolAddr, amountIn) {

		let res;
		// TODO: check and verify calculations
		// TODO: pool EMA
		if (this.poolsInfo[poolAddr]['routeToCake'] == null) {
			await this.updateSingleRoute(poolAddr)
		}

		res = await this.routerV2Contract.methods.getAmountsOut(amountIn, this.poolsInfo[poolAddr]['routeToCake']).call()

		// logger.debug(`getTokenCakeRate: poolAddr=${poolAddr}, res=${res}, amountIn=${amountIn.toString()}, rate=${(new BigNumber(res[res.length-1]).dividedBy(amountIn)).toString()}`)
		return (new BigNumber(res[res.length-1]).dividedBy(amountIn)).toString()
	}

	async poolApy(poolAddr) {

		let poolTvl = await this.getPoolTvl(poolAddr)
		// assuming all workers are staked in the same pool
		if (this.stakingAddr === poolAddr) {
			poolTvl = new BigNumber(poolTvl).plus(new BigNumber(this.totalBalance.unstaked))
		} else {
			poolTvl = new BigNumber(poolTvl).plus(new BigNumber(this.totalBalance.unstaked)).plus(new BigNumber(this.totalBalance.staked))
		}

		const rewardPerBlock = new BigNumber(this.poolsInfo[poolAddr]['rewardPerBlock'])

		// estimate token cake rate based on daily rewards (max harvest period)
		// const rewardForDay = rewardPerBlock.multipliedBy(this.BLOCKS_PER_DAY).dividedBy(1000)
		const tokenCakeRate = await this.getTokenCakeRate(poolAddr, rewardPerBlock)
		// console.log(this.totalBalance)

		const rewardForYear = rewardPerBlock.multipliedBy(this.BLOCKS_PER_YEAR)
		const cakeForYear = rewardForYear.multipliedBy(tokenCakeRate);

		const apr = cakeForYear.div(poolTvl).multipliedBy(100);

		// logger.debug(`poolName= ${this.poolsInfo[poolAddr]['rewardSymbol']} poolAddr=${poolAddr}, rewardPerBlock=${rewardPerBlock.toString()},
		// tokenCakeRate=${tokenCakeRate}, poolTvl=${poolTvl.toString()}, rewardForYear=${rewardForYear}, cakeForYear=${cakeForYear}, apr=${apr}`)

		// TODO: harvest cost
		return this.aprToApy(apr.toString())
		// logger.debug(`poolAddr=${poolAddr}, rewardForPeriod=${rewardForYear.toString()}, cakeForYear=${cakeForYear.toString()}, apr=${apr.toString()}, apy=${apy}`)
	}

	async fetchPoolRewards(poolAddr) {
		const rewardContract = await this.getContract(BEP_20_ABI, this.poolsInfo[poolAddr]['rewardToken'])
		return await rewardContract.methods.balanceOf(poolAddr).call()
	}

	async fetchUpdatePoolActiveVars(poolAddr) {
		// logger.info(`updating bonus info for ${poolAddr}`)
		const poolContract = await this.getContract(SMARTCHEF_INITIALIZABLE_ABI, poolAddr)
		this.poolsInfo[poolAddr]['bonusEndBlock'] = await poolContract.methods.bonusEndBlock().call()
		this.poolsInfo[poolAddr]['startBlock'] =  await poolContract.methods.startBlock().call()
		this.poolsInfo[poolAddr]['hasUserLimit'] = await poolContract.methods.hasUserLimit().call()

		// logger.info(`updating pool rewards for ${poolAddr}`)
		this.poolsInfo[poolAddr]['poolRewards'] = await this.fetchPoolRewards(poolAddr)

	}

	async setActivePools() {

		logger.debug(`setActivePools started: updating start, end block, user limit, pool rewards ...`)

		const blockNum = await this.web3.eth.getBlockNumber()
		let bonusEndBlock, startBlock, poolRewards, poolRewardsEnd, poolEnded

		for (const poolAddr of Object.keys(this.poolsInfo)) {

			await this.fetchUpdatePoolActiveVars(poolAddr)

			bonusEndBlock = Number(this.poolsInfo[poolAddr]['bonusEndBlock'])
			startBlock = Number(this.poolsInfo[poolAddr]['startBlock'])
			poolRewards = new BigNumber(this.poolsInfo[poolAddr]['poolRewards'])

			poolRewardsEnd = (new BigNumber(this.poolsInfo[poolAddr]['rewardPerBlock'])).multipliedBy(10)

			this.poolsInfo[poolAddr]['active'] = !((bonusEndBlock <= blockNum) || (poolAddr in this.EXCLUDED_POOLS) || (poolRewards.lt(poolRewardsEnd)) || (startBlock > blockNum));
		}

		logger.debug('setActivePools ended')
		await this.savePoolsInfo()

	}

	async updatePoolsApy() {

		logger.debug(`updatePoolsApy`)

		for (const poolAddr of Object.keys(this.poolsInfo)) {
			if (this.poolsInfo[poolAddr]['active'] === false) {
				continue
			}
			this.poolsInfo[poolAddr]['apy'] = await this.poolApy(poolAddr)
		}

		logger.debug(`poolsInfo:`)
		console.log(this.poolsInfo)
	}

	async getLastBlockUpdate() {

		const blockNum = await this.web3.eth.getBlockNumber()
		let reply = await this.redisClient.get(`lastBlockUpdate.${process.env.BOT_ID}`)

		if (reply == null) {
			reply = blockNum - this.PAST_EVENTS_N_BLOCKS
			logger.debug(`lastBlockUpdate was not found in redis`)
		}

		this.lastBlockUpdate = reply
		logger.debug(`get lastBlockUpdate from redis: ${this.lastBlockUpdate}`)
	}

	async getPoolsInfo() {

		await this.getLastBlockUpdate()

		if (this.lastBlockUpdate == null) {
			throw Error(`lastBlockUpdate should be != null`)
		}

		let reply = await this.redisClient.get(`poolsInfo.${process.env.BOT_ID}`)

		if (reply == null) {
			logger.debug('poolInfo was not found in redis, init poolsInfo with empty dict')
			this.poolsInfo = {}
			return
		}

		this.poolsInfo = JSON.parse(reply)
		logger.debug('poolInfo was successfully loaded')
	}

	async saveLastBlockUpdate(lastBlockUpdate) {

		if (!lastBlockUpdate) {
			throw new FatalError(`Invalid lastBlockUpdate ${lastBlockUpdate}`)
		}

		this.lastBlockUpdate = lastBlockUpdate
		await this.redisClient.set(`lastBlockUpdate.${process.env.BOT_ID}`, this.lastBlockUpdate)
		logger.debug('lastBlockUpdate updated successfully')
	}

	async savePoolsInfo() {

		if (!Object.keys(this.poolsInfo).length) {
			throw new FatalError("No pools found");
		}

		await this.redisClient.set(`poolsInfo.${process.env.BOT_ID}`, JSON.stringify(this.poolsInfo))

		logger.debug('pools info updated successfully')
	}

	async fetchAbi(addr) {
		const bscscanAbiUrl =  `https://api.bscscan.com/api?module=contract&action=getabi&address=${addr}&apiKey=${process.env.BSCSCAN_API_KEY}`
		const data = await nodeFetch(bscscanAbiUrl).then(response => response.json())
		return JSON.parse(data.result)
	}

    async fetchPools() {

		logger.debug('fetchPools ... ')

		let blockNum = await this.web3.eth.getBlockNumber()

		if (this.lastBlockUpdate == null) {
			throw Error('lastBlockUpdate should be set')
		}

        if (this.lastBlockUpdate === blockNum) {

			logger.debug(`fetchPools: nothing to fetch, lastBlockUpdate (${this.lastBlockUpdate}) >= blockNum (${blockNum})`)
			return

		} else if (this.lastBlockUpdate > blockNum) {

			this.notif.sendDiscord(`[WARNING] lastBlockUpdate (${this.lastBlockUpdate}) > blockNum (${blockNum})`)
			return
		}

		const fetchNBlocks = blockNum - this.lastBlockUpdate

        let events = await getPastEventsLoop(this.smartchefFactoryContract, 'NewSmartChefContract', fetchNBlocks, blockNum)

        for (const event of events) {

        	try {
				const poolAddr = event['returnValues']['smartChef']
				const smartChef = this.getContract(SMARTCHEF_INITIALIZABLE_ABI, poolAddr);
				const rewardToken = await smartChef.methods.rewardToken().call()
				const stakedToken = await smartChef.methods.stakedToken().call()
				const hasUserLimit = await smartChef.methods.hasUserLimit().call()
				const rewardPerBlock = await smartChef.methods.rewardPerBlock().call()
				const bonusEndBlock = await smartChef.methods.bonusEndBlock().call()
				const startBlock = await smartChef.methods.startBlock().call()

				logger.debug(`poolAddr=${poolAddr}, bonusEndBlock=${bonusEndBlock}, rewardToken=${rewardToken}, stakedToken=${stakedToken}, hasUserLimit=${hasUserLimit}, ${hasUserLimit === true}`)

				if (stakedToken !== CAKE_ADDRESS) {
					continue
				}

            	const bep20 = this.getContract(BEP_20_ABI, rewardToken);
				const symbol = await bep20.methods.symbol().call()
				logger.debug(poolAddr, symbol, rewardToken, stakedToken)

				this.poolsInfo[poolAddr] = {
					'rewardToken': rewardToken,
					'rewardSymbol': symbol,
					'hasUserLimit': hasUserLimit,
					'rewardPerBlock': rewardPerBlock,
					'startBlock': startBlock,
					'routeToCake': null,
					'active': true, // default, will be set to false on setActivePools
				}

            } catch (e) {
                this.notif.sendDiscord(`failed to setup smartChef info for (${event['returnValues']['smartChef']}): ${e}`)
            }
        }

		await this.savePoolsInfo()
		await this.saveLastBlockUpdate(blockNum)
    }
}


module.exports = {
    Pancakeswap,
};
