const Web3 = require('web3')
const web3 = new Web3(process.env.ENDPOINT_HTTPS)

const asyncRedis = require("redis");
const Notifications = require('../notifications');
const {GreedyPolicy, Action} = require("./policy");
const {Executor} = require("./executor");
const {Pancakeswap} = require("./pancakeswap");

const {
    RunningMode, DEV_ACCOUNT, DEV_SMARTCHEF_ADDRESS_LIST,
    MIN_SEC_BETWEEN_SYRUP_SWITCH, MIN_SEC_BETWEEN_HARVESTS,
    PANCAKE_UPDATE_INTERVAL, TICK_INTERVAL, SWAP_SLIPPAGE, SWAP_TIME_LIMIT,
} = require("../config");
const debug = (...messages) => console.log(...messages)
const {TransactionFailure, FatalError, GasError, NotImplementedError} = require('../errors');


function loadConfig(env) {
    let config = {};

    config.pancakeUpdateInterval = PANCAKE_UPDATE_INTERVAL;
    config.minSecBetweenSyrupSwitch = MIN_SEC_BETWEEN_SYRUP_SWITCH;
    config.minSecBetweenHarvests = MIN_SEC_BETWEEN_HARVESTS;
    config.tickInterval = TICK_INTERVAL;
    config.swapSlippage = SWAP_SLIPPAGE;
    config.swapTimeLimit = SWAP_TIME_LIMIT;
    config.devSmartchefAddressList = DEV_SMARTCHEF_ADDRESS_LIST;
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
        this.executor = null;
        this.nextAction = { name: Action.NO_OP,};
        this.tickIndex = 0;
        this.config = config;
        this.tickInterval = config.tickInterval;

        this.runningMode = runningMode;
        this.name = "pancakeswap-strategy";
        this.lastActionTimestamp = Date.now() - config.minSecBetweenSyrupSwitch - 1;
        this.curSyrupPoolAddr = null;

    }


    async start() {
        try {
            if (this.runningMode === RunningMode.DEV) {
                //DEBUG
                this.policy.pause();
                this.ps.pause();
                // RMOVE
            }
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
        await this.setupState();
    }

    async setupState() {
        // TODO: infer from bsc
    }

    redisInit() {
        this.redisClient = asyncRedis.createClient();
        this.redisClient.on("error", function (error) {
            console.error(error)
            throw new FatalError(`fatal redis error: ${error}`)
        });

        this.redisClient.on("ready", function () {
            debug('redis ready')
        });
    }

    inTransition() {
        return this.executor != null;
    }

    runDevOverride() {

        this.tickIndex++;
        console.log(" tick number: ", this.tickIndex);


        if (this.tickIndex === 1) {
            this.nextAction =
                {
                    name: Action.EXIT,
                    args: {
                        poolAddress: this.config.devSmartchefAddressList[0],
                    },
                    description: "FAKE action",
                }

        }

        if (this.tickIndex === 5) {
            this.nextAction =
                {
                    name: Action.ENTER,
                    args: {
                        poolAddress: this.config.devSmartchefAddressList[0],
                    },
                    description: "FAKE action",
                }

        }
        if (this.tickIndex === 10) {
            this.nextAction =
                {
                    name: Action.HARVEST,
                    args: {
                        poolAddress: this.config.devSmartchefAddressList[0],
                    },
                    description: "FAKE action",
                }
        }

        if (this.tickIndex === 15) {
            this.nextAction =
                {
                    name: Action.SWITCH,
                    args: {
                        from: this.config.devSmartchefAddressList[0],
                        to: this.config.devSmartchefAddressList[1],
                    },
                    description: "FAKE action",
                }
            console.dir(this.nextAction);
        }

        if (this.tickIndex === 20) {
            clearInterval(this.intervalId);
            process.exit()
        }

    }

    async run() {

        try {
            if (this.inTransition()) {
                return;
            }

            this.runDevOverride();
            await this.ps.update();
            await this.setAction();
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
        const lastAction = this.nextAction;
        this.nextAction = await this.policy.getAction({
            'poolsInfo': this.ps.poolsInfo,
            'curSyrupPoolAddr': this.curSyrupPoolAddr,
            'lastActionTimestamp': this.lastActionTimestamp,
            'lastAction': lastAction,
        });
    }

    async executeAction() {

        const action = this.nextAction; // closure
        const startTime = Date.now();

        if (action.name === Action.NO_OP) {
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
        this.nextAction = { name: Action.NO_OP,};
        this.executor = null;
    }

    async handleExecutionError(err, action, startTime) {
        console.log(`strategy.handleExecutionError:: 
					action = ${JSON.stringify(action)}
		            exec time(sec) = ${(Date.now() - startTime) / 1000}; `);

        this.nextAction = { name: Action.NO_OP,};
        // TODO: continue flow according to trace - executor.retry
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
}
