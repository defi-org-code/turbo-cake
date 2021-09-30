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
	const command = 'TransferToOwner'
	redisClient.set(`command.${process.env.BOT_ID}`, command)
	logger.info(`${command} command was sent`)
}


transferToOwner()
    .then(() => {
		logger.debug(`all done`);
		process.exit()
	})
	.catch((error) => {
        logger.error(error);
        process.exit(1);
    });


