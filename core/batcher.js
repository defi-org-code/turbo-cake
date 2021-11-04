const {Action} = require("./policy");
const {TxManager} = require("./txManager");
const {
    CAKE_ADDRESS, MASTER_CHEF_ADDRESS, ROUTER_ADDRESS,
} = require('./params')
const {DO_HARD_WORK_BATCH_SIZE, RunningMode, DEV_RAND_BATCHER_FAILURES} = require('../config')

const {
    MASTERCHEF_ABI,
    CAKE_ABI,
    ROUTER_V2_ABI,
} = require('../abis')

const {Logger} = require('../logger')
const logger = new Logger('batcher')
const {assert, getRandomInt, getWorkerEndIndex} = require('../helpers')

const BigNumber = require('bignumber.js')
BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})


class Batcher extends TxManager {

    constructor(args) {
    	super(args.web3, args.account)
        this.name = "pancakeswap-batcher";
        this.web3 = args.web3;
        this.notif = args.notifClient;
        this.account = args.account;
        this.contractManager = args.contractManager;
        this.swapSlippage = args.swapSlippage;
        this.swapTimeLimit = args.swapTimeLimit;
		this.redisClient = args.redisClient;
		this.runningMode = args.runningMode
        this.execCache = {};
        this.trace = [];
        this.result = null;
        this.onSuccessCallback = null;
        this.onFailureCallback = null;
        this.successCnt = 0;
        this.workersCnt = 0;
        this.totalWorkers = 0;

        this.cakeContract = new this.web3.eth.Contract(
            CAKE_ABI,
            CAKE_ADDRESS);

        this.masterchefContract = new this.web3.eth.Contract(
            MASTERCHEF_ABI,
            MASTER_CHEF_ADDRESS
        );

        this.router = new this.web3.eth.Contract(
            ROUTER_V2_ABI,
            ROUTER_ADDRESS);
    }

	// async init(toAddr) {
	// 	await this.run({startIndex: 0, endIndex: 7, name: Action.ENTER, to: {address: toAddr}})
	// }

	async run(action) {

		console.log("batcher.run: start");

		const workerIndices = action.workerIndices

        this.workersCnt = 0
        this.totalWorkers = workerIndices.length
        this.successCnt = 0

		let startIndex = 0
		let endIndex
		let nWorkersToProcess = workerIndices.length

		while (true) {

			endIndex = getWorkerEndIndex(workerIndices, startIndex, DO_HARD_WORK_BATCH_SIZE, nWorkersToProcess)

			logger.info(`startIndex=${startIndex}, endIndex=${endIndex}, nWorkersToProcess=${nWorkersToProcess}`)

			nWorkersToProcess -= (endIndex-startIndex)

			assert (startIndex < endIndex, `startIndex = ${startIndex} is expected to be smaller than endIndex = ${endIndex}`)

			await this.worker(workerIndices[startIndex], workerIndices[endIndex-1]+1, action)

			if (nWorkersToProcess <= 0) {
				break
			}

			startIndex = endIndex
		}
	}

    async worker(startIndex, endIndex, action) {

        logger.debug(`batcher.worker startIndex=${startIndex}, endIndex=${endIndex}: action: `);
        console.log(action)

        try {

			if ((this.runningMode === RunningMode.DEV) && (DEV_RAND_BATCHER_FAILURES !== 0)) {
				assert (getRandomInt(DEV_RAND_BATCHER_FAILURES) === 0, `worker: simulating random failure`)
			}

            switch (action.name) {

                case Action.NO_OP:
                    break;

                case Action.ENTER:
                    await this.enterPosition(action.to.address, startIndex, endIndex);
                    break;

                case Action.HARVEST:
                    await this.harvest(action.from.address, startIndex, endIndex);
                    break;

                case Action.EXIT:
                    await this.exitPosition(action.from.address, startIndex, endIndex);
                    break;

                default:
                    return this.invalidAction();
            }

            this.successCnt += (endIndex-startIndex);
            logger.debug("batcher.run: action completed successfully");

        } catch (err) {
            this.handleExecutionError(err);

        } finally {
            await this.handleExecutionResult(startIndex, endIndex);
        }
    }

    async enterPosition(addr, startIndex, endIndex) {
        logger.debug(`batcher.enterPosition: start pool ${addr} `);

		let estimatedGas = 2 * (await this.contractManager.methods.depositCake(addr, startIndex, endIndex).estimateGas())
		console.log(`estimatedGas: ${estimatedGas}`)

		const tx = this.contractManager.methods.depositCake(addr, startIndex, endIndex).encodeABI();
		const res = await this.sendTransactionWait(tx, this.contractManager.options.address, estimatedGas)

		logger.info(`enterPosition: `)
		console.log(res)

        logger.debug("batcher.enterPosition: end");
    }

    async exitPosition(addr, startIndex, endIndex) {
        logger.debug(`batcher.exitPosition: exit pool ${addr}`);

		let estimatedGas = 2 * (await this.contractManager.methods.withdrawCakeDeposit(addr, startIndex, endIndex).estimateGas())
		console.log(`estimatedGas: ${estimatedGas}`)

		const tx = this.contractManager.methods.withdrawCakeDeposit(addr, startIndex, endIndex).encodeABI();
		const res = await this.sendTransactionWait(tx, this.contractManager.options.address, estimatedGas)

		logger.info(`exitPosition: `)
		console.log(res)
        logger.debug("batcher.exitPosition: end");
    }

    async harvest(addr, startIndex, endIndex) {
        logger.debug(`batcher.harvest: pool ${addr}`);

		let estimatedGas = 2 * (await this.contractManager.methods.claimRewards(addr, startIndex, endIndex).estimateGas())
		console.log(`estimatedGas: ${estimatedGas}`)

		const tx = this.contractManager.methods.claimRewards(addr, startIndex, endIndex).encodeABI();
		const res = await this.sendTransactionWait(tx, this.contractManager.options.address, estimatedGas)

		logger.info(`harvest: `)
		console.log(res)
        logger.debug("batcher.harvest: end");
    }

    invalidAction() {
        return Promise.resolve(undefined);
    }

    async onSuccess(trace) {
        if (this.onSuccessCallback != null) {
            await this.onSuccessCallback(trace);
        }
    }

    async onFailure(trace) {
        if (this.onFailureCallback != null) {
            await this.onFailureCallback(trace);
        }
    }

    on(event, cb) {
        if (event === "success") {
            this.onSuccessCallback = cb;
        }
        if (event === "failure") {
            this.onFailureCallback = cb;
        }
    }

	handleExecutionError(err) {
        this.notif.sendDiscord(err);
    }

    async handleExecutionResult(startIndex, endIndex) {
		this.workersCnt += (endIndex-startIndex)
		logger.info(`handleExecutionResult: startIndex=${startIndex}, endIndex=${endIndex}, workersCnt=${this.workersCnt}, totalWorkers=${this.totalWorkers}`)

		if (this.workersCnt === this.totalWorkers) {

			if (this.successCnt === this.totalWorkers) {
				await this.onSuccess(this.trace);
			}
			else {
				await this.onFailure(this.trace);
			}
		}
    }
}


module.exports = {
    Batcher: Batcher,
};
