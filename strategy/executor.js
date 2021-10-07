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
const logger = new Logger('executor')


const SyrupPoolType = {
    MANUAL_CAKE: "masterchef",
    SMARTCHEF: "smartchef",
    OTHER: "unsupported",
}

class Executor extends TxManager {


    constructor(args) {
        super(args.notifClient);
        this.web3 = args.web3;
        this.name = "pancakeswap-executor";
        this.notif = args.notifClient;
        this.account = args.account;
        this.action = args.action;
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


    async run() {

        logger.debug("executor.run: start");

        try {
            this.status = "running";
            const args = this.action;

            switch (this.action.name) {

                case Action.NO_OP:
                    this.status = null;
                    break;

                case Action.ENTER:
                    await this.enterPosition(args.to.address);
                    break;

                case Action.HARVEST:
                    await this.harvest(args.from.address, args.from.routeToCake);

                    break;

                case Action.SWITCH:
                    await this.switchPools(args.from.address, args.to.address, args.from.routeToCake);
                    break;

                case Action.EXIT:
                    await this.exitPosition(args.from.address, args.from.routeToCake);
                    break;

                case Action.ADDRESS_CHECK:
                    await this.addressCheck(args.account, args.accountNew);
                    break;

                case Action.ADDRESS_CLEAR:
                    await this.addressClear(args.account, args.accountNew, args.from.address, args.from.routeToCake);
                    break;

                default:
                    return this.invalidAction();
            }

            this.status = "success";
            logger.debug("executor.run: action completed successfully");


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

    async sendTransactionWait(encodedTx, to, transactionObj = undefined) {

        if (!encodedTx && !transactionObj) {
            return null;
        }

        try {
            let transactionObject

            if (transactionObj) {
                transactionObject = transactionObj;
            } else {

                transactionObject = {
                    gas: 500000,
                    data: encodedTx,
                    from: this.account.address,
                    to: to,
                };
            }

            logger.debug("transactionObject:");
            console.log(transactionObject);
            const signedTx = await this.account.signTransaction(transactionObject);
            logger.debug('signedTx:')
            console.log(signedTx)

            const txResponse = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            logger.debug('## txResponse ##');
            console.log(txResponse);

            const res = await this.pendingWait(1000, txResponse.transactionHash);
            logger.debug('## txReceipt ##', res.gasUsed);
            console.log(res);

            return res;


        } catch (error) {
            // this.notif.sendDiscord(`failed to send transaction: ${error}`);
            throw new FatalError(`failed to send transaction: ${error}`);
        }
    }


    pendingWait = (milliseconds, txHash) => {
        return new Promise(resolve => setTimeout(async () => {
            const res = await this.web3.eth.getTransactionReceipt(txHash);
            if (res === null) {
                return this.pendingWait(milliseconds, txHash)
            }
            if (res['status'] === true) {
                resolve(res)
            }
            return null;
        }, milliseconds),)
    }


    async enterPosition(addr) {
        logger.debug(`executor.enterPosition: start pool ${addr} `);

        const syrupPool = await this.setupSyrupPool(addr);
        const cakeBalance = await this.cakeContract.methods.balanceOf(this.account.address).call();
        logger.debug('cakeBalance: ', cakeBalance.toString());
        await this.depositCake(syrupPool, cakeBalance);

        logger.debug("executor.enterPosition: end");
    }


    async exitPosition(addr, routeToCake) {
        logger.debug(`executor.exitPosition: start pool ${addr}`);

        const syrupPool = await this.setupSyrupPool(addr);
        const stakedAmount = await this.getStakedAmount(syrupPool, this.account.address);
        const withdrawn = await this.withdraw(syrupPool, stakedAmount);
        await this.swapAllToCake(withdrawn.rewardTokenAddr, routeToCake);

        logger.debug("executor.exitPosition: end");
    }


    async addressClear(account, accountNew, fromSyrupPool, routeToCake) {
        logger.debug(`executor.addressClear: account ${account.address}  new account ${accountNew.address}`);

        this.account = account;
        await this.exitPosition(fromSyrupPool, routeToCake)

        let oldAddressCakeBalance = await this.cakeContract.methods.balanceOf(account.address).call();
        logger.debug(`old account ${account.address}  cakeBalance: `, oldAddressCakeBalance.toString());

        let newAddressCakeBalance = await this.cakeContract.methods.balanceOf(accountNew.address).call();
        logger.debug(`new account ${accountNew.address}  cakeBalance: `, newAddressCakeBalance.toString());


        let recipient = accountNew;
        let cakeToken = {
            name: "Cake",
            contract: this.cakeContract,
        }
        await this.transferBep20(cakeToken, recipient, oldAddressCakeBalance);


        oldAddressCakeBalance = await this.cakeContract.methods.balanceOf(account.address).call();
        logger.debug(`After Cake transfer to new account:  old account ${account.address}  cakeBalance: `, oldAddressCakeBalance.toString());

        newAddressCakeBalance = await this.cakeContract.methods.balanceOf(accountNew.address).call();
        logger.debug(`After Cake transfer to new account:  new account ${accountNew.address}  cakeBalance: `, newAddressCakeBalance.toString());





        let oldAddressBnbBalance = await this.web3.eth.getBalance(account.address);
        logger.debug(`old account ${account.address}  bnbBalance: `, this.web3.utils.fromWei(oldAddressBnbBalance, 'ether').toString());


        let newAddressBnbBalance = await this.web3.eth.getBalance(accountNew.address);
        logger.debug(` new account ${accountNew.address}  bnbBalance: `, this.web3.utils.fromWei(newAddressBnbBalance, 'ether').toString());

        let amountBnb = this.web3.utils.toHex(oldAddressBnbBalance);
        await this.transferBnb(recipient, amountBnb);


        oldAddressBnbBalance = await this.web3.eth.getBalance(account.address);
        logger.debug(`After bnb transfer - old account ${account.address}  bnbBalance: `, this.web3.utils.fromWei(oldAddressBnbBalance).toString());

        newAddressBnbBalance = await this.web3.eth.getBalance(accountNew.address);
        logger.debug(`After bnb transfer -  new account ${accountNew.address}  bnbBalance: `, this.web3.utils.fromWei(newAddressBnbBalance, 'ether').toString());


    }


    async addressCheck(account, accountNew) {
        logger.debug(`executor.addressCheck: account ${account.address}  new account ${accountNew.address}`);


        let cakeBalance = await this.cakeContract.methods.balanceOf(account.address).call();
        logger.debug(`account ${account.address}  cakeBalance: `, cakeBalance.toString());

        cakeBalance = await this.cakeContract.methods.balanceOf(accountNew.address).call();
        logger.debug(`new account ${accountNew.address}  cakeBalance: `, cakeBalance.toString());


        this.account = account;

        let decimals = this.web3.utils.toBN(18);
        let amount = this.web3.utils.toBN(1).mul(this.web3.utils.toBN(10).pow(decimals));
        let recipient = accountNew;
        let cakeToken = {
            name: "Cake",
            contract: this.cakeContract,
        }

        await this.transferBep20(cakeToken, recipient, amount);

        let NewCakeBalance = await this.cakeContract.methods.balanceOf(account.address).call();
        logger.debug(`After Cake transfer to new account account ${account.address}  new cakeBalance: `, NewCakeBalance.toString());

        NewCakeBalance = await this.cakeContract.methods.balanceOf(accountNew.address).call();
        logger.debug(`After Cake transfer to new account the new account ${accountNew.address}  new cakeBalance: `, NewCakeBalance.toString());




        let bnbBalance = await this.web3.utils.fromWei(await this.web3.eth.getBalance(account.address), 'ether');
        logger.debug(`account ${account.address}  bnbBalance: `, bnbBalance.toString());


        bnbBalance = await this.web3.utils.fromWei(await this.web3.eth.getBalance(accountNew.address), 'ether');
        logger.debug(`new account ${accountNew.address}  bnbBalance: `, bnbBalance.toString());

        let amountBnb = this.web3.utils.toHex(this.web3.utils.toWei('0.1', 'ether'));
        await this.transferBnb(recipient, amountBnb);


        let newBnbBalance = await this.web3.utils.fromWei(await this.web3.eth.getBalance(account.address), 'ether');
        logger.debug(`account ${account.address}  new bnbBalance: `, newBnbBalance.toString());

        newBnbBalance = await this.web3.utils.fromWei(await this.web3.eth.getBalance(accountNew.address), 'ether');
        logger.debug(`new account ${accountNew.address} new bnbBalance: `, newBnbBalance.toString());



        this.account = accountNew;
        recipient = account;

        await this.transferBep20(cakeToken, recipient, amount);

        NewCakeBalance = await this.cakeContract.methods.balanceOf(accountNew.address).call();
        logger.debug(`After Cake transfer to account new account ${accountNew.address}  new cakeBalance: `, NewCakeBalance.toString());

        NewCakeBalance = await this.cakeContract.methods.balanceOf(account.address).call();
        logger.debug(`After Cake transfer to account the account ${account.address}  new cakeBalance: `, NewCakeBalance.toString());


        this.account = account;


        amount = this.web3.utils.toBN(10).mul(this.web3.utils.toBN(10).pow(decimals));
        recipient = accountNew;
        await this.transferBep20(cakeToken, recipient, amount);

        NewCakeBalance = await this.cakeContract.methods.balanceOf(account.address).call();
        logger.debug(`After 2nd Cake transfer to new account account ${account.address}  new cakeBalance: `, NewCakeBalance.toString());

        NewCakeBalance = await this.cakeContract.methods.balanceOf(accountNew.address).call();
        logger.debug(`After 2nd Cake transfer to new account the new account ${accountNew.address}  new cakeBalance: `, NewCakeBalance.toString());


        logger.debug("executor.addressCheck: end");



    }



    async transferBnb(recipient, amount) {
        logger.debug(`executor.transferBnb
        from ${this.account.address} recipient ${recipient.address} 
         amount ${this.web3.utils.hexToNumberString(amount)}`);

        const result = {
            step: "transferBnb",
            fromAddress: this.account.address,
            recipientAddress: recipient.address,
            amount: amount,
        };

        const transactionObject = {
            from: this.account.address,
            to: recipient.address,
            value: amount,
            gas: 500000,
        }

        result.receipt = await this.sendTransactionWait(null, null, transactionObject);
        this.trace.push(result);

        return result;
    }

    async transferBep20(token, recipient, amount) {
        logger.debug(`executor.transferBep20: token name ${token.name} 
        token address ${token.contract.options.address} 
        from ${this.account.address} recipient ${recipient.address}  amount ${amount}`);

        const result = {
            step: "transferBep20",
            tokenName: token.name,
            fromAddress: this.account.address,
            recipientAddress: recipient.address,
            amount: amount,
        };


        const tx = await token.contract.methods.transfer(recipient.address, amount).encodeABI();
        result.receipt = await this.sendTransactionWait(tx, token.contract.options.address);
        this.trace.push(result);

        return result;
    }


    async harvest(addr, routeToCake) {
        logger.debug(`executor.harvest: start pool ${addr}`);

        const syrupPool = await this.setupSyrupPool(addr);
        const withdrawn = await this.withdraw(syrupPool, 0);
        await this.swapAllToCake(withdrawn.rewardTokenAddr, routeToCake);
        const cakeBalance = await this.cakeContract.methods.balanceOf(this.account.address).call();
        await this.depositCake(syrupPool, cakeBalance);

        logger.debug("executor.harvest: end");
    }


    async switchPools(fromAddr, toAddr, routeToCake) {
        logger.debug(`executor.switchPools: start from ${fromAddr}  to ${toAddr} `);

        await this.exitPosition(fromAddr, routeToCake);
        await this.enterPosition(toAddr);

        logger.debug("executor.switchPools: end");
    }

    sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    async depositCake(syrupPool, amount) {

        logger.debug(`executor.depositCake: syrup ${syrupPool.options.address}  amount ${amount}`);
        const result = {
            step: "depositCake",
            to: syrupPool.options.address,
            amount: amount,
            receipt: null,
        };
        // TODO: push trace here - add status and update\ success or error

        if (amount > 0) {

            await this.approve(CAKE_ADDRESS, syrupPool.options.address, amount);

            let tx;

            if (syrupPool.syrupType === SyrupPoolType.SMARTCHEF) {
                logger.debug("executor.depositCake: deposit cake to Smartchef");

                tx = await syrupPool.methods.deposit(amount).encodeABI();

            } else if (syrupPool.syrupType === SyrupPoolType.MANUAL_CAKE) {
                logger.debug("executor.depositCake: deposit cake to ManualCake");
                tx = await syrupPool.methods.enterStaking(amount).encodeABI();
            }

            result.receipt = await this.sendTransactionWait(tx, syrupPool.options.address);
        }

        this.trace.push(result);
        return result;
    }

    async withdraw(syrupPool, amount) {
        logger.debug(`executor.withdraw: from pool ${syrupPool.options.address} type ${SyrupPoolType.SMARTCHEF} the amount ${amount}`);

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
            // gas = await syrupPool.methods.withdraw(amount).estimateGas();

        } else if (syrupPool.syrupType === SyrupPoolType.MANUAL_CAKE) {
            result.rewardTokenAddr = CAKE_ADDRESS;
            tx = await syrupPool.methods.leaveStaking(amount).encodeABI();
            // gas = await syrupPool.methods.leaveStaking(amount).estimateGas();
        }

        result.receipt = await this.sendTransactionWait(tx, syrupPool.options.address);
        this.trace.push(result);

        return result;
    }

    async swapAllToCake(tokenIn, routeToCake) {
        logger.debug(`executor.swapAllToCake: token ${tokenIn} `);

        if (tokenIn === CAKE_ADDRESS) {
            return;
        }

        const token = new this.web3.eth.Contract(
            BEP_20_ABI,
            tokenIn
        );

        const swapAmount = await token.methods.balanceOf(this.account.address).call();
        await this.approve(tokenIn, this.router.options.address, swapAmount);

        await this.swap(tokenIn, swapAmount, routeToCake);

    }


    async approve(tokenAddr, spender, amount) {
        logger.debug(`executor.approve: token ${tokenAddr} spender ${spender}  amount ${amount}`);
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
        logger.debug(`executor.swap: token ${tokenIn} amountIn ${amountIn}  to ${route[route.length - 1]}`);

        const result = {
            step: "swap",
            from: tokenIn,
            to: route[route.length - 1],
            amount: amountIn,
            receipt: null,
        };

        if (amountIn > 0) {
            const amounts = await this.router.methods.getAmountsOut(amountIn, route).call();


            const amountBN = this.web3.utils.toBN(amounts[amounts.length-1]);
            const amountOutMin = amountBN.sub(amountBN.divn(this.swapSlippage));

            const recipient = this.account.address;
            const deadline = Date.now() + this.swapTimeLimit;

            const tx = await this.router.methods.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                route,
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
            throw new FatalError(`executor.getSyrupType: unsupported pool type for syrup address ${syrupAddr} `);
        }

        return syrupPool;
    }

    async getStakedAmount(syrupPool, user) {
        return (syrupPool.syrupType === SyrupPoolType.SMARTCHEF ?
            await syrupPool.methods.userInfo(user).call() : await syrupPool.methods.userInfo(0, user).call()).amount;
    }

    handleExecutionError(err) {
        this.notif.sendDiscord(err);
        this.status = "failure";
    }

    invalidAction() {
        return Promise.resolve(undefined);
    }



}


module.exports = {
    Executor,
};
