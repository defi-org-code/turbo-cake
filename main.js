const hre = require("hardhat");
const envConfig = require('dotenv').config();
const {Strategy, RunningMode} = require('./strategy/strategy');

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;

async function main() {

	console.debug(`[PID pid ${process.pid}] Starting Bot-${process.env.BOT_ID}`);

    await hre.run('compile');
    const runningMode = (argv.dev? RunningMode.DEV: RunningMode.PRODUCTION);
    const strategy = new Strategy(envConfig, runningMode);
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


