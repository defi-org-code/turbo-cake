const asyncRedis = require("async-redis");
const Notifications = require('../notifications');
const {GreedyPolicy, Action} = require("./policy");
const {Batcher} = require("./batcher");
const {Pancakeswap} = require("./pancakeswap");
const {Reporter} = require('../reporter')
const {ContractManager} = require('./contractManager')
const {
    RunningMode, DEV_ACCOUNT, DEV_SMARTCHEF_ADDRESS_LIST,
    SYRUP_SWITCH_INTERVAL, HARVEST_INTERVAL,
    PANCAKE_UPDATE_INTERVAL, TICK_INTERVAL, SWAP_SLIPPAGE, SWAP_TIME_LIMIT, APY_SWITCH_TH,
    DEV_TICK_INTERVAL, DEV_PANCAKE_UPDATE_INTERVAL, DEV_SYRUP_SWITCH_INTERVAL, DEV_HARVEST_INTERVAL,
    BEST_ROUTE_UPDATE_INTERVAL, DEV_BEST_ROUTE_UPDATE_INTERVAL, DEV_RAND_APY,
    REPORT_INTERVAL
} = require("../config");
const {TransactionFailure, FatalError, GasError, NotImplementedError} = require('../errors');

const {Logger} = require('../logger')
const logger = new Logger('strategy')

function loadConfig(runningMode) {
    let config = {};

    if (runningMode === RunningMode.DEV) {

        config.pancakeUpdateInterval = DEV_PANCAKE_UPDATE_INTERVAL
        config.syrupSwitchInterval = DEV_SYRUP_SWITCH_INTERVAL
        config.harvestInterval = DEV_HARVEST_INTERVAL
        config.tickInterval = DEV_TICK_INTERVAL
        config.bestRouteUpdateInterval = DEV_BEST_ROUTE_UPDATE_INTERVAL
        config.randApy = DEV_RAND_APY

    } else {

        config.pancakeUpdateInterval = PANCAKE_UPDATE_INTERVAL;
        config.syrupSwitchInterval = SYRUP_SWITCH_INTERVAL;
        config.harvestInterval = HARVEST_INTERVAL;
        config.tickInterval = TICK_INTERVAL;
        config.bestRouteUpdateInterval = BEST_ROUTE_UPDATE_INTERVAL
        config.randApy = false
    }

    config.runningMode = runningMode;
    config.swapSlippage = SWAP_SLIPPAGE;
    config.swapTimeLimit = SWAP_TIME_LIMIT;
    config.devSmartchefAddressList = DEV_SMARTCHEF_ADDRESS_LIST;
    config.devAccount = DEV_ACCOUNT;
    config.apySwitchTh = APY_SWITCH_TH;
    config.reportInterval = REPORT_INTERVAL
    return config;
}

class Strategy {

    constructor(env, runningMode, account, web3) {

        this.state = {
            position: null,
            terminating: false,
        }
        const config = loadConfig(runningMode);
        console.log(config);

        this.web3 = web3;
        this.account = account;
        this.notif = new Notifications(runningMode);
        this.redisInit();
        this.ps = new Pancakeswap(account.address, this.redisClient, web3, this.notif,
            config.pancakeUpdateInterval, config.bestRouteUpdateInterval);
        this.policy = new GreedyPolicy(config);
        // this.contractManager = new ContractManager(web3, this.account, this.redisClient)
		this.batcher = new Batcher({
			web3: web3,
			account: account,
			notifClient: this.notif,
			swapSlippage: config.swapSlippage,
			swapTimeLimit: config.swapTimeLimit,
			redisClient: this.redisClient
		});

        this.nextAction = {name: Action.NO_OP,};
        this.tickIndex = 0;
        this.config = config;
        this.tickInterval = config.tickInterval;
        this.reportInterval = config.reportInterval
		this.syrupSwitchInterval = config.syrupSwitchInterval

        this.runningMode = runningMode;
        this.name = "pancakeswap-strategy";
        this.lastActionTimestamp = null;
        this.inTransition = false;

		this.reporter = new Reporter(runningMode)
    }

	async getLastActionTimestamp() {

		let reply = await this.redisClient.get('lastActionTimestamp')

		logger.info(`get lastActionTimestamp from redis: ${reply}`)

		if (reply == null) {
			await this.setLastActionTimestamp()
			return this.lastActionTimestamp
		}

		else {
			return reply
		}
	}

	async setLastActionTimestamp() {
		const timestamp = Date.now()
		this.lastActionTimestamp = timestamp
		await this.redisClient.set('lastActionTimestamp', timestamp)
		logger.info(`lastActionTimestamp was set to ${timestamp}`)
	}

    async start() {

        try {
        	logger.debug(`[Strategy] start`)

	        this.lastActionTimestamp = await this.getLastActionTimestamp();

			this.curSyrupPoolAddr = await this.ps.init();
			// this.curSyrupPoolAddr = await this.contractManager.init();

            this.intervalId = setInterval(() => this.run(), this.tickInterval);
            // setInterval(() => this.reportStats(), this.reportInterval);

        } catch (e) {
            this.notif.sendDiscord(`[ERROR] unhandled error: ${e}`);
            this.beforeExit(e);
        }
    }

	async reportStats() {
		const investApy = await this.ps.getInvestApy(this.curSyrupPoolAddr)

		if (investApy === null) {
			return
		}

		logger.debug(`reportStats: investApy=${investApy}`)
		this.notif.sendDiscord(`apy: ${investApy}`)
		await this.reporter.send({apy: investApy})
	}

    redisInit() {
        this.redisClient = asyncRedis.createClient();
        this.redisClient.on("error", function (error) {
            console.error(error)
            throw new FatalError(`fatal redis error: ${error}`)
        });

        this.redisClient.on("ready", function () {
            logger.debug('redis ready')
        });
    }

    async run() {

		logger.debug('strategy run')
        try {
            if (this.inTransition) {
            	logger.debug('inTransition')
                return;
            }

            this.inTransition = true;

            await this.ps.update(this.curSyrupPoolAddr);
            logger.debug('ps update ended')
            await this.setAction();
            logger.debug('set action ended')
            // await this.contractManager.run(this.nextAction);
            await this.executeAction();
            logger.debug('executeAction ended')

        } catch (e) {

			this.beforeExit(e)

            // if (e instanceof FatalError) {
            //     this.beforeExit(e)
			//
            // } else {
            //     this.beforeExit(e)
            // }
        }
    }

    async setAction() {
        const lastAction = this.nextAction;
        // logger.debug(`setAction: nextAction=${JSON.stringify(this.nextAction)}`)
        this.nextAction = await this.policy.getAction({
            'poolsInfo': this.ps.poolsInfo,
            'curSyrupPoolAddr': this.curSyrupPoolAddr,
            'lastActionTimestamp': this.lastActionTimestamp,
            'lastAction': lastAction,
        });
    }

    async executeAction() {

		logger.debug('executeAction')

        const action = this.nextAction; // closure
        const startTime = Date.now();

        if (action.name === Action.NO_OP) {
            this.batcher = null;
            this.inTransition = false;
            return;
        }

        this.batcher.on("failure", async (trace) => await this.handleExecutionError(trace, action, startTime));
        this.batcher.on("success", async (trace) => await this.handleExecutionSuccess(trace, action, startTime));

        await this.batcher.run(action);
    }

    async handleExecutionSuccess(trace, action, startTime) {
        this.notif.sendDiscord(`strategy.handleExecutionSuccess:
					action = ${JSON.stringify(action)}
		            exec time(sec) = ${(Date.now() - startTime) / 1000}; `);

        this.curSyrupPoolAddr = action.to.address
        this.batcher = null;
        this.inTransition = false;
		await this.setLastActionTimestamp()

        if (action.name === Action.EXIT) {
            clearInterval(this.intervalId);
            this.inTransition = true;
        }

        if (action.name === Action.HARVEST) {
        	await this.reportStats()
        }
    }

    async handleExecutionError(err, action, startTime) {
        this.notif.sendDiscord(`strategy.handleExecutionError:
					action = ${JSON.stringify(action)}
		            exec time(sec) = ${(Date.now() - startTime) / 1000}; `);

        // this.nextAction = { name: Action.NO_OP,};
        // TODO: continue flow according to trace - batcher.retry
        this.batcher = null;
        this.inTransition = false;
        await this.setLastActionTimestamp()
    }


    beforeExit(e) {
        this.notif.sendDiscord(`Terminating process: ${e}`)
        logger.debug(e.stack)
        process.exit()
    }


}

module.exports = {
    Strategy,
}
