const {getPastEventsLoop} = require('../bscFetcher')
const {SMARTCHEF_FACTORY_ABI, CAKE_ABI, BEP_20_ABI, SMARTCHEF_INITIALIZABLE_ABI,  ROUTER_V2_ABI} = require('../abis')
const {MASTER_CHEF_ADDRESS, SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS, BNB_ADDRESS, ROUTER_V2_ADDRESS, ROUTES_TO_CAKE} = require('./params')
const nodeFetch = require("node-fetch")
const Contract = require('web3-eth-contract') // workaround for web3 leakage

const {FatalError} = require('../errors');
require('dotenv').config();

const BigNumber = require('bignumber.js')
BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})

const {Logger} = require('../logger')
const logger = new Logger('pancakeswap')


class Pancakeswap {

	SEC_PER_HOUR = 3600
	AVG_BLOCK_SEC = 3
	SECONDS_PER_DAY = this.SEC_PER_HOUR * 24
	BLOCKS_PER_DAY = this.SECONDS_PER_DAY / this.AVG_BLOCK_SEC
	BLOCKS_PER_YEAR = this.BLOCKS_PER_DAY * 365

	PAST_EVENTS_N_DAYS =  10
	PAST_EVENTS_N_BLOCKS = Math.floor(this.PAST_EVENTS_N_DAYS * this.BLOCKS_PER_DAY)

	EXCLUDED_POOLS = ["0xa80240Eb5d7E05d3F250cF000eEc0891d00b51CC"]

    constructor(botAddress, redisClient, web3, notif, pancakeUpdateInterval, bestRouteUpdateInterval) {
		this.botAddress = botAddress;
        this.redisClient = redisClient;
        this.pancakeUpdateInterval = pancakeUpdateInterval;
        this.bestRouteUpdateInterval = bestRouteUpdateInterval;
        this.lastUpdate = Date.now() - Math.max(pancakeUpdateInterval, bestRouteUpdateInterval);
        this.web3 = web3
        this.notif = notif

        this.poolsInfo = {}
        this.lastBlockUpdate = null
        this.balance = {
        	staked: 0,
			unstaked: 0,
		}
        this.investInfo = {}
        this.workersAddr = []
    }

	async init() {
		// TODO: add support to contract manager
		this.smartchefFactoryContract = this.getContract(SMARTCHEF_FACTORY_ABI, SMARTCHEF_FACTORY_ADDRESS)
		this.cakeContract = this.getContract(CAKE_ABI, CAKE_ADDRESS)
		this.routerV2Contract = this.getContract(ROUTER_V2_ABI, ROUTER_V2_ADDRESS)

		await this.getLastBlockUpdate()
		await this.getPoolsInfo()
		await this.fetchPools()

		const curSyrupPoolAddr = await this.getStakingAddr()
		await this.getInvestInfo(curSyrupPoolAddr)

		// await this.getTransferEvents()

		logger.debug(`init ps ended successfully: curSyrupPoolAddr=${curSyrupPoolAddr}`)
		return curSyrupPoolAddr
	}

	updateWorkersAddr(workersAddr) {
		this.workersAddr = workersAddr
	}

	getContract(contractAbi, contractAddress) {
		const contract = new Contract(contractAbi, contractAddress)
		contract.setProvider(this.web3.currentProvider)
		return contract
	}

	async getStakingAddr() {

		let res, contract
		let stakingAddr = []

		for (const poolAddr of Object.keys(this.poolsInfo)) {
			contract = this.getContract(this.poolsInfo[poolAddr]['abi'], poolAddr)

			if (poolAddr === MASTER_CHEF_ADDRESS) {
				res = await contract.methods.userInfo(0, this.botAddress).call()
			}
			else {
				res = await contract.methods.userInfo(this.botAddress).call()
			}

			if (res['amount'] !== '0') {
				stakingAddr.push(poolAddr)
			}
		}

        if (stakingAddr.length === 1) {
            return stakingAddr[0]
        } else if (stakingAddr.length > 1) {
            throw Error(`Bot (${this.botAddress}) has staking in more than 1 pool: ${stakingAddr}`)
        }

		return null
	}

	async updateBalance(curSyrupPoolAddr) {

		this.balance.unstaked = await this.cakeContract.methods.balanceOf(this.botAddress).call()

		if (curSyrupPoolAddr === null) {
			logger.info(`updateBalance: curr pool is null, only unstaked cakes: ${this.balance.unstaked}`)
			this.balance.staked = 0;

		} else {

			let contract = this.getContract(this.poolsInfo[curSyrupPoolAddr]['abi'], curSyrupPoolAddr)
			let res

			if (curSyrupPoolAddr === MASTER_CHEF_ADDRESS) {
				res = await contract.methods.userInfo(0, this.botAddress).call()
			}

			else {
				res = await contract.methods.userInfo(this.botAddress).call()
			}

			this.balance.staked = res['amount']
		}
		logger.info(`balance=${JSON.stringify(this.balance)}`)
	}

	async getInvestApy(curSyrupPoolAddr) {

		if(Object.keys(this.investInfo).length === 0) {
			await this.getInvestInfo(curSyrupPoolAddr)
			return null
		}

		await this.updateBalance(curSyrupPoolAddr)

		const startBalance = (new BigNumber(this.investInfo['startBalance'].staked)).plus(this.investInfo['startBalance'].unstaked)
		const endBalance = (new BigNumber(this.balance.staked)).plus(this.balance.unstaked)
		const balanceCngPct = this.changePct(startBalance, endBalance)
		const blockNum = Number(await this.web3.eth.getBlockNumber())
		const period = Number(blockNum - this.investInfo['startBlock'])

		logger.debug(`getInvestApy: startBalance=${startBalance}, endBalance=${endBalance}, balanceCngPct=${balanceCngPct}, blockNum=${blockNum}, period=${period}`)
		logger.debug('investInfo')
		console.log(this.investInfo)

		const apy = balanceCngPct.multipliedBy(this.BLOCKS_PER_YEAR).toString() / period
		logger.info(`Investment APY: ${apy}`)

		if (period < this.BLOCKS_PER_DAY) {
			logger.info(`ignoring report for period < 1 day`)
			return null
		}

		return apy
	}

	async getInvestInfo(curSyrupPoolAddr) {
		let reply = await this.redisClient.get('investInfo')

		if (reply == null) {

			if (curSyrupPoolAddr === null) {
				logger.info('curSyrupPoolAddr is null, no active investment')
				return
			}

			// throw Error(`invest info should be set`)
			const blockNum = await this.web3.eth.getBlockNumber()
			await this.updateBalance(curSyrupPoolAddr)

			reply = JSON.stringify({startBalance: this.balance, startBlock: blockNum})
			await this.redisClient.set('investInfo', reply)
			logger.info(`investInfo is not set, resetting info to current block: balance=${JSON.stringify(this.balance)}, startBlock=${blockNum}`)
		}

		this.investInfo = JSON.parse(reply)
		logger.debug(`investInfo was successfully loaded: ${JSON.stringify(this.investInfo)}`)
	}

    async update(curSyrupPoolAddr) {

        try {

            if (Date.now() - this.lastUpdate < this.pancakeUpdateInterval) {
                return;
            }

            let shouldUpdateBestRoute;
            if (Date.now() - this.lastUpdate > this.bestRouteUpdateInterval) {
				shouldUpdateBestRoute = true;
            }

			this.lastUpdate = Date.now()

			await this.updateBalance(curSyrupPoolAddr)
			await this.fetchPools();
			await this.setActivePools()
			if (shouldUpdateBestRoute) {
				await this.updateBestRoute()
			}

			await this.updatePoolsApy()

        } catch (e) {
            throw new FatalError(`pancake update error: ${e}`);
        }
    }

	changePct(start, end) {
		return new BigNumber(100).multipliedBy(new BigNumber(end).div(new BigNumber(start)) - new BigNumber(1))
	}

	async getPoolTvl(addr) {
		return await this.cakeContract.methods.balanceOf(addr).call();
	}

	aprToApy(apr, n=365, t=1.0) {
		return 100 * ((1 + apr / 100 / n) ** (n*t) - 1)
	}

	async updateBestRoute() {
		let res, amount
		let bestRes = new BigNumber(0)

		for (const poolAddr of Object.keys(this.poolsInfo)) {

			if (this.poolsInfo[poolAddr]['active'] === false) {
				continue
			}

			const rewardPerBlock = new BigNumber(this.poolsInfo[poolAddr]['rewardPerBlock'])
			// estimate route based on daily rewards
			const rewardForDay = rewardPerBlock.multipliedBy(this.BLOCKS_PER_DAY)

			for (let route of ROUTES_TO_CAKE) {

				route = [this.poolsInfo[poolAddr]['rewardToken']].concat(route)
				try {
					res = await this.routerV2Contract.methods.getAmountsOut(rewardForDay, route).call()
				}
				catch (e) {
					logger.debug(`poolAddr ${poolAddr} skipping route ${route}: ${e}`)
					continue
				}

				amount = new BigNumber(res[res.length-1])

				if (amount.gt(bestRes)) {
					bestRes = amount
					this.poolsInfo[poolAddr]['routeToCake'] = route
					logger.debug(`setting ${poolAddr} best route to ${route}`)
				}
			}
		}

		logger.debug('updateBestRoute ended')
	}

	async getTokenCakeRate(poolAddr, amountIn) {

		if (this.poolsInfo[poolAddr]['rewardToken'] === CAKE_ADDRESS) {
			return 1
		}

		let res;
		// TODO: check and verify calculations
		// TODO: pool EMA
		res = await this.routerV2Contract.methods.getAmountsOut(amountIn, this.poolsInfo[poolAddr]['routeToCake']).call()

		const rate = (new BigNumber(res[res.length-1]).dividedBy(amountIn)).toString()
		logger.debug(`getTokenCakeRate: poolAddr=${poolAddr}, res=${res}, amountIn=${amountIn.toString()}, rate=${rate}`)
		return rate
	}

	async poolApy(poolAddr) {

		let poolTvl = await this.getPoolTvl(poolAddr)
		// account for bot staking in tvl
		poolTvl = new BigNumber(poolTvl).plus(new BigNumber(this.balance.unstaked))

		const rewardPerBlock = new BigNumber(this.poolsInfo[poolAddr]['rewardPerBlock'])

		// estimate token cake rate based on daily rewards (max harvest period)
		const rewardForDay = rewardPerBlock.multipliedBy(this.BLOCKS_PER_DAY)
		const tokenCakeRate = await this.getTokenCakeRate(poolAddr, rewardForDay)
		logger.debug(`poolAddr=${poolAddr}, rewardPerBlock=${rewardPerBlock.toString()}, tokenCakeRate=${tokenCakeRate}, poolTvl=${poolTvl.toString()}`)

		const rewardForYear = rewardPerBlock.multipliedBy(this.BLOCKS_PER_YEAR)
		const cakeForYear = rewardForYear.multipliedBy(tokenCakeRate);

		const apr = cakeForYear.div(poolTvl).multipliedBy(100);
		// TODO: harvest cost
		const apy = this.aprToApy(apr.toString())
		logger.debug(`poolAddr=${poolAddr}, rewardForPeriod=${rewardForYear.toString()}, cakeForYear=${cakeForYear.toString()}, apr=${apr.toString()}, apy=${apy}`)

		return apy
	}

	async fetchPoolRewards(poolAddr) {
		const rewardContract = await this.getContract(BEP_20_ABI, this.poolsInfo[poolAddr]['rewardToken'])
		return await rewardContract.methods.balanceOf(poolAddr).call()
	}

	async fetchUpdateBonusInfo(poolAddr) {
		const poolContract = await this.getContract(this.poolsInfo[poolAddr]['abi'], poolAddr)
		this.poolsInfo[poolAddr]['bonusEndBlock'] = await poolContract.methods.bonusEndBlock().call()
		this.poolsInfo[poolAddr]['startBlock'] =  await poolContract.methods.startBlock().call()
	}

	async setActivePools() {

		logger.debug(`setActivePools started`)

		const blockNum = await this.web3.eth.getBlockNumber()
		let bonusEndBlock, startBlock, poolRewards

		for (const poolAddr of Object.keys(this.poolsInfo)) {

			if (!('bonusEndBlock' in this.poolsInfo[poolAddr]) || !('startBlock' in this.poolsInfo[poolAddr])) {
				logger.info(`updating bonus info for ${poolAddr}`)
				await this.fetchUpdateBonusInfo(poolAddr)
			}

			if (!('poolRewards' in this.poolsInfo[poolAddr])) {
				logger.info(`updating pool rewards for ${poolAddr}`)
				this.poolsInfo[poolAddr]['poolRewards'] = await this.fetchPoolRewards(poolAddr)
			}

			bonusEndBlock = Number(this.poolsInfo[poolAddr]['bonusEndBlock'])
			startBlock = Number(this.poolsInfo[poolAddr]['startBlock'])
			poolRewards = Number(this.poolsInfo[poolAddr]['poolRewards'])

			this.poolsInfo[poolAddr]['active'] = !((startBlock > blockNum) || (bonusEndBlock <= blockNum) || (poolAddr in this.EXCLUDED_POOLS) ||
				(this.poolsInfo[poolAddr]['hasUserLimit'] === true) || (poolRewards === 0));
		}

		logger.debug('setActivePools ended')
		await this.savePoolsInfo(blockNum)

	}

	async updatePoolsApy() {

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
		let reply = await this.redisClient.get('lastBlockUpdate')

		if (reply == null) {
			reply = blockNum - this.PAST_EVENTS_N_BLOCKS
			logger.debug(`lastBlockUpdate was not found in redis`)
		}

		this.lastBlockUpdate = reply
		logger.debug(`get lastBlockUpdate from redis: ${this.lastBlockUpdate}`)

	}

	async getPoolsInfo() {

		let reply = await this.redisClient.get('poolsInfo')

		if (this.lastBlockUpdate == null) {
			throw Error(`lastBlockUpdate should be != null`)
		}

		if (reply == null) {
			logger.debug('poolInfo was not found in redis')
			this.poolsInfo = {}
			return
		}

		this.poolsInfo = JSON.parse(reply)
		logger.debug('poolInfo was successfully loaded')
	}

	async savePoolsInfo(lastBlockUpdate) {

		if (!Object.keys(this.poolsInfo).length) {
			throw new FatalError("No pools found");
		}

		if (!lastBlockUpdate) {
			throw new FatalError(`Invalid lastBlockUpdate ${lastBlockUpdate}`)
		}

		this.lastBlockUpdate = lastBlockUpdate
		await this.redisClient.set('lastBlockUpdate', this.lastBlockUpdate)
		await this.redisClient.set('poolsInfo', JSON.stringify(this.poolsInfo))

		logger.debug('pools info updated successfully')
	}

	async fetchAbi(addr) {
		const bscscanAbiUrl =  `https://api.bscscan.com/api?module=contract&action=getabi&address=${addr}&apiKey=${process.env.BSCSCAN_API_KEY}`
		const data = await nodeFetch(bscscanAbiUrl).then(response => response.json())
		return JSON.parse(data.result)
	}

	async getTransferEvents() {

		logger.debug('getTransferEvents ... ')

		let blockNum = await this.web3.eth.getBlockNumber()

		const fetchNBlocks = 90 * this.BLOCKS_PER_DAY // blockNum - this.lastBlockUpdate

        let events = await getPastEventsLoop(this.cakeContract, 'Transfer', fetchNBlocks, blockNum, 5000, {'to': '0xEf61Fe3cC3BC8d0D0266325221F5F0A9B7014C84'})
		let transfers = []

		for (const event of events) {

        	try {
        		if (await this.web3.eth.getCode(event['from']) === '0x') {
        			transfers.push(event)
        		}
        	}
        	catch (e) {
        		logger.debug(`unexpected error while processing transfer events: ${e}, skipping event...`)
        	}
		}

		return transfers
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

			this.notif(`[WARNING] lastBlockUpdate (${this.lastBlockUpdate}) > blockNum (${blockNum})`)
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
					'abi': SMARTCHEF_INITIALIZABLE_ABI,
					'routeToCake': [rewardToken, BNB_ADDRESS, CAKE_ADDRESS],
					'active': true, // default, will be set to false on setActivePools
				}

            } catch (e) {
                this.notif.sendDiscord(`failed to setup smartChef info for (${event['returnValues']['smartChef']}): ${e}`)
            }
        }

		await this.savePoolsInfo(blockNum)
    }
}


module.exports = {
    Pancakeswap,
};
