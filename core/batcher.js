const {Action} = require("./policy");
const {TxManager} = require("./txManager");
const {
    CAKE_ADDRESS, MASTER_CHEF_ADDRESS, ROUTER_ADDRESS,
} = require('./params')
const {DO_HARD_WORK_BATCH_SIZE} = require('../config')

const {
    MASTERCHEF_ABI,
    CAKE_ABI,
    ROUTER_V2_ABI,
} = require('../abis')

const {Logger} = require('../logger')
const logger = new Logger('batcher')
const {assert} = require('../helpers')

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

		let startIndex = workerIndices[0]
		let endIndex
		let nWorkersToProcess = workerIndices.length

		while (true) {

			endIndex = Math.min(startIndex + DO_HARD_WORK_BATCH_SIZE, startIndex + nWorkersToProcess)
			if (endIndex !== workerIndices[endIndex-1]+1) {
				endIndex = startIndex + 1
			}

			nWorkersToProcess -= (endIndex-startIndex)

			assert (startIndex < endIndex, `startIndex = ${startIndex} is expected to be smaller than endIndex = ${endIndex}`)

			await this.worker(startIndex, endIndex, action)

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

            switch (action.name) {

                case Action.NO_OP:
                    break;

                case Action.ENTER:
                    await this.enterPosition(startIndex, endIndex, action.to.address);
                    break;

                case Action.HARVEST:
                    await this.harvest(startIndex, endIndex, action.to.address, action.from.routeToCake);
                    break;

                case Action.EXIT:
                    await this.exitPosition(startIndex, endIndex, action.from.address, action.from.routeToCake);
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

    async enterPosition(startIndex, endIndex, addr) {
        logger.debug(`batcher.enterPosition: start pool ${addr} `);

		let withdraw=false, swap=false, deposit=true, stakedPoolAddr=addr, newPoolAddr=addr, amount=0;
		let multiplier = 0, path = [], deadline = 0;
		let swapParams = [ROUTER_ADDRESS, multiplier, path, deadline];

		let estimatedGas = 2 * (await this.contractManager.methods.doHardWork([withdraw, swap, deposit, stakedPoolAddr, newPoolAddr, amount, startIndex, endIndex, swapParams]).estimateGas())
		console.log(`estimatedGas: ${estimatedGas}`)

		const tx = this.contractManager.methods.doHardWork([withdraw, swap, deposit, stakedPoolAddr, newPoolAddr, amount, startIndex, endIndex, swapParams]).encodeABI();
		const res = await this.sendTransactionWait(tx, this.contractManager.options.address, estimatedGas)

		logger.info(`enterPosition: `)
		console.log(res)

        logger.debug("batcher.enterPosition: end");
    }

    async exitPosition(startIndex, endIndex, addr, routeToCake) {
        logger.debug(`batcher.exitPosition: exit pool ${addr}`);

		let withdraw=true, swap=true, deposit=false, stakedPoolAddr=addr, newPoolAddr=addr, amount=1; // amount - any value which is not 0 to withdraw all, 0 to take rewards only
		let multiplier = 0, deadline = Date.now() + this.swapTimeLimit; // TODO: multiplier
		let swapParams = [ROUTER_ADDRESS, multiplier, routeToCake, deadline];

		let estimatedGas = 2 * (await this.contractManager.methods.doHardWork([withdraw, swap, deposit, stakedPoolAddr, newPoolAddr, amount, startIndex, endIndex, swapParams]).estimateGas())
		console.log(`estimatedGas: ${estimatedGas}`)

		const tx = this.contractManager.methods.doHardWork([withdraw, swap, deposit, stakedPoolAddr, newPoolAddr, amount, startIndex, endIndex, swapParams]).encodeABI();
		const res = await this.sendTransactionWait(tx, this.contractManager.options.address, estimatedGas)

		logger.info(`exitPosition: `)
		console.log(res)
        logger.debug("batcher.exitPosition: end");
    }

    async harvest(startIndex, endIndex, addr, routeToCake) {
        logger.debug(`batcher.harvest: pool ${addr}`);

		let withdraw=true, swap=true, deposit=true, stakedPoolAddr=addr, newPoolAddr=addr, amount=0;
		let multiplier = 0, deadline = Date.now() + this.swapTimeLimit;
		let swapParams = [ROUTER_ADDRESS, multiplier, routeToCake, deadline];

		let estimatedGas = 2 * (await this.contractManager.methods.doHardWork([withdraw, swap, deposit, stakedPoolAddr, newPoolAddr, amount, startIndex, endIndex, swapParams]).estimateGas())
		console.log(`estimatedGas: ${estimatedGas}`)

		const tx = this.contractManager.methods.doHardWork([withdraw, swap, deposit, stakedPoolAddr, newPoolAddr, amount, startIndex, endIndex, swapParams]).encodeABI();
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
