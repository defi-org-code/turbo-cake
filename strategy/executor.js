const {ethers} = require("hardhat");

const {Action} = require("./policy");
const {TxManager} = require("./txManager");
const {
    SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS, MASTER_CHEF_ADDRESS, WBNB_ADDRESS, ROUTER_ADDRESS,
} = require('./params')
const {
    MASTERCHEF_ABI,
    SMARTCHEF_INITIALIZABLE_ABI,
    CAKE_ABI,
} = require('../abis')
const {TransactionFailure, FatalError, GasError, NotImplementedError} = require('../errors');


const SyrupPoolType = {
    MANUAL_CAKE: "masterchef",
    SMARTCHEF: "smartchef",
    OTHER: "unsupported",
}


class Executor extends TxManager {


    constructor(args) {
        super(args.notifClient);
        this.name = "pancakeswap-executor";
        this.notif = args.notifClient;
        this.signer = args.signer;
        this.action = args.action;
        this.web3 = args.web3;
        this.account = args.account;
        this.swapSlippage = args.swapSlippage;
        this.swapTimeLimit = args.swapTimeLimit;
        this.status = "start";
        this.execCache = {};
        this.trace = [];
        this.result = null;
        this.onSuccessCallback = null;
        this.onFailureCallback = null;

        this.cakeContract = new ethers.Contract(
            CAKE_ADDRESS,
            CAKE_ABI,
            this.signer
        );

        this.masterchefContract = new ethers.Contract(
            MASTER_CHEF_ADDRESS,
            MASTERCHEF_ABI,
            this.signer
        );

        this.router = new ethers.Contract(
            ROUTER_ADDRESS,
            [
                'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
                'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
            ],
            this.signer
        );
    }


    async run() {

        console.log("executor.run: start");

        try {
            this.status = "running";
            const args = this.action.args;

            switch (this.action.name) {

                case Action.NO_OP:
                    this.status = null;
                    break;

                case Action.ENTER:
                    await this.enterPosition(args);
                    break;

                case Action.HARVEST:
                    await this.harvest(args);

                    break;

                case Action.SWITCH:
                    await this.switchPools(args);
                    break;

                case Action.EXIT:
                    await this.exitPosition(args);
                    break;

                default:
                    return this.invalidAction();
            }

            this.status = "success";
            console.log("executor.run: action completed successfully");


        } catch (err) {
            this.handleExecutionError(err);

        } finally {
            await this.handleExecutionResult();
        }
    }

    async handleExecutionResult() {
        if (this.status === "success") {
            await this.onSuccess(this.trace);
        }
        if (this.status === "failure") {
            await this.onFailure(this.trace);
        }
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

    async sendTransactionWait(transactionObject) {
        if (!transactionObject) {
            return null;
        }
        try {

        	transactionObject.gas = 500000
			const signedTx = await this.account.signTransaction(transactionObject);
			const txResponse = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

            // tx.gasPrice = ethers.utils.parseUnits('5', 'gwei');
            // tx.gasLimit = (await ethers.provider.estimateGas(tx)).mul(2);
            // tx.nonce = await ethers.provider.getTransactionCount(this.signer.address);

            // const txResponse = await this.signer.sendTransaction(tx);
            console.log('## txResponse ##');
            console.dir(txResponse);

            // const receipt = await txResponse.wait();
			const receipt = await this.web3.eth.getTransactionReceipt(txResponse.transactionHash);
            console.log('## txReceipt ##');
            console.log(receipt);

            // await this.sleep(30000)
            return receipt;


        } catch (error) {
            this.notif.sendDiscord(`failed to send transaction: ${error}`);
            console.log(error);
            throw new TransactionFailure(error);
        }
    }


    async enterPosition(args) {
        console.log(`executor.enterPosition: start pool ${args.poolAddress} `);

        const syrupPool = await this.setupSyrupPool(args.poolAddress);
        const cakeBalance = await this.cakeContract.balanceOf(this.signer.address);
        console.log('cakeBalance: ', cakeBalance.toString());
        await this.depositCake(syrupPool, cakeBalance);

        console.log("executor.enterPosition: end");
    }


    async exitPosition(args) {
        console.log(`executor.exitPosition: start pool ${args.poolAddress} `);

            const syrupPool = await this.setupSyrupPool(args.poolAddress);
            const stakedAmount = await this.getStakedAmount(syrupPool, this.signer.address);
            const withdrawn = await this.withdraw(syrupPool, stakedAmount);
            await this.swapAllToCake(withdrawn.rewardTokenAddr);

        console.log("executor.exitPosition: end");
    }

    async harvest(args) {
        console.log(`executor.harvest: start pool ${args.poolAddress} `);

            const syrupPool = await this.setupSyrupPool(args.poolAddress);
            const withdrawn = await this.withdraw(syrupPool, 0);
            await this.swapAllToCake(withdrawn.rewardTokenAddr);
            const cakeBalance = await this.cakeContract.balanceOf(this.signer.address);
            await this.depositCake(syrupPool, cakeBalance);

        console.log("executor.harvest: end");

    }


    async switchPools(args) {
        console.log(`executor.switchPools: start from ${args.from}  to ${args.to} `);

        await this.exitPosition({poolAddress: args.from});
        await this.enterPosition({poolAddress: args.to});

        console.log("executor.switchPools: end");
    }

	sleep = (milliseconds) => {
		return new Promise(resolve => setTimeout(resolve, milliseconds))
	}

    async depositCake(syrupPool, amount) {

        console.log(`executor.depositCake: syrup ${syrupPool.address}  amount ${amount}`);
        const result = {
            step: "depositCake",
            to: syrupPool.address,
            amount: amount,
            receipt: null,
        };

        if (amount > 0) {
            // { // assert user.cakeBalance >= amount
            //     const userBalance = await this.cakeContract.balanceOf(this.signer.address);
            //     console.log(userBalance);
            //     if (userBalance.amount.lt(ethers.BigNumber.from(amount))) {
            //         throw new FatalError("deposit cake amount is gt user cake balance ");
            //     }
            // }

            await this.approve(CAKE_ADDRESS, syrupPool.address, amount);

            let tx;

            if (syrupPool.type === SyrupPoolType.SMARTCHEF) {
                console.log("executor.depositCake: deposit cake to Smartchef");
                tx = await syrupPool.populateTransaction.deposit(amount);

            } else if (syrupPool.type === SyrupPoolType.MANUAL_CAKE) {
                console.log("executor.depositCake: deposit cake to ManualCake");
                tx = await syrupPool.populateTransaction.enterStaking(amount);
            }

            result.receipt = await this.sendTransactionWait(tx);
        }

        this.trace.push(result);
        return result;
    }

    async withdraw(syrupPool, amount) {
        console.log(`executor.withdraw: from pool ${syrupPool.address} type ${SyrupPoolType.SMARTCHEF}`);

        const result = {
            step: "withdraw",
            poolAddress: syrupPool.address,
            amount: amount,
            syrupType: syrupPool.type,
            rewardTokenAddr: null,
            receipt: null,
        };

        let tx;

        if (syrupPool.type === SyrupPoolType.SMARTCHEF) {
            result.rewardTokenAddr = await syrupPool.rewardToken();
            tx = await syrupPool.populateTransaction.withdraw(amount);

        } else if (syrupPool.syrupType === SyrupPoolType.MANUAL_CAKE) {
            tx = await this.masterchefContract.populateTransaction.leaveStaking(amount);
        }

        result.receipt = await this.sendTransactionWait(tx);
        this.trace.push(result);

        return result;
    }

    async swapAllToCake(tokenIn) {
        console.log(`executor.swapAllToCake: token ${tokenIn} `);

        if (tokenIn === CAKE_ADDRESS) {
            return;
        }

        const token = new ethers.Contract(
            tokenIn,
            ['function balanceOf(address account) external view returns (uint256)'],
            this.signer
        );

        const swapAmount = await token.balanceOf(this.signer.address);
        await this.approve(tokenIn, this.router.address, swapAmount);

        const viaBnb = [tokenIn, WBNB_ADDRESS, CAKE_ADDRESS];
        await this.swap(tokenIn, swapAmount, viaBnb);

    }


    async approve(tokenAddr, spender, amount) {
        console.log(`executor.approve: token ${tokenAddr} spender ${spender}  amount ${amount}`);
        const result = {
            step: "approve",
            tokenAddr: tokenAddr,
            spender: spender,
            amount: amount,
            receipt: null,
        };

        const token = new ethers.Contract(
            tokenAddr,
            ['function approve(address spender, uint256 amount) external returns (bool)'],
            this.signer
        );

        const tx = await token.populateTransaction.approve(spender, amount);
        result.receipt = await this.sendTransactionWait(tx);

        this.trace.push(result);
        return result;
    }

    async swap(tokenIn, amountIn, route) {
        console.log(`executor.swap: token ${tokenIn} amountIn ${amountIn}  to ${route[route.length - 1]}`);

        const result = {
            step: "swap",
            from: tokenIn,
            to: route[route.length - 1],
            amount: amountIn,
            receipt: null,
        };

        if (amountIn > 0) {
            const viaBnb = [tokenIn, WBNB_ADDRESS, CAKE_ADDRESS];
            const amounts = await this.router.getAmountsOut(amountIn, viaBnb);
            const amountOutMin = amounts[1].sub(amounts[1].div(this.swapSlippage));
            const recipient = this.signer.address;
            const deadline = Date.now() + this.swapTimeLimit;

            const tx = await this.router.populateTransaction.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                viaBnb,
                recipient,
                deadline
            );

            result.receipt = await this.sendTransactionWait(tx);
        }

        this.trace.push(result);
        return result;

    }


    async setupSyrupPool(syrupAddr) {

        const syrupType = await this.getSyrupType(syrupAddr);
        let syrupPool;

        if (syrupType === SyrupPoolType.SMARTCHEF) {
            syrupPool = new ethers.Contract(
                syrupAddr,
                SMARTCHEF_INITIALIZABLE_ABI,
                this.signer
            );

        } else {

            syrupPool = this.masterchefContract;
        }
        syrupPool.type = syrupType;

        return syrupPool;
    }

    async getSyrupType(syrupAddr) {

        if (syrupAddr === MASTER_CHEF_ADDRESS) {
            return SyrupPoolType.MANUAL_CAKE;
        }

        try {
            const syrupPool = new ethers.Contract(
                syrupAddr,
                SMARTCHEF_INITIALIZABLE_ABI,
                this.signer);

            const factoryAddr = await syrupPool.SMART_CHEF_FACTORY();
            if (ethers.utils.isAddress(factoryAddr) && (factoryAddr === SMARTCHEF_FACTORY_ADDRESS)) {
                return SyrupPoolType.SMARTCHEF;
            }

        } catch (e) {
            console.log(e);
            throw new FatalError(`executor.getSyrupType: unsupported pool type for syrup address ${syrupAddr} `);
        }
    }

    async getStakedAmount(syrupPool, user) {
        return (syrupPool.type === SyrupPoolType.SMARTCHEF ?
            await syrupPool.userInfo(user) : await syrupPool.userInfo(0, user)).amount;
    }

    handleExecutionError(err) {
        console.log(err);
        this.status = "failure";
    }


    invalidAction() {
        return Promise.resolve(undefined);
    }
}


module.exports = {
    Executor,
};
