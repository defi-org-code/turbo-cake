
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

const {SMARTCHEF_INITIALIZABLE_ABI} = require("../abis");
const {
    RunningMode, DEV_ACCOUNT, DEV_SMARTCHEF_ADDRESS,
    MIN_SEC_BETWEEN_SYRUP_SWITCH, MIN_SEC_BETWEEN_HARVESTS,
    PANCAKE_UPDATE_INTERVAL, TICK_INTERVAL, SWAP_SLIPPAGE, SWAP_TIME_LIMIT,
} = require("../config");
const debug = (...messages) => console.log(...messages)
const {TransactionFailure, FatalError, GasError, NotImplementedError} = require('../errors');


function loadConfig(baseConfig) {
    let config = {};

    config.pancakeUpdateInterval = PANCAKE_UPDATE_INTERVAL;
    config.minSecBetweenSyrupSwitch = MIN_SEC_BETWEEN_SYRUP_SWITCH;
    config.minSecBetweenHarvests = MIN_SEC_BETWEEN_HARVESTS;
    config.tickInterval = TICK_INTERVAL;
    config.swapSlippage = SWAP_SLIPPAGE;
    config.swapTimeLimit = SWAP_TIME_LIMIT;
    config.devSmartchefAddress = DEV_SMARTCHEF_ADDRESS;
    config.devAccount = DEV_ACCOUNT;
    return config;
}


class Strategy {

    constructor(env, runningMode, signer) {
        this.state = {
            position: null,
            terminating: false,
        }
        const config = loadConfig(env);
        debug(config);

        this.signer = signer;
        this.notif = new Notifications(runningMode);
        this.redisInit();
		this.ps = new Pancakeswap(this.redisClient, web3, this.notif);
        this.policy = new GreedyPolicy({
            minSecBetweenSyrupSwitch: config.minSecBetweenSyrupSwitch,
            minSecBetweenHarvests: config.minSecBetweenHarvests,

        });
        this.executor = new Executor({'notifClient': this.notif, 'signer': signer, 'action': Action, 'swapSlippage': env.swapSlippage, 'swapTimeLimit': env.swapTimeLimit});
        this.tickIndex = 0;
        this.config = config;
        this.tickInterval = config.tickInterval;

        this.name = "pancakeswap-strategy";
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

    inTransition() {
        return this.executor != null;
    }

	async run() {

        try {
            if (this.inTransition()) {
                return;
            }
            this.tickIndex++;
            console.log(" tick number: ", this.tickIndex);

			await this.ps.update();
            await this.setAction();
            if (this.tickIndex === 3) {
                console.log("FAKE action");
                this.nextAction =
                    {
                        name: Action.HARVEST,
                        args: {
                            to: this.config.devSmartchefAddress,
                            // "0x0446b8f8474c590d2249a4acdd6eedbc2e004bca",
                            // to: "TARGET_ADDRESS",
                        }
                    }
            }

            if (this.tickIndex === 5) {
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

                case Action.HARVEST:
                    console.log(" harvest cb");
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

        const action = this.nextAction; // closure
        const startTime = Date.now();

        if (action.name === Action.NO_OP) {
            this.executor = null;
            return;
        }

        if (action.name === Action.ENTER) {
            this.executor = null;
            return;
        }

        this.executor = new Executor({
            action: action,
            signer: this.signer,
            notifClient: this.notif,
            swapSlippage: this.config.swapSlippage,
            swapTimeLimit: this.config.swapTimeLimit,
        });

        this.executor.on("failure", async (trace) => await this.handleExecutionError(trace, action, startTime));
        this.executor.on("success", async (trace) => await this.handleExecutionSuccess(trace, action, startTime));

        await this.executor.run();
    }

    async handleExecutionSuccess(trace, action, startTime) {
        console.log(`strategy.handleExecutionSuccess::
					action = ${JSON.stringify(action)}
		            exec time(sec) = ${(Date.now() - startTime) / 1000}; `);
        this.executor = null;
    }

    async handleExecutionError(err, action, startTime) {
        console.log(`strategy.handleExecutionError::
					action = ${JSON.stringify(action)}
		            exec time(sec) = ${(Date.now() - startTime) / 1000}; `);

        this.executor = null;
    }


    beforeExit(e) {
        this.notif.sendDiscord(`Terminating process: ${e}`)
        debug(e.stack)
        process.exit()
    }


}

module.exports = {
	Strategy,
	RunningMode
}
