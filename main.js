const hre = require("hardhat");
let {web3} = require("hardhat");
const BigNumber = require('bignumber.js')

const KeyEncryption = require('./keyEncryption');
const env = require('dotenv').config();
const { Strategy } = require('./strategy/strategy');
const { RunningMode, CAKE_WHALE_ACCOUNT, CAKE_ADDRESS} = require('./config');
const yargs = require('yargs/yargs');
const {CAKE_ABI} = require("./abis");
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;

const {Logger} = require('./logger')
const logger = new Logger('main')

async function main() {

    const runningMode = (argv.prod==="true"? RunningMode.PRODUCTION: RunningMode.DEV);

    let account
	// let web3

    if (runningMode === RunningMode.PRODUCTION) {
    	const Web3 = require("web3");
		web3 = new Web3(process.env.ENDPOINT_HTTPS);
	    account = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

    } else if (runningMode === RunningMode.DEV) {

        // account = web3.eth.accounts.create();
	    account = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

		await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [CAKE_WHALE_ACCOUNT]});
        await hre.network.provider.request({method: "hardhat_setBalance", params: [account.address, "0x100000000000000000000"]});

        const cakeContract =  new web3.eth.Contract(CAKE_ABI, CAKE_ADDRESS);
        let amount = new BigNumber(1e18) //await cakeContract.methods.balanceOf(CAKE_WHALE_ACCOUNT).call()
        await cakeContract.methods.transfer(account.address, amount.toString()).send({ from: CAKE_WHALE_ACCOUNT});
    }

    web3.eth.defaultAccount = account.address;

    logger.debug(`[PID pid ${process.pid}] Starting Bot: address=${account.address}, mode=${runningMode}, mute-discord=${process.env.MUTE_DISCORD}`);

    const strategy = new Strategy(env, runningMode, account, web3);
    await strategy.start();
}


main()
    .then(() => {
		logger.debug(`Bot initialized and running, mute discord notification = ${process.env.MUTE_DISCORD}`);
	})
	.catch((error) => {
        logger.error(error);
        process.exit(1);
    });


