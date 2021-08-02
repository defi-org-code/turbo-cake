const Strategy = require('./strategy/strategy')
require('dotenv').config();

// const args = process.argv.slice(2);

async function main() {

	console.debug(`[PID pid ${process.pid}] Starting Bot-${process.env.BOT_ID}`);

	const strategy = new Strategy();
	await strategy.start()
}

main()
