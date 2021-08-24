const {getPastEventsLoop} = require('../bscFetcher')
const {SMARTCHEF_FACTORY_ABI, CAKE_ABI, PANCAKESWAP_FACTORY_V2_ABI, BEP_20_ABI} = require('../abis')
const {SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS, BNB_ADDRESS,
	PANCAKESWAP_FACTORY_V2_ADDRESS, VERSION,
	MAX_TX_FAILURES, DEADLINE_SEC, MIN_SEC_BETWEEN_REBALANCE
} = require('./params')

const BigNumber = require('bignumber.js')
BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})

class Tokens {
    // BASES_TO_CHECK_TRADES_AGAINST = {}

    BasesForTradeRoutes = {

    }

   Tokens = {

   }


}



class Trade {

    constructor(config) {


    }

    static async getSwapRoute(from, to) {

        return {route}
    }

    static async estimateBestSwap(from, to, amountIn) {


        return {route, amountOut}
    }

    static async getPrice(tokenA, tokenB) {

    }





}


class Syrup {


    async init(){

    }


    async update() {

    }

    getPoolsInfo(){

    }

    getPoolInfo(poolAddress) {

    }



}



const debug = (...messages) => console.log(...messages);
const {TransactionFailure, FatalError, GasError, NotImplementedError} =  require('../errors');

class PancakeswapEnvironment {

    constructor(config, redisClient, web3, notif) {

        this.trade = new Trade(config);
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
        // const this.psListener.getPoolsInfo();

    }




}


class PancakeswapListener {

	SEC_PER_HOUR = 3600
	AVG_BLOCK_SEC = 3
	SECONDS_PER_DAY = this.SEC_PER_HOUR * 24
	BLOCKS_PER_DAY = this.SECONDS_PER_DAY / this.AVG_BLOCK_SEC
	BLOCKS_PER_YEAR = this.BLOCKS_PER_DAY * 365

	PAST_EVENTS_N_DAYS = 3 // TODO: change to 60
	PAST_EVENTS_N_BLOCKS = Math.floor(this.PAST_EVENTS_N_DAYS * this.BLOCKS_PER_DAY)

    constructor(config, redisClient, web3, notif) {
        this.redisClient = redisClient;
        this.pancakeUpdateInterval = config.pancakeUpdateInterval;
        this.intervalId = null;
        this.lastUpdate = null;
        this.web3 = web3
        this.notif = notif

        this.poolsInfo = {}
    }

	async init() {
		this.smartchefFactoryContract = await this.getContract(SMARTCHEF_FACTORY_ABI, SMARTCHEF_FACTORY_ADDRESS)
		this.cakeContract = await this.getContract(CAKE_ABI, CAKE_ADDRESS)
		this.swapFactoryContract = await this.getContract(PANCAKESWAP_FACTORY_V2_ABI, PANCAKESWAP_FACTORY_V2_ADDRESS)

		await this.getPoolsInfo()
		await this.fetchPools();
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

            await this.fetchNewPools()


            // this.redisClient.hmset('pancakeswap.env.poolsInfo', poolsInfo);

            // this.redisClient.hmset('lastUpdate', {'blockNumber': blockNumber, 'timestamp': timestamp});

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

	async getTokenCakeRate(tokenAddr) {
		// TODO: swap path
		throw NotImplementedError
	}

	async poolApy(poolAddr) {
		const poolTvl = this.getPoolTvl(poolAddr)
		const tokenCakeRate = await this.getTokenCakeRate(poolAddr['rewardToken'])
		return this.calcApy(this.poolsInfo[poolAddr]['rewardPerBlock'], tokenCakeRate, poolTvl)
	}

	async updatePoolsApy() {

		for (const poolAddr of Object.keys(this.poolsInfo)) {
			this.poolsInfo[poolAddr]['apy'] = await this.poolApy(poolAddr)
		}
	}

	async fetchNewPools() {

	}

	async getPoolsInfo() {

		this.redisClient.hgetall('poolsInfo', async (err, reply) => {

			if (err) throw err
			debug(`poolsInfo=${JSON.stringify(reply)}`)

			if (reply == null || !('lastBlockUpdate' in reply)) {
				let blockNum = await this.web3.eth.getBlockNumber()
				this.poolsInfo['lastBlockUpdate'] = blockNum - this.PAST_EVENTS_N_BLOCKS
				return
			}

			this.poolsInfo = reply

		})

	}

	async setPoolsInfo(lastBlockUpdate) {

		this.poolsInfo['lastBlockUpdate'] = lastBlockUpdate
		this.redisClient.hmset('poolsInfo', this.poolsInfo)
	}

    async fetchPools(fetchNBlocks=this.PAST_EVENTS_N_BLOCKS) {

		let blockNum = await this.web3.eth.getBlockNumber()

        if (this.poolsInfo['lastBlockUpdate'] >= blockNum) {

			console.log(`fetchPools: nothing to fetch, lastBlockUpdate (${this.poolsInfo['lastBlockUpdate']}) >= blockNum (${blockNum})`)
			return
		}

        let events = await getPastEventsLoop(this.smartchefFactoryContract, 'NewSmartChefContract', fetchNBlocks, this.poolsInfo['lastBlockUpdate']+1)
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

            debug(`rewardToken=${rewardToken}, stakedToken=${stakedToken}, hasUserLimit=${hasUserLimit}, ${hasUserLimit === true}`)

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

            debug(symbol, rewardToken, stakedToken)

            // TODO: getRoute reward->cake sub-opt
            const routeToCake = this.getRoute(rewardToken, CAKE_ADDRESS);

            this.poolsInfo[poolAddr] = {
                'rewardToken': rewardToken,
                'rewardSymbol': symbol,
                'hasUserLimit': hasUserLimit,
                'rewardPerBlock': rewardPerBlock,
                'abi': abi,
                'routeToCake': [rewardToken, BNB_ADDRESS, CAKE_ADDRESS]
            };

			await this.setPoolsInfo()
        }
    }
}


module.exports = {
    PancakeswapEnvironment,
};
