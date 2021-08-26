
// const { ethers, web3 } = require("hardhat");
const { ethers} = require("hardhat");

const Web3 = require('web3')
const web3 = new Web3(process.env.ENDPOINT_HTTPS)

const redis = require("redis");
const asyncRedis = require("async-redis");

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


class Strategy{

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
        this.executor = new Executor({'strategy': this, 'notifClient': this.notif, 'signer': signer, 'action': Action, 'swapSlippage': env.swapSlippage, 'swapTimeLimit': env.swapTimeLimit});
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
		await this.executor.init();
		await this.setupState();
	}

	async setupState() {
		// TODO: infer from bsc
	}

	redisInit() {
		this.redisClient = asyncRedis.createClient()
		this.redisClient.on("error", function(error) {
			console.error(error)
			throw new FatalError(`fatal redis error: ${error}`)
		});

		this.redisClient.on("ready", function() {
			debug('redis ready')
		});
	}

	async run() {

        try {

			await this.ps.update();
            await this.setAction();
            await this.executor.run(this.nextAction);
            process.exit()

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

    async handleExecutionSuccess(trace) {
        // console.log(`strategy.handleExecutionSuccess::
		// 			action = ${JSON.stringify(action)}
		//             exec time(sec) = ${(Date.now() - startTime) / 1000}; `);

		console.log(trace)
    }

    async handleExecutionError(trace) {
		console.log(trace)

        // console.log(`strategy.handleExecutionError::
		// 			action = ${JSON.stringify(action)}
		//             exec time(sec) = ${(Date.now() - startTime) / 1000}; `);
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
