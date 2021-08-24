


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



const redis = require("redis");
const debug = (...messages) => console.log(...messages);
const {TransactionFailure, FatalError, GasError, NotImplementedError} =  require('../errors');

class PancakeswapEnvironment {

    constructor(config, redisClient) {

        this.trade = new Trade(config);
        this.redisClient = redisClient;
        this.psListener = new PancakeswapListener(config, redisClient);

    }

    async init() {
        this.psListener.redisClient = this.redisClient;
        await this.psListener.listen();

    }


    async update() {
        await this.psListener.update();
        // const this.psListener.getPoolsInfo();

    }




}


class PancakeswapListener {

    constructor(config, redisClient) {
        this.redisClient = redisClient;
        this.pancakeUpdateInterval = config.pancakeUpdateInterval;
        this.intervalId = null;
        this.lastUpdate = null;
    }

    async listen() {
        if (this.intervalId != null) {
            clearInterval(this.intervalId);
        }

        if (this.lastUpdate == null) {
            // this.lastUpdate = await this.redisClient.hgetall('pancakeswap.env.lastUpdate');
        }

        this.interval = setInterval(async () => {
            await this.update();}, this.pancakeUpdateInterval);

        await this.update();
    }


    async update() {
        try {
            if (this.lastUpdate != null && Date.now() - this.lastUpdate.timestamp < this.pancakeUpdateInterval) {
                return;
            }
            const {poolsInfo, blockNumber, timestamp} = await this.fetchPoolsInfo();


            this.redisClient.hmset('pancakeswap.env.poolsInfo', poolsInfo);

            this.redisClient.hmset('lastUpdate', {'blockNumber': blockNumber, 'timestamp': timestamp});

        } catch (e) {
            console.log("Error updating pancakeswap.env.poolsInfo");
            console.error(e);
        }
    }

    async fetchPools(blockNum=null, fetchNBlocks=this.PAST_EVENTS_N_BLOCKS) {

        if (blockNum === null) {
            blockNum = await web3.eth.getBlockNumber()
        }

        // TODO: fetch from redis last block and fetch only last missing blocks

        // TODO: store on redis
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
                'routeToCake': routeToCake
            };
            // TODO: store redis


        }
    }


    async fetchPoolsInfo() {

        const poolsInfo = {};
        const blockNumber = 0;
        const timestamp = 0;

        // const pools = await this.fetchPools();
        return { poolsInfo, blockNumber, timestamp };
    }
}


module.exports = {
    PancakeswapEnvironment,
};
