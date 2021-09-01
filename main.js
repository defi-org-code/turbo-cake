const hre = require("hardhat");

const KeyEncryption = require('./keyEncryption');
const env = require('dotenv').config();
const { Strategy } = require('./strategy/strategy');
const { RunningMode, CAKE_WHALE_ACCOUNT, CAKE_ADDRESS, MUTE_NOTIF } = require('./config');
const yargs = require('yargs/yargs');
const {CAKE_ABI} = require("./abis");
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;


async function main() {

    const runningMode = (argv.prod==="true"? RunningMode.PRODUCTION: RunningMode.DEV);

    let account
	let web3

    if (runningMode === RunningMode.PRODUCTION) {
    	const Web3 = require("web3");
		web3 = new Web3(process.env.ENDPOINT_HTTPS);
	    account = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

    } else if (runningMode === RunningMode.DEV) {
		web3 = require("hardhat");
        // account = web3.eth.accounts.create();
	    account = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

		await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [CAKE_WHALE_ACCOUNT]});
        await hre.network.provider.request({method: "hardhat_setBalance", params: [account.address, "0x100000000000000000000"]});

        const cakeContract =  new web3.eth.Contract(CAKE_ABI, CAKE_ADDRESS);
        let amount = await cakeContract.methods.balanceOf(CAKE_WHALE_ACCOUNT).call()
        await cakeContract.methods.transfer(account.address, amount.toString()).send({ from: CAKE_WHALE_ACCOUNT});
    }

    web3.eth.defaultAccount = account.address;

    console.debug(`[PID pid ${process.pid}] Starting Bot: address=${account.address}, mode=${runningMode}`);

    const strategy = new Strategy(env, runningMode, account, web3);
    await strategy.start();
}


main()
    .then(() => {
		console.debug(`Bot initialized and running, mute discord notification = ${MUTE_NOTIF}`);
	})
	.catch((error) => {
        console.error(error);
        process.exit(1);
    });


