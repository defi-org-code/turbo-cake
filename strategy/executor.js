const { ethers, web3 } = require("hardhat");

const {Action} = require("./policy");
const { TxManager } = require("./txManager");
const {SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS,
    PANCAKESWAP_FACTORY_V2_ADDRESS, VERSION,
    MAX_TX_FAILURES, DEADLINE_SEC, MIN_SEC_BETWEEN_REBALANCE
} = require('./params')
const {SMARTCHEF_FACTORY_ABI, CAKE_ABI, PANCAKESWAP_FACTORY_V2_ABI, BEP_20_ABI} = require('../abis')


class Executor extends TxManager {

    constructor(ethers, notification) {
        super(ethers, notification);
        this.name = "pancakeswap-executor";
        this.ethers = ethers;
        this.signer = null;
        this.executionState = null;



    }

    async init(signer) {
        this.signer = signer;
        console.log(await signer.getAddress());

        this.cakeContract = new ethers.Contract(
            CAKE_ADDRESS,
            CAKE_ABI,
            this.signer
        );


    }


    async sendTransactionWait(tx) {
        try {

            const txResponse = this.signer.sendTransaction(tx);
            console.log('## txResponse ##');
            console.dir(txResponse);

            const receipt = await txResponse.wait();
            console.log('## txReceipt ##');
            console.dir(receipt);
            return receipt;

        } catch (error) {
            this.notif.sendDiscord(`failed to send transaction: ${error}`);
            return null;
        }
    }




    async execute(action, cb, target) {
        this.executionState = {
            action,
            cb,
            target,
            trace: [],
            result: {},
        };

        let result = {};

		// TODO: GAD update lastActionTimestamp after callback

        switch (action.name) {
            case Action.NO_OP:
                break;

            case Action.ENTER:
                // console.log("executor.execute: Action.ENTER entering syrup pool");
                // result = await
                    return this.enterPosition();
                // break;

            case Action.COMPOUND:
                // return this.compound();
                result = await this.compound();
                return result;
                // break;

            case Action.SWITCH:
                // console.log("executor.execute: Action.SWITCH, switching syrup pools for better yield");
                result = await this.switchPools();
                return result;

            case Action.EXIT:
                // console.log("executor.execute: Action.EXIT, withdraw all funds back home ");
                // result = await
                    return this.exitPosition();
                // break;

            default:
                return this.invalidAction();
                // console.log(" invalid action");
                // result.status = "invalid-action";
        }

        // await this.callBack(this.target, this.action, result);

    }

    async enterPosition() {
        console.log("executor.execute: Action.ENTER entering syrup pool");
    }

    async enterPosition2() {
        const receipts = [];
        // check approve
        {
            // approve syrup pool
            const approveTx = {
                from: this.account.address,
                to: to_address,
                value: ethers.utils.parseEther(send_token_amount),
                nonce: window.ethersProvider.getTransactionCount(
                    send_account,
                    "latest"
                ),
                gasLimit: ethers.utils.hexlify(gas_limit), // 100000
                gasPrice: gas_price,
            }
            console.dir(approveTx);
            let receipt = await this.sendTransactionWait(approveTx);
            receipts.push(receipt);

            if (receipt == null) {
                return {
                    status: "failure",
                    description: "on approve ..",
                    receipts: receipts,
                };
            }
        }

        // stake in syrup pool
        {
            const depositTx = {
                from: this.account.address,
                to: to_address,
                value: ethers.utils.parseEther(send_token_amount),
                nonce: window.ethersProvider.getTransactionCount(
                    send_account,
                    "latest"
                ),
                gasLimit: ethers.utils.hexlify(gas_limit), // 100000
                gasPrice: gas_price,
            }
            console.dir(depositTx);
            let receipt = await this.sendTransactionWait(depositTx);
            receipts.push(receipt);

            if (receipt == null) {
                return {
                    status: "failure",
                    description: "on deposit ..",
                    receipts: receipts,
                };
            }
        }


        return {
            status: "success",
            description: "entered syrup pool",
            receipts: receipts,
        };
    }

    async exitPosition() {

    }

    async depositCake(target) {

    }

    handleError(err) {
        console.log(err);
    }

    async resolve1() {
        const action = this.executionState.action;
        const callback = this.executionState.cb;
        const target = this.executionState.target;
        const result = this.executionState.result;
        return callback(target, action, result)
    }

    async compound() {
        console.log("executor.execute: compounding");
        await this.withdraw()
            .then( async (res) => await this.swap(res))
            .then(async () => await this.getCakeBalance())
            .then(this.depositCake)
            .catch(() => this.handleError())
            .finally(async () => await this.resolve1());
    }

    async switchPools() {

    }



// ############ helpers ###########
    async approve() {

    }

    async getCakeBalance() {
        console.log("getCakeBalance ###############");
        console.log(this.name);
        const balance = await this.cakeContract.balanceOf(await this.signer.getAddress());
        console.log(balance);
        return balance;


    }

    async withdraw() {
        console.log("executor.execute: withdraw");
        const cakeBalance = await this.getCakeBalance();
        const result = {
            cakeBalance,
            syrup: {
                token: "tester",
                amount: 123,
            }
        };

        this.executionState.trace.push(result);

        return result;
    }

    async swap(input) {
        console.log("executor.execute: swap");

        console.log(input.syrup);
        const result = {
            cakeOut: 1111,
        }
        this.executionState.trace.push(result);

        return result;
    }



}

module.exports = {
    Executor,
};
