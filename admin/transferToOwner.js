const hre = require("hardhat");
let {web3} = require("hardhat");
const Web3 = require("web3");

const KeyEncryption = require('../keyEncryption');
const {OWNER_ADDRESS, ADMIN_ADDRESS} = require('../config');

const {Logger} = require('../logger')
const logger = new Logger('TransferToOwner')
const asyncRedis = require("async-redis");

const Commands = {
	'TransferToOwner': 0
}

async function redisInit() {
	const redisClient = asyncRedis.createClient();
	redisClient.on("error", function (error) {
		logger.error(error)
		throw new Error(`fatal redis error: ${error}`)
	});

	redisClient.on("ready", function () {
		logger.info('redis ready')
	});

	return redisClient
}

async function transferToOwner() {

	const redisClient = await redisInit();
	redisClient.set(`command.${process.env.BOT_ID}`, 'TransferToOwner')
	console.log(`manager contract deployed at address: ${managerContract.options.address}`)
}


transferToOwner()
    .then(() => {
		logger.debug(`all done`);
	})
	.catch((error) => {
        logger.error(error);
        process.exit(1);
    });


