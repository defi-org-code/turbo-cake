const hre = require("hardhat");
const envConfig = require('dotenv').config();
const {Strategy} = require('./strategy/strategy');

// const args = process.argv.slice(2);

async function main() {

	console.debug(`[PID pid ${process.pid}] Starting Bot-${process.env.BOT_ID}`);

    await hre.run('compile');

    const strategy = new Strategy(envConfig);
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


