const hre = require("hardhat");
const Web3 = require("web3");
// const { web3 } = require("hardhat");

const KeyEncryption = require('./keyEncryption');
const env = require('dotenv').config();
const { Strategy } = require('./strategy/strategy');
const { RunningMode, CAKE_WHALE_ACCOUNT, CAKE_ADDRESS } = require('./config');
const yargs = require('yargs/yargs');
const {CAKE_ABI} = require("./abis");
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;


const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function main() {

    const runningMode = (argv.prod==="true"? RunningMode.PRODUCTION: RunningMode.DEV);

    const web3 = new Web3(process.env.ENDPOINT_HTTPS);
    const account = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

    //
    // let w3;
    // let account;
    // if (runningMode === RunningMode.PRODUCTION) {
    //     w3 = new Web3(process.env.ENDPOINT_HTTPS);
    //     account = w3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());
    //
    // } else if (runningMode === RunningMode.DEV) {
    //     w3 = web3;
    //     account = w3.eth.accounts.create();
    //
    //     await hre.network.provider.request({
    //         method: "hardhat_impersonateAccount",
    //         params: [CAKE_WHALE_ACCOUNT]
    //     });
    //
    //     await hre.network.provider.request({
    //         method: "hardhat_setBalance",
    //         params: [account.address, "0x100000000000000000000"]
    //     });
    //
    //     const cakeContract =  new web3.eth.Contract(
    //         CAKE_ABI,
    //         CAKE_ADDRESS);
    //
    //     const amount = "16430879919436733160900"
    //     await cakeContract.methods.transfer(account.address, amount).send({ from: CAKE_WHALE_ACCOUNT });
    //     console.log(await cakeContract.methods.balanceOf(account.address).call());
    //
    //
    // }
    // w3.eth.defaultAccount = account.address;

    console.debug(`[PID pid ${process.pid}] Starting Bot-${account.address} in ${runningMode} mode`);

    const strategy = new Strategy(env, runningMode, account, web3);
    await strategy.start();
}


main()
    .then(() => {
		console.debug("Bot initialized and running");
	})
	.catch((error) => {
        console.error(error);
        process.exit(1);
    });


