
const { ethers, web3 } = require("hardhat");
const asyncRedis = require("async-redis");

const KeyEncryption = require('../keyEncryption');
const Notifications = require('../notifications');
const { GreedyPolicy, Action } = require("./policy");
const { Executor } = require("./executor");
const { PancakeswapEnvironment } = require("./pancakeswap");

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
		this.env = new PancakeswapEnvironment({
			pancakeUpdateInterval: config.pancakeUpdateInterval,
			},
			this.redisClient);
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

		await this.env.init();
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

			await this.update();
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

	async update() {
		await this.env.update();
	}

	async setAction() {
		const policyInputArgs = this.getPolicyInputArgs();
		this.nextAction = await this.policy.getAction(policyInputArgs);
	}

	getPolicyInputArgs() {
		const args = {
			poolsInfo: this.getPoolsInfo(),
			cakeBalance: this.getCakeBalance(),
		};
		return args;
	}

	getPoolsInfo() {
		return null;
	}

	getCakeBalance() {
		return 0;
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