
// const { ethers, web3 } = require("hardhat");
const { ethers} = require("hardhat");

const Web3 = require('web3')
const web3 = new Web3(process.env.ENDPOINT_HTTPS)

const asyncRedis = require("redis");

const KeyEncryption = require('../keyEncryption');
const Notifications = require('../notifications');
const { GreedyPolicy, Action } = require("./policy");
const { Executor } = require("./executor");
const {Pancakeswap} = require("./pancakeswap");

const debug = (...messages) => console.log(...messages)
const {TransactionFailure, FatalError, GasError, NotImplementedError} =  require('../errors');


function loadConfig(baseConfig) {
	let config = baseConfig;
	return config;
}


const RunningMode = {
	DEV: "development",
	PRODUCTION: "production",
}


class Strategy {

	constructor(envConfig, runningMode) {
		this.state = {
			position: null,
			terminating: false,
		}
		const config = loadConfig(envConfig);
		this.notif = new Notifications();
		this.redisInit();
		this.ps = new Pancakeswap(this.redisClient, web3, this.notif);
		this.policy = new GreedyPolicy({
			minTimeBufferSyrupSwitch: config.minTimeBufferSyrupSwitch,
			minTimeBufferCompounds: config.minTimeBufferCompounds,

		});
		this.executor = new Executor(ethers, this.notif);
		this.runIndex = 0;
		this.config = config;
		this.inTransition = false;
		this.tickInterval = 2000; //config.tickInterval;

		this.wallet = null;
		this.signer = null;

		this.runningMode = runningMode;
		this.lastActionTimestamp = Date.now() - config.minTimeBufferSyrupSwitch - 1;
		this.curSyrupPoolAddr = null;
	}


	async start() {
		try {
			await this.init();

		} catch (e) {
			this.notif.sendDiscord(`[ERROR] unhandled error: ${e}`);
			this.beforeExit(e);
		}

		this.intervalId = setInterval(() => this.run(), this.tickInterval);
		await this.run();
	}

	async init() {
		if (this.runningMode === RunningMode.PRODUCTION) {
			this.wallet = new ethers.Wallet(await new KeyEncryption().loadKey());
			this.signer = this.wallet.connect(ethers.provider);
		} else if (this.runningMode === RunningMode.DEV) {
			this.signer = await ethers.getSigner("0x73feaa1eE314F8c655E354234017bE2193C9E24E");
		}

		await this.ps.init();
		await this.executor.init(this.signer);
		await this.setupState();
	}

	async setupState() {
		// TODO: infer from bsc
	}

	redisInit() {
		this.redisClient = asyncRedis.createClient();
		this.redisClient.on("error", function(error) {
			console.error(error)
			throw new FatalError(`fatal redis error: ${error}`)
		});

		this.redisClient.on("ready", function() {
			debug('redis ready')
		});
	}

	async run() {
		console.log(" run number: ", this.runIndex);
		this.runIndex++;

		try {
			if (this.inTransition) {
				return;
			}

			await this.ps.update();
			await this.setAction();

			if (this.runIndex == 3) {
				console.log( "FAKE action");
				this.nextAction =
				  {
							name: Action.COMPOUND,
							args: {
								to: "TARGET_ADDRESS",
							}
				}
			}

			if (this.runIndex === 5) {
				clearInterval(this.intervalId);
				process.exit()
			}
			await this.executeAction();
		} catch (e) {
			// TODO: web provider rate limit support
			debug(e)

			if (e instanceof FatalError) {
				this.beforeExit(e)
			} else {
				this.beforeExit(e)
			}
		}
	}

	async setAction() {
		this.nextAction = await this.policy.getAction({
			'poolsInfo': this.ps.poolsInfo,
			'curSyrupPoolAddr': this.curSyrupPoolAddr,
			'lastActionTimestamp': this.lastActionTimestamp
		});
	}

	executeActionCallback(self, action, result) {
		// self.inTransition = false;
		if (result.status === "success") {
			switch (action.name) {
				case Action.NO_OP:
					break;

				case Action.ENTER:
					console.log(" entered syrup pool");
					self.state.position = {
						poolAddr: action.args.to,
						cakeAmount: action.args.cakeAmount,
					}
					break;

				case Action.COMPOUND:
					console.log(" compounded");
					self.state.position = {
						poolAddr: action.args.to,
						cakeAmount: action.args.cakeAmount,
					}
					break;

				case Action.SWITCH:
					console.log(" switched syrup pool");
					self.state.position = {
						poolAddr: action.args.to,
						cakeAmount: action.args.cakeAmount,
					};
					break;

				case Action.EXIT:
					console.log(" bot exited all positions ");
					self.state.position = null;
					break;

				default:
					console.log(" invalid action");

			}
		} else {


		}

	}

	async executeAction() {
		// this.inTransition = true;
		await this.executor.execute(this.nextAction, this.executeActionCallback, this);
	}


	beforeExit(e) {
		this.notif.sendDiscord(`Terminating process: ${e}`)
		debug(e.stack)
		process.exit()
	}


}

module.exports = {
	Strategy,
	RunningMode,
};
