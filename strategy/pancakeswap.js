const {getPastEventsLoop} = require('../bscFetcher')
const {SMARTCHEF_FACTORY_ABI, CAKE_ABI, BEP_20_ABI, ROUTER_V2_ABI} = require('../abis')
const {MASTER_CHEF_ADDRESS, SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS, BNB_ADDRESS, ROUTER_V2_ADDRESS} = require('./params')
const nodeFetch = require("node-fetch")

require('dotenv').config();

const BigNumber = require('bignumber.js')
BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})

const debug = (...messages) => console.log(...messages);


class Pancakeswap {

	SEC_PER_HOUR = 3600
	AVG_BLOCK_SEC = 3
	SECONDS_PER_DAY = this.SEC_PER_HOUR * 24
	BLOCKS_PER_DAY = this.SECONDS_PER_DAY / this.AVG_BLOCK_SEC
	BLOCKS_PER_YEAR = this.BLOCKS_PER_DAY * 365

	PAST_EVENTS_N_DAYS = 90 // TODO: change
	PAST_EVENTS_N_BLOCKS = Math.floor(this.PAST_EVENTS_N_DAYS * this.BLOCKS_PER_DAY)

	EXCLUDED_POOLS = ["0xa80240Eb5d7E05d3F250cF000eEc0891d00b51CC"]

    constructor(redisClient, web3, notif, pancakeUpdateInterval) {
        this.redisClient = redisClient;
        this.pancakeUpdateInterval = pancakeUpdateInterval;
        this.lastUpdate = null;
        this.web3 = web3
        this.notif = notif

        this.poolsInfo = {}
        this.lastBlockUpdate = null
		this.paused = false;
    }

	async init() {
		this.smartchefFactoryContract = await this.getContract(SMARTCHEF_FACTORY_ABI, SMARTCHEF_FACTORY_ADDRESS)
		this.cakeContract = await this.getContract(CAKE_ABI, CAKE_ADDRESS)
		this.routerV2Contract = await this.getContract(ROUTER_V2_ABI, ROUTER_V2_ADDRESS)

		await this.getLastBlockUpdate()
		await this.getPoolsInfo()
		await this.fetchPools()
	}

	getContract(contractAbi, contractAddress) {
		return new this.web3.eth.Contract(contractAbi, contractAddress)
	}


	pause() {
		this.paused = true;
	}

	resume() {
		this.paused = false;
	}

	async getStakingAddr() {

		let res, contract
		let stakingAddr = []

		for (const poolAddr of Object.keys(this.poolsInfo)) {
			contract = this.getContract(this.poolsInfo[poolAddr]['abi'], poolAddr)

			if (poolAddr === MASTER_CHEF_ADDRESS) {
				res = await contract.methods.userInfo(0, process.env.BOT_ADDRESS).call()
			}
			else {
				res = await contract.methods.userInfo(process.env.BOT_ADDRESS).call()
			}

			console.log('poolAddr=', poolAddr, 'getSTakingAddr: res=', res)
			if (res['amount'] !== '0') {
				stakingAddr.push(poolAddr)
			}
		}

		return stakingAddr
	}

    async update() {

        try {
			if (this.paused) {
				return;
			}

            if (this.lastUpdate != null && Date.now() - this.lastUpdate < this.pancakeUpdateInterval) {
                return;
            }

			this.lastUpdate = Date.now()

			await this.fetchPools();
			await this.setActivePools()
			await this.updatePoolsApy()

        } catch (e) {
            console.log("Error updating pancakeswap.env.poolsInfo");
            console.error(e);
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

	 calcApy(rewardsPerBlock, tokenCakeRate, tvl, poolAddress) {

	 	if (this.poolsInfo[poolAddress]['active'] === false) {
	 		return 0
	 	}

		tvl = new BigNumber(tvl);
		tokenCakeRate = new BigNumber(tokenCakeRate);
		rewardsPerBlock = new BigNumber(rewardsPerBlock);

		if (tvl.lt(rewardsPerBlock)) {
			console.log(" ERROR: calcApy bogus tvl", tvl.toString());
			console.log(poolAddress)
			return 0;
		}
		const rewardForPeriod = rewardsPerBlock.multipliedBy(this.BLOCKS_PER_YEAR);
		const cakeForPeriod = rewardForPeriod.multipliedBy(tokenCakeRate); //* (1 - this.FEE)
		const apr = (tvl.plus(cakeForPeriod).div(tvl).minus(1).multipliedBy(100));
		if (apr.gt( new BigNumber(5000))) {
			console.log(" ERROR: calcApy bogus apr", apr.toString());
			return 0;
		}
		console.log(apr.toString())
		const apy = this.aprToApy(apr.toString())
		 if (poolAddress === '0x53A2D1db049b5271c6b6dB020dBa0e8A7C4Eb90d') {
		 	console.log(rewardForPeriod, cakeForPeriod, tvl, apr.toString(), apy)
		 	console.log('0x53A2D1db049b5271c6b6dB020dBa0e8A7C4Eb90d0x53A2D1db049b5271c6b6dB020dBa0e8A7C4Eb90d0x53A2D1db049b5271c6b6dB020dBa0e8A7C4Eb90d')
		 }
		console.log(apy)

		return apy;
	}


	async getTokenCakeRate(poolAddr, defaultAmountIn='1000000000') {

		if (this.poolsInfo[poolAddr]['rewardToken'] === CAKE_ADDRESS) {
			return 1
		}

		const contract = this.getContract(this.poolsInfo[poolAddr]['abi'], poolAddr)

		let res = await contract.methods.userInfo(process.env.BOT_ADDRESS).call()
		let amountIn

		if (res[0] === '0') {
			amountIn = new BigNumber(defaultAmountIn)
		}
		else {
			amountIn = new BigNumber(res[0])
		}

		// TODO: check and verify calculations
		res = await this.routerV2Contract.methods.getAmountsOut(amountIn, this.poolsInfo[poolAddr]['routeToCake']).call()
		return (new BigNumber(res[res.length-1]).dividedBy(res[0])).toString()
	}

	async poolApy(poolAddr) {

		const poolTvl = await this.getPoolTvl(poolAddr)
		const tokenCakeRate = await this.getTokenCakeRate(poolAddr)
		return this.calcApy(this.poolsInfo[poolAddr]['rewardPerBlock'], tokenCakeRate, poolTvl, poolAddr)
	}

	async setActivePools() {

		const blockNum = await this.web3.eth.getBlockNumber()
		let bonusEndBlock

		for (const poolAddr of Object.keys(this.poolsInfo)) {

			bonusEndBlock = this.poolsInfo[poolAddr]['bonusEndBlock']
			debug(`bonusEndBlock=${bonusEndBlock}, blockNum=${blockNum}`)
			if ((bonusEndBlock <= blockNum) || (poolAddr in this.EXCLUDED_POOLS) || (this.poolsInfo[poolAddr]['hasUserLimit'] === true)) {
				this.poolsInfo[poolAddr]['active'] = false
				await this.savePoolsInfo()
			}
		}

	}

	async updatePoolsApy() {

		for (const poolAddr of Object.keys(this.poolsInfo)) {
			debug('poolAddr=', poolAddr)
			this.poolsInfo[poolAddr]['apy'] = await this.poolApy(poolAddr)
		}
	}

	async getLastBlockUpdate() {

		const blockNum = await this.web3.eth.getBlockNumber()
		let reply = await this.redisClient.get('lastBlockUpdate')

		if (reply == null) {
			reply = blockNum - this.PAST_EVENTS_N_BLOCKS
			debug(`reply was set to ${reply}`)
		}

		this.lastBlockUpdate = reply
		debug(`lastBlockUpdate was set to ${this.lastBlockUpdate}`)

	}

	async getPoolsInfo() {

		let reply = await this.redisClient.get('poolsInfo')

		if (this.lastBlockUpdate == null) {
			throw Error(`lastBlockUpdate should be != null`)
		}

		if (reply == null) {
			debug('setting poolInfo to null...')
			this.poolsInfo = {}
			return
		}

		this.poolsInfo = JSON.parse(reply)
	}

	async savePoolsInfo(lastBlockUpdate) {

		this.lastBlockUpdate = lastBlockUpdate
		await this.redisClient.set('lastBlockUpdate', this.lastBlockUpdate)
		await this.redisClient.set('poolsInfo', JSON.stringify(this.poolsInfo))

		console.log('pools info updated successfully')
	}

	async fetchAbi(addr) {

		const bscscanAbiUrl =  `https://api.bscscan.com/api?module=contract&action=getabi&address=${addr}&apiKey=${process.env.BSCSCAN_API_KEY}`
		const data = await nodeFetch(bscscanAbiUrl).then(response => response.json())
		return JSON.parse(data.result)
	}

    async fetchPools() {

		debug('fetchPools ... ')

		if (this.paused) {
			return;
		}
		let blockNum = await this.web3.eth.getBlockNumber()

		if (this.lastBlockUpdate == null) {
			throw Error('lastBlockUpdate should be set')
		}

        if (this.lastBlockUpdate === blockNum) {

			console.log(`fetchPools: nothing to fetch, lastBlockUpdate (${this.lastBlockUpdate}) >= blockNum (${blockNum})`)
			return

		} else if (this.lastBlockUpdate > blockNum) {

			this.notif(`[WARNING] lastBlockUpdate (${this.lastBlockUpdate}) > blockNum (${blockNum})`)
			return
		}

		const fetchNBlocks = blockNum - this.lastBlockUpdate

        let events = await getPastEventsLoop(this.smartchefFactoryContract, 'NewSmartChefContract', fetchNBlocks, blockNum)
        // let events = await getPastEventsLoop(this.smartchefFactoryContract, 'NewSmartChefContract', 1, 9676518) // 9676510, TODO : remove me dbg only

        let symbol

        for (const event of events) {
            let poolAddr = event['returnValues']['smartChef']
            let abi = await this.fetchAbi(poolAddr)
            let contract = this.getContract(abi, poolAddr)
            let rewardToken = await contract.methods.rewardToken().call()
            let stakedToken = await contract.methods.stakedToken().call()
            let hasUserLimit = await contract.methods.hasUserLimit().call()
            let rewardPerBlock = await contract.methods.rewardPerBlock().call()
            let bonusEndBlock = await contract.methods.bonusEndBlock().call()

            debug(`poolAddr=${poolAddr}, bonusEndBlock=${bonusEndBlock}, rewardToken=${rewardToken}, stakedToken=${stakedToken}, hasUserLimit=${hasUserLimit}, ${hasUserLimit === true}`)

            if (stakedToken !== CAKE_ADDRESS) {
                continue
            }

            try {
                contract = this.getContract(await this.fetchAbi(rewardToken), rewardToken)
                symbol = await contract.methods.symbol().call()

            } catch (e) {
                this.notif.sendDiscord(`failed to fetch rewardToken (${rewardToken}): ${e}, trying fetch with bep-20 abi ...`)

                contract = this.getContract(BEP_20_ABI, rewardToken)
                symbol = await contract.methods.symbol().call()
                this.notif.sendDiscord(`succeeded fetching (${rewardToken}) info`)
            }

            debug(poolAddr, symbol, rewardToken, stakedToken)

            this.poolsInfo[poolAddr] = {
                'rewardToken': rewardToken,
                'rewardSymbol': symbol,
                'hasUserLimit': hasUserLimit,
                'rewardPerBlock': rewardPerBlock,
                'bonusEndBlock': bonusEndBlock,
                'abi': abi,
                'routeToCake': [rewardToken, BNB_ADDRESS, CAKE_ADDRESS],
                'active': true, // default will be set to false on setActivePools
            }
        }

		await this.savePoolsInfo(blockNum)
    }
}


module.exports = {
    Pancakeswap,
};
