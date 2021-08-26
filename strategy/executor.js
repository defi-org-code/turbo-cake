const {ethers} = require("hardhat");


const {Action} = require("./policy");
const {TxManager} = require("./txManager");
const {
    SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS, MASTER_CHEF_ADDRESS, WBNB_ADDRESS, ROUTER_ADDRESS,
} = require('./params')
const {
    MASTERCHEF_ABI,
    SMARTCHEF_FACTORY_ABI,
    SMARTCHEF_INITIALIZABLE_ABI,
    CAKE_ABI,
    PANCAKESWAP_FACTORY_V2_ABI,
    BEP_20_ABI
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
        this.swapSlippage = args.swapSlippage;
        this.swapTimeLimit = args.swapTimeLimit;
        this.status = "start";
        this.execStack = null;
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

        this.status = "running";

        switch (this.action.name) {

            case Action.NO_OP:
                this.status = null;
                this.execStack = null;
                break;

            case Action.ENTER:
                await this.enterPosition(this.action.args.to);
                break;

            case Action.HARVEST:
                await this.harvest(this.action.args.to);
                break;

            case Action.SWITCH:
                await this.switchPools(this.action.args.from, this.action.args.to);
                break;

            case Action.EXIT:
                await this.exitPosition();
                break;

            default:
                return this.invalidAction();
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


    async sendTransactionWait(tx) {
        if (!tx) {
            return null;
        }
        try {

            const txResponse = await this.signer.sendTransaction(tx);
            console.log('## txResponse ##');
            console.dir(txResponse);

            const receipt = await txResponse.wait();
            console.log('## txReceipt ##');
            console.log(receipt);
            return receipt;

        } catch (error) {
            this.notif.sendDiscord(`failed to send transaction: ${error}`);
            console.log(error);
            throw error;
        }
    }


    async enterPosition(syrupAddr) {
        console.log("executor.execute: Action.ENTER entering syrup pool");
    }


    async exitPosition() {

    }

    handleError(err) {
        console.log(err);
        this.status = "failure";
    }


    async harvest(syrupAddr) {
        console.log("executor.execute: harvest start");

        await this.withdraw(syrupAddr, 0)
            .then(async (res) => {
                if (res.syrupType === SyrupPoolType.SMARTCHEF) {
                    const tokenAddr = res.rewardTokenAddr;
                    const token = new ethers.Contract(
                        tokenAddr,
                        ['function balanceOf(address account) external view returns (uint256)'],
                        this.signer
                    );
                    const swapAmount = await token.balanceOf(this.signer.address);
                    await this.approve(tokenAddr, this.router.address, swapAmount);
                    return { tokenAddr: tokenAddr, amount: swapAmount };
                }
            })
            .then(async (res) => await this.swapToCake(res.tokenAddr, res.amount))
            .then(async () => {
                const amount = await this.cakeContract.balanceOf(this.signer.address);
                await this.depositCake(syrupAddr, amount);

            })
            .then(() => {
                this.status = "success";
                console.log("executor.execute: harvest completed exec successfully");
            })
            .catch((err) => this.handleError(err))
            .finally(async () => {
                await this.handleExecutionResult()
            });

    }

    async switchPools() {

    }


    async approveMax() {

    }


    async depositCake(syrupAddr, amount) {

        console.log(`executor.depositCake: syrup ${syrupAddr}  amount ${amount}`);
        const result = {
            step: "depositCake",
            to: syrupAddr,
            amount: amount,
            receipt: null,
        };

        result.syrupType = await this.getSyrupType(syrupAddr);

        if (amount > 0) {

            // { // assert user.cakeBalance >= amount
            //     const userBalance = await this.cakeContract.balanceOf(this.signer.address);
            //     console.log(userBalance);
            //     if (userBalance.amount.lt(ethers.BigNumber.from(amount))) {
            //         throw new FatalError("deposit cake amount is gt user cake balance ");
            //     }
            // }

            switch (result.syrupType) {
                case SyrupPoolType.SMARTCHEF: {
                    console.log(`executor.depositCake: deposit (${amount}) cake to smartchef - address ${syrupAddr}`);
                    const smartChef = new ethers.Contract(
                        syrupAddr,
                        SMARTCHEF_INITIALIZABLE_ABI,
                        this.signer
                    );

                    const tx = await smartChef.populateTransaction.deposit(amount);
                    result.receipt = await this.sendTransactionWait(tx);
                    break;
                }

                case SyrupPoolType.MANUAL_CAKE:
                    console.log(`executor.depositCake: deposit (${amount}) cake to ManualCake - address ${syrupAddr}`);

                    const tx = await this.masterchefContract.populateTransaction.enterStaking(amount);
                    result.receipt = await this.sendTransactionWait(tx);
                    break;

                default:
                    throw new FatalError("executor.depositCake: unsupported pool type");
            }
        }
        this.trace.push(result);
        return result;


    }


    async withdraw(syrupAddr, amount) {
        console.log("executor.withdraw");

        const result = {
            step: "withdraw",
            from: syrupAddr,
            amount: amount,
            syrupType: null,
            rewardTokenAddr: null,
            receipt: null,
        };

        result.syrupType = await this.getSyrupType(syrupAddr);

        switch (result.syrupType) {
            case SyrupPoolType.SMARTCHEF: {
                console.log(`executor.withdraw: withdraw from smartchef - address ${syrupAddr}`);

                const smartChef = new ethers.Contract(
                    syrupAddr,
                    SMARTCHEF_INITIALIZABLE_ABI,
                    this.signer
                );
                result.rewardTokenAddr = await smartChef.rewardToken();

                // { // assert user.stake >= amount
                //     let userInfo = await smartChef.userInfo(this.signer.address);
                //     console.log(userInfo);
                //     if (userInfo.amount.lt(ethers.BigNumber.from(amount))) {
                //         throw new FatalError("withdraw amount is too large");
                //     }
                // }

                const tx = await smartChef.populateTransaction.withdraw(amount);
                result.receipt = await this.sendTransactionWait(tx);
                break;
            }

            case SyrupPoolType.MANUAL_CAKE:
                console.log(`executor.withdraw: withdraw from ManualCake - address ${syrupAddr}`);

                // { // assert user.stake >= amount
                //     let userInfo = await this.masterchefContract.userInfo(0, this.signer.address);
                //     console.log(userInfo);
                //
                //     if (userInfo.amount.lt(ethers.BigNumber.from(amount))) {
                //         throw new FatalError("withdraw amount is too large");
                //     }
                // }
                const tx = await this.masterchefContract.populateTransaction.leaveStaking(amount);
                result.receipt = await this.sendTransactionWait(tx);
                break;

            default:
                throw new FatalError("executor.withdraw: unsupported pool type");
        }

        this.trace.push(result);
        return result;
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

    async swapToCake(tokenIn, amountIn) {

        console.log(`executor.swapToCake: token ${tokenIn}  amount ${amountIn}`);
        const result = {
            step: "swapToCake",
            from: tokenIn,
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

    async getSyrupType(syrupAddr) {

        let type = SyrupPoolType.OTHER;

        if (syrupAddr === MASTER_CHEF_ADDRESS) {
            type = SyrupPoolType.MANUAL_CAKE;
        }
        try {

            const syrupPool = new ethers.Contract(
                syrupAddr,
                SMARTCHEF_INITIALIZABLE_ABI,
                this.signer);

            const factoryAddr = await syrupPool.SMART_CHEF_FACTORY();
            if (ethers.utils.isAddress(factoryAddr) && (factoryAddr === SMARTCHEF_FACTORY_ADDRESS)) {
                type = SyrupPoolType.SMARTCHEF;
            }
        } catch (e) {
            console.log(e);
        }
        console.log(`executor.getSyrupType:: address = ${syrupAddr} mapped to type = ${type}`);
        return type;
    }


    invalidAction() {
        return Promise.resolve(undefined);
    }
}

// ############ helpers ###########


module.exports = {
    Executor,
};
