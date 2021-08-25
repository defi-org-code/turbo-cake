const {getPastEventsLoop} = require('../bscFetcher')
const {SMARTCHEF_FACTORY_ABI, CAKE_ABI, BEP_20_ABI, ROUTER_V2_ABI} = require('../abis')
const {SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS, BNB_ADDRESS, ROUTER_V2_ADDRESS} = require('./params')
const nodeFetch = require("node-fetch")

require('dotenv').config();

const BigNumber = require('bignumber.js')
BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})

const debug = (...messages) => console.log(...messages);
const {NotImplementedError} =  require('../errors');

class PancakeswapEnvironment {

    constructor(config, redisClient, web3, notif) {

        this.redisClient = redisClient;
        this.psListener = new PancakeswapListener(config, redisClient, web3, notif);

    }

    async init() {
        this.psListener.redisClient = this.redisClient;
        await this.psListener.init()
        await this.psListener.listen();
    }


    async update() {
        await this.psListener.update();
    }

}


class PancakeswapListener {

	SEC_PER_HOUR = 3600
	AVG_BLOCK_SEC = 3
	SECONDS_PER_DAY = this.SEC_PER_HOUR * 24
	BLOCKS_PER_DAY = this.SECONDS_PER_DAY / this.AVG_BLOCK_SEC
	BLOCKS_PER_YEAR = this.BLOCKS_PER_DAY * 365

	PAST_EVENTS_N_DAYS = 2 // TODO: change to 60
	PAST_EVENTS_N_BLOCKS = Math.floor(this.PAST_EVENTS_N_DAYS * this.BLOCKS_PER_DAY)

    constructor(config, redisClient, web3, notif) {
        this.redisClient = redisClient;
        this.pancakeUpdateInterval = config.pancakeUpdateInterval;
        this.intervalId = null;
        this.lastUpdate = null;
        this.web3 = web3
        this.notif = notif

        this.poolsInfo = {}
        this.lastBlockUpdate = null
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

    async listen() {
        if (this.intervalId != null) {
            clearInterval(this.intervalId);
        }

        if (this.lastUpdate == null) {
            // this.lastUpdate = await this.redisClient.hgetall('pancakeswap.env.lastUpdate');
        }

		// TODO: ami disabled
        // this.interval = setInterval(async () => {
        //     await this.update();}, this.pancakeUpdateInterval);

        await this.update();
    }


    async update() {

        try {
            if (this.lastUpdate != null && Date.now() - this.lastUpdate.timestamp < this.pancakeUpdateInterval) {
                return;
            }

			debug('poolsInfo:', this.poolsInfo)
			// process.exit()
			await this.fetchPools();

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
		return await this.cakeContract.methods.balanceOf(addr)
	}

	aprToApy(apr, n=365, t=1.0) {
		return 100 * ((1 + apr / 100 / n) ** (n*t) - 1)
	}

	async calcApy(rewardsPerBlock, tokenCakeRate, tvl) {

		const rewardForPeriod = this.BLOCKS_PER_YEAR * rewardsPerBlock
		const cakeForPeriod = rewardForPeriod * tokenCakeRate //* (1 - this.FEE)
		const apr = this.changePct(tvl, tvl + cakeForPeriod)

		return this.aprToApy(apr)
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

		const amountOutMin = 0

		debug('amountIn: ', amountIn)
		const path = this.poolsInfo[poolAddr]['routeToCake']
		const deadline = Date.now() + 3600
		debug(amountIn, amountOutMin, path, process.env.BOT_ADDRESS, deadline)
		// res = await this.routerV2Contract.methods.swapExactTokensForTokens(amountIn, amountOutMin, path, process.env.BOT_ADDRESS, deadline).call({from: process.env.BOT_ADDRESS})
		// const factory = '0xca143ce32fe78f1f7019d7d551a6402fc5350c73'
		res = await this.routerV2Contract.methods.getAmountsOut(amountIn, path).call()

		debug(res)
		debug((new BigNumber(res[res.length-1]).dividedBy(res[0])).toString())
		process.exit()
		return (new BigNumber(res[res.length-1]).dividedBy(res[0])).toString()
	}

	async poolApy(poolAddr) {
		const poolTvl = this.getPoolTvl(poolAddr)
		const tokenCakeRate = await this.getTokenCakeRate(poolAddr)
		return this.calcApy(this.poolsInfo[poolAddr]['rewardPerBlock'], tokenCakeRate, poolTvl)
	}

	// TODO: remove old pools from poolsInfo
	async removeOldPools() {
		throw NotImplementedError
	}

	async updatePoolsApy() {

		for (const poolAddr of Object.keys(this.poolsInfo)) {
			debug('poolAddr=', poolAddr)
			this.poolsInfo[poolAddr]['apy'] = await this.poolApy(poolAddr)
		}
	}

	async getLastBlockUpdate() {

		const blockNum = await this.web3.eth.getBlockNumber()
		await this.redisClient.get('lastBlockUpdate', (err, reply) => {

			if (err) throw err

			if (reply == null) {
				reply = blockNum - this.PAST_EVENTS_N_BLOCKS
				debug(`reply was set to ${reply}`)
			}

			this.lastBlockUpdate = reply
			debug(`lastBlockUpdate was set to ${this.lastBlockUpdate}`)

		})
	}

	async getPoolsInfo() {

		await this.redisClient.get('poolsInfo', async (err, reply) => {

			if (err) throw err

			if (this.lastBlockUpdate == null) {
				throw Error(`lastBlockUpdate should be != null`)
			}

			if (reply == null) {
				debug('setting poolInfo to null...')
				this.poolsInfo = {}
				return
			}

			this.poolsInfo = JSON.parse(reply)
		})
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

            debug(`poolAddr=${poolAddr}, rewardToken=${rewardToken}, stakedToken=${stakedToken}, hasUserLimit=${hasUserLimit}, ${hasUserLimit === true}`)

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
                'abi': abi,
                'routeToCake': [rewardToken, BNB_ADDRESS, CAKE_ADDRESS]
            }
        }

		await this.savePoolsInfo(blockNum)
    }
}


module.exports = {
    PancakeswapEnvironment,
};
