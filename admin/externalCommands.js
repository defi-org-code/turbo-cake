const asyncRedis = require("async-redis");
const prompt = require('prompt-sync')({sigint: true});
require('dotenv').config();

const COMMANDS = {
	0: 'TransferToOwner'
}

async function redisInit() {
	const redisClient = asyncRedis.createClient();
	redisClient.on("error", function (error) {
		console.info(error)
		throw new Error(`fatal redis error: ${error}`)
	});

	redisClient.on("ready", function () {
		// console.info('redis ready')
	});

	return redisClient
}

async function externalCommands() {

	const redisClient = await redisInit();
	let command
	const validCommands = Object.keys(COMMANDS)
	console.log('please choose action: ')
	console.log(COMMANDS)

	// TODO: protect with password
	command = prompt('')

	while (!(command in validCommands)) {
		command = prompt(`please choose from: [${validCommands}]: `)
	}

	let commandParams = 'null'

	let approve = prompt(`do you sure you want to send ${COMMANDS[command]} command to bot? [yes | any key to abort]: `)

	if (approve !== 'yes') {
		console.log(`aborting ...`)
		return
	}

	await redisClient.set(`commandParams.${process.env.BOT_ID}`, commandParams)
	await redisClient.set(`command.${process.env.BOT_ID}`, COMMANDS[command])
	console.log(`${COMMANDS[command]} command was sent`)
}


externalCommands()
    .then(() => {
		process.exit()
	})
	.catch((error) => {
        console.info(error);
        process.exit(1);
    });


