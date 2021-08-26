const hre = require("hardhat");
const { ethers } = require("hardhat");

const KeyEncryption = require('./keyEncryption');
const env = require('dotenv').config();
const { Strategy } = require('./strategy/strategy');
const { RunningMode, DEV_ACCOUNT } = require('./config');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;


const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function main() {

	console.debug(`[PID pid ${process.pid}] Starting Bot-${process.env.BOT_ID}`);
    await hre.run('compile');
    const runningMode = (argv.dev? RunningMode.DEV: RunningMode.PRODUCTION);

    let signer;
    if (runningMode === RunningMode.PRODUCTION) {
        const wallet = new ethers.Wallet(await new KeyEncryption().loadKey());
        signer = wallet.connect(ethers.provider);

    } else if (runningMode === RunningMode.DEV) {
        signer = await ethers.getSigner(DEV_ACCOUNT);

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [DEV_ACCOUNT],
        });
        await hre.network.provider.request({
            method: "hardhat_setBalance",
            params: [DEV_ACCOUNT, "0x100000000000000000000"]
        });

    }

    const strategy = new Strategy(env, runningMode, signer);
    await strategy.start();
}


main()
    .then(() => {
		console.debug("Bot is running");
	})
	.catch((error) => {
        console.error(error);
        process.exit(1);
    });


