const {Action} = require("./policy");
const {TxManager} = require("./txManager");
const {
    SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS, MASTER_CHEF_ADDRESS, WBNB_ADDRESS, ROUTER_ADDRESS,
} = require('./params')

const {
    MASTERCHEF_ABI,
    SMARTCHEF_INITIALIZABLE_ABI,
    CAKE_ABI,
    BEP_20_ABI,
    ROUTER_V2_ABI,
} = require('../abis')
const {TransactionFailure, FatalError, GasError, NotImplementedError} = require('../errors');

const {Logger} = require('../logger')
const logger = new Logger('batcher')

const SyrupPoolType = {
    MANUAL_CAKE: "masterchef",
    SMARTCHEF: "smartchef",
    OTHER: "unsupported",
}

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

	async run(action) {

		console.log("batcher.run: start");

        this.workersCnt = 0
        this.totalWorkers = action.endIndex - action.startIndex
        this.successCnt = 0

		for (let i=action.startIndex; i < action.endIndex; i++) {
			console.log(`batcher.run: start worker ${i}`);
			// setTimeout(async () => await this.worker(action), 0)
			await this.worker(i, action)
		}

	}

    async worker(workerIndex, action) {

        logger.debug(`batcher.worker[${workerIndex}]: action: `);
        console.log(action)

        try {

            switch (action.name) {

                case Action.NO_OP:
                    break;

                case Action.ENTER:
                    await this.enterPosition(workerIndex, workerIndex+1, action.to.address);
                    break;

                case Action.HARVEST:
                    await this.harvest(workerIndex, workerIndex+1, action.to.address, action.from.routeToCake);
                    break;

                case Action.EXIT:
                    await this.exitPosition(workerIndex, workerIndex+1, action.from.address, action.from.routeToCake);
                    break;

                default:
                    return this.invalidAction();
            }

            this.successCnt += 1;
            logger.debug("batcher.run: action completed successfully");

        } catch (err) {
            this.handleExecutionError(err);

        } finally {
            await this.handleExecutionResult(workerIndex);
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

    async withdraw(syrupPool, amount) {
        logger.debug(`batcher.withdraw: from pool ${syrupPool.options.address} type ${SyrupPoolType.SMARTCHEF} the amount ${amount}`);

        const result = {
            step: "withdraw",
            poolAddress: syrupPool.options.address,
            amount: amount,
            syrupType: syrupPool.syrupType,
            rewardTokenAddr: null,
            receipt: null,
        };

        let tx;
        let gas;

        if (syrupPool.syrupType === SyrupPoolType.SMARTCHEF) {
            result.rewardTokenAddr = await syrupPool.methods.rewardToken().call();
            tx = await syrupPool.methods.withdraw(amount).encodeABI();
            gas = await syrupPool.methods.withdraw(amount).estimateGas();

        } else if (syrupPool.syrupType === SyrupPoolType.MANUAL_CAKE) {
            result.rewardTokenAddr = CAKE_ADDRESS;
            tx = await syrupPool.methods.leaveStaking(amount).encodeABI();
            gas = await syrupPool.methods.leaveStaking(amount).estimateGas();
        }

        result.receipt = await this.sendTransactionWait(tx, syrupPool.options.address, gas);
        this.trace.push(result);

        return result;
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

    async handleExecutionResult(workerIndex) {
		this.workersCnt += 1
		logger.info(`handleExecutionResult: workerIndex ${workerIndex}, totalWorkers=${this.totalWorkers}`)

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
