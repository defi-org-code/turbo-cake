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
        this.status = "start";
        this.execCache = {};
        this.trace = [];
        this.result = null;
        this.onSuccessCallback = null;
        this.onFailureCallback = null;

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
		setTimeout(async () => await this.worker(action), 0)
	}

    async worker(action) {

        logger.debug("batcher.worker: start");

        try {
            this.status = "running";

            switch (action.name) {

                case Action.NO_OP:
                    this.status = null;
                    break;

                case Action.ENTER:
                    await this.enterPosition(action.to.address);
                    break;

                case Action.HARVEST:
                    await this.harvest(action.to.address);
                    break;

                case Action.EXIT:
                    await this.exitPosition(action.from.address);
                    break;

                default:
                    return this.invalidAction();
            }

            this.status = "success";
            logger.debug("batcher.run: action completed successfully");

        } catch (err) {
            this.handleExecutionError(err);

        } finally {
            await this.handleExecutionResult();
        }
    }

	async cakeBalance() {
		return (new BigNumber(this.balance.staked)).plus(this.balance.unstaked).toString()
	}

    async enterPosition(addr, startIndex, endIndex) {
        logger.debug(`batcher.enterPosition: start pool ${addr} `);

		let withdraw=false, swap=false, deposit=true, stakedPoolAddr=null, newPoolAddr=addr, amount=0;
		let swapRouter=null, multiplier=0, path=null, deadline=0; // Date.now() + this.swapTimeLimit;
		let swapParams = [swapRouter, multiplier, path, deadline];

		const tx = this.contractManager.methods.doHardWork([withdraw, swap, deposit, stakedPoolAddr, newPoolAddr, amount, startIndex, endIndex, swapParams]).encodeABI();
		const res = await this.sendTransactionWait(tx, this.manager.options.address)

		logger.info(`enterPosition: `)
		console.log(res)

        logger.debug("batcher.enterPosition: end");
    }

    async exitPosition(addr) {
        logger.debug(`batcher.exitPosition: start pool ${addr}`);


		let withdraw=true, swap=true, deposit=false, stakedPoolAddr=addr, newPoolAddr=null, amount;
		let swapRouter=null, multiplier=0, path=null, deadline=0; // Date.now() + this.swapTimeLimit;
		let swapParams = [swapRouter, multiplier, path, deadline];

        amount = await this.getStakedAmount(syrupPool, this.account.address);

		const tx = this.contractManager.methods.doHardWork([withdraw, swap, deposit, stakedPoolAddr, newPoolAddr, amount, startIndex, endIndex, swapParams]).encodeABI();
		const res = await this.sendTransactionWait(tx, this.manager.options.address)

		logger.info(`exitPosition: `)
		console.log(res)


        const syrupPool = await this.setupSyrupPool(addr);
        const stakedAmount = await this.getStakedAmount(syrupPool, this.account.address);
        const withdrawn = await this.withdraw(syrupPool, stakedAmount);
        await this.swapAllToCake(withdrawn.rewardTokenAddr);

        logger.debug("batcher.exitPosition: end");
    }

    async harvest(addr) {
        logger.debug(`batcher.harvest: start pool ${addr}`);

        const syrupPool = await this.setupSyrupPool(addr);
        const withdrawn = await this.withdraw(syrupPool, 0);
        await this.swapAllToCake(withdrawn.rewardTokenAddr);
        const cakeBalance = await this.cakeContract.methods.balanceOf(this.account.address).call();
        await this.depositCake(syrupPool, cakeBalance);

        logger.debug("batcher.harvest: end");
    }

    async switchPools(fromAddr, toAddr) {
        logger.debug(`batcher.switchPools: start from ${fromAddr}  to ${toAddr} `);

        await this.exitPosition(fromAddr);
        await this.enterPosition(toAddr);

        logger.debug("batcher.switchPools: end");
    }

    sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    async depositCake(syrupPool, amount) {

        logger.debug(`batcher.depositCake: syrup ${syrupPool.options.address}  amount ${amount}`);
        const result = {
            step: "depositCake",
            to: syrupPool.options.address,
            amount: amount,
            receipt: null,
        };

        if (amount > 0) {

            await this.approve(CAKE_ADDRESS, syrupPool.options.address, amount);

            let tx;

            if (syrupPool.syrupType === SyrupPoolType.SMARTCHEF) {
                logger.debug("batcher.depositCake: deposit cake to Smartchef");

                tx = await syrupPool.methods.deposit(amount).encodeABI();

            } else if (syrupPool.syrupType === SyrupPoolType.MANUAL_CAKE) {
                logger.debug("batcher.depositCake: deposit cake to ManualCake");
                tx = await syrupPool.methods.enterStaking(amount).encodeABI();
            }

            result.receipt = await this.sendTransactionWait(tx, syrupPool.options.address);
        }

        this.trace.push(result);
        return result;
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

    async swapAllToCake(tokenIn) {
        logger.debug(`batcher.swapAllToCake: token ${tokenIn} `);

        if (tokenIn === CAKE_ADDRESS) {
            return;
        }

        const token = new this.web3.eth.Contract(
            BEP_20_ABI,
            tokenIn
        );

        const swapAmount = await token.methods.balanceOf(this.account.address).call();
        await this.approve(tokenIn, this.router.options.address, swapAmount);

        const viaBnb = [tokenIn, WBNB_ADDRESS, CAKE_ADDRESS];
        await this.swap(tokenIn, swapAmount, viaBnb);

    }


    async approve(tokenAddr, spender, amount) {
        logger.debug(`batcher.approve: token ${tokenAddr} spender ${spender}  amount ${amount}`);
        const result = {
            step: "approve",
            tokenAddr: tokenAddr,
            spender: spender,
            amount: amount,
            receipt: null,
        };

        const token = new this.web3.eth.Contract(
            BEP_20_ABI,
            tokenAddr);

        const tx = await token.methods.approve(spender, amount).encodeABI();
        result.receipt = await this.sendTransactionWait(tx, token.options.address);

        this.trace.push(result);
        return result;
    }

    async swap(tokenIn, amountIn, route) {
        logger.debug(`batcher.swap: token ${tokenIn} amountIn ${amountIn}  to ${route[route.length - 1]}`);

        const result = {
            step: "swap",
            from: tokenIn,
            to: route[route.length - 1],
            amount: amountIn,
            receipt: null,
        };

        if (amountIn > 0) {
            const viaBnb = [tokenIn, WBNB_ADDRESS, CAKE_ADDRESS];
            const amounts = await this.router.methods.getAmountsOut(amountIn, viaBnb).call();
            const amountBN = this.web3.utils.toBN(amounts[1]);
            const amountOutMin = amountBN.sub(amountBN.divn(this.swapSlippage));
            const recipient = this.account.address;
            const deadline = Date.now() + this.swapTimeLimit;

            const tx = await this.router.methods.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                viaBnb,
                recipient,
                deadline
            ).encodeABI();

            result.receipt = await this.sendTransactionWait(tx, this.router.options.address);
        }

        this.trace.push(result);
        return result;

    }

    async setupSyrupPool(syrupAddr) {

        let syrupPool;

        if (syrupAddr === MASTER_CHEF_ADDRESS) {
            syrupPool = this.masterchefContract;
            syrupPool.syrupType = SyrupPoolType.MANUAL_CAKE;
        }

        try {
            syrupPool = new this.web3.eth.Contract(
                SMARTCHEF_INITIALIZABLE_ABI,
                syrupAddr);
            syrupPool.syrupType = SyrupPoolType.SMARTCHEF;

            const factoryAddr = await syrupPool.methods.SMART_CHEF_FACTORY().call();
            if (factoryAddr !== SMARTCHEF_FACTORY_ADDRESS) {
                return null;
            }
        } catch (e) {
            throw new FatalError(`batcher.getSyrupType: unsupported pool type for syrup address ${syrupAddr} `);
        }

        return syrupPool;
    }

    async getStakedAmount(syrupPool, user) {
        return (syrupPool.syrupType === SyrupPoolType.SMARTCHEF ?
            await syrupPool.methods.userInfo(user).call() : await syrupPool.methods.userInfo(0, user).call()).amount;
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
        this.status = "failure";
    }

    async handleExecutionResult() {
        if (this.status === "success") {
            await this.onSuccess(this.trace);
        }
        if (this.status === "failure") {
            await this.onFailure(this.trace);
        }
    }

}


module.exports = {
    Batcher: Batcher,
};
