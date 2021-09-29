const asyncRedis = require("async-redis");
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
    REPORT_INTERVAL, DEV_APY_SWITCH_TH, WORKERS_VALIDATE_INTERVAL, DEV_WORKERS_VALIDATE_INTERVAL
} = require("../config");
const {FatalError} = require('../errors');

const {Logger} = require('../logger')
const logger = new Logger('controller')

const dateOptionsFormat = {year: 'numeric', month: 'long', day: 'numeric',hour: 'numeric',minute: 'numeric',second: 'numeric' };


function loadConfig(runningMode) {
    let config = {};

    if (runningMode === RunningMode.DEV) {

        config.syrupSwitchInterval = DEV_SYRUP_SWITCH_INTERVAL
        config.harvestInterval = DEV_HARVEST_INTERVAL
        config.tickInterval = DEV_TICK_INTERVAL
        config.bestRouteUpdateInterval = DEV_BEST_ROUTE_UPDATE_INTERVAL
        config.randApy = DEV_RAND_APY
		config.apySwitchTh = DEV_APY_SWITCH_TH
		config.workersValidateInterval = DEV_WORKERS_VALIDATE_INTERVAL

    } else {

        config.syrupSwitchInterval = SYRUP_SWITCH_INTERVAL;
        config.harvestInterval = HARVEST_INTERVAL;
        config.tickInterval = TICK_INTERVAL;
        config.bestRouteUpdateInterval = BEST_ROUTE_UPDATE_INTERVAL
        config.randApy = false
		config.apySwitchTh = APY_SWITCH_TH;
		config.workersValidateInterval = WORKERS_VALIDATE_INTERVAL;

    }

    config.runningMode = runningMode;
    config.swapSlippage = SWAP_SLIPPAGE;
    config.swapTimeLimit = SWAP_TIME_LIMIT;
    config.devSmartchefAddressList = DEV_SMARTCHEF_ADDRESS_LIST;
    config.devAccount = DEV_ACCOUNT;
    config.reportInterval = REPORT_INTERVAL
    return config;
}

class Controller {

    constructor(env, runningMode, account, web3, manager, notif) {

        this.state = {
            position: null,
            terminating: false,
        }
        const config = loadConfig(runningMode);
        logger.info('config: ')
        console.log(config);

        this.web3 = web3;
        this.account = account;
        this.notif = notif;
        this.redisInit();
        this.ps = new Pancakeswap(this.redisClient, web3, this.notif, config.bestRouteUpdateInterval);
        this.policy = new GreedyPolicy(this.redisClient, config);
        this.contractManager = new ContractManager(web3, account, manager, this.redisClient, config.workersValidateInterval)
		this.batcher = new Batcher({
			web3: web3,
			account: account,
			notifClient: this.notif,
			swapSlippage: config.swapSlippage,
			swapTimeLimit: config.swapTimeLimit,
			redisClient: this.redisClient,
			contractManager: manager,
		});

        this.nextAction = {name: Action.NO_OP,};
        this.tickIndex = 0;
        this.config = config;
        this.tickInterval = config.tickInterval;
        this.reportInterval = config.reportInterval
		this.syrupSwitchInterval = config.syrupSwitchInterval

        this.runningMode = runningMode;
        this.name = "pancakeswap-controller";
        this.lastActionTimestamp = null;
        this.totalBalance = null

		this.reporter = new Reporter(runningMode)
    }

	async devModeSetup() {

		if (this.runningMode !== RunningMode.DEV) {
			return
		}

		await this.redisClient.del('nActiveWorkers')
		await this.redisClient.del('investInfo')
	}

	async getLastActionTimestamp() {

		let reply = await this.redisClient.get(`lastActionTimestamp.${process.env.BOT_ID}`)

		logger.info(`get lastActionTimestamp from redis: ${reply}`)

		if (reply == null) {
			await this.setLastActionTimestamp(0)
			return this.lastActionTimestamp
		}

		else {
			return reply
		}
	}

	async setLastActionTimestamp(timestamp=null) {

    	if (timestamp === null) {
			timestamp = Date.now()
    	}

		this.lastActionTimestamp = timestamp
		await this.redisClient.set(`lastActionTimestamp.${process.env.BOT_ID}`, timestamp)
		logger.info(`lastActionTimestamp was set to ${timestamp}`)
	}

    async start() {

        try {
        	logger.debug(`[Controller] start`)
	        this.lastActionTimestamp = await this.getLastActionTimestamp();
	        await this.devModeSetup()

			await this.ps.init();
			this.curSyrupPoolAddr = await this.contractManager.init(this.ps.poolsInfo);
			logger.info(`curSyrupPoolAddr was set to ${this.curSyrupPoolAddr}`)

			this.totalBalance = this.contractManager.balance // TODO: improve
			logger.info(`totalBalance was set to ${JSON.stringify(this.totalBalance)}`)

			this.ps.setTotalBalance(this.totalBalance)

			const blockNum = await this.web3.eth.getBlockNumber()
			await this.ps.getInvestInfo(this.curSyrupPoolAddr, blockNum)

            this.scheduleNextRun();
            // setInterval(() => this.reportStats(), this.reportInterval);

        } catch (e) {
            this.notif.sendDiscord(`[ERROR] unhandled error: ${e}`);
            this.beforeExit(e);
        }
    }

	scheduleNextRun() {
		const nextRunSeconds = this.tickInterval - (Date.now() - Math.floor(Date.now()/60000)* 60000) // align to start of minute
		const nextRunDate = new Date(Date.now() + nextRunSeconds).toLocaleDateString("en-US", dateOptionsFormat)
		logger.info(`next update will be at ${nextRunDate}`)
		setTimeout(() => this.run(), nextRunSeconds);
	}

	async reportStats(harvestBlockNum) {
		logger.info(`reportStats: harvestBlockNum=${harvestBlockNum}`)

		this.totalBalance = await this.contractManager.setTotalBalance()
		logger.info(`reportStats: totalBalance=${this.totalBalance}`)

		const investApy = await this.ps.getInvestApy(this.totalBalance, this.curSyrupPoolAddr, harvestBlockNum)

		if (investApy === null) {
			return
		}

		logger.debug(`reportStats: investApy=${investApy}`)
		this.notif.sendDiscord(`apy: ${investApy}`)
		await this.reporter.send('profitStats', {apy: investApy})
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

		logger.debug('controller run')
		let nextAction

        try {
            await this.ps.update(this.totalBalance);
            nextAction = await this.getAction();
            nextAction = await this.contractManager.run(nextAction, this.ps.poolsInfo);
            await this.executeAction(nextAction);

            this.scheduleNextRun();

        } catch (e) {

			this.beforeExit(e)
        }
    }

    async getAction() {
        const lastAction = this.nextAction;
        this.nextAction = await this.policy.getAction({
            'poolsInfo': this.ps.poolsInfo,
            'curSyrupPoolAddr': this.curSyrupPoolAddr,
            'lastActionTimestamp': this.lastActionTimestamp,
            'lastAction': lastAction,
        });

        return this.nextAction
    }

    async executeAction(nextAction) {

		logger.debug('executeAction: nextAction:')
		console.log(nextAction)

        const startTime = Date.now();

        if ((nextAction.name === Action.NO_OP) || (nextAction.name === Action.TRANSFER_TO_OWNER)) {
            return;
        }

        this.batcher.on("failure", async (trace) => await this.handleExecutionError(trace, nextAction, startTime));
        this.batcher.on("success", async (trace) => await this.handleExecutionSuccess(trace, nextAction, startTime));

        await this.batcher.run(nextAction);
    }

    async handleExecutionSuccess(trace, action, startTime) {
        this.notif.sendDiscord(`controller.handleExecutionSuccess:
					action = ${JSON.stringify(action)}
		            exec time(sec) = ${(Date.now() - startTime) / 1000}; `);

        this.curSyrupPoolAddr = action.to.address
		await this.setLastActionTimestamp()

        if (action.name === Action.HARVEST) {
        	const harvestBlockNum = Number(await this.web3.eth.getBlockNumber()) // TODO: FIXME better estimation
        	await this.reportStats(harvestBlockNum)
        }
    }

    async handleExecutionError(err, action, startTime) {
        this.notif.sendDiscord(`controller.handleExecutionError:
					action = ${JSON.stringify(action)}
		            exec time(sec) = ${(Date.now() - startTime) / 1000}; `);

        // TODO: continue flow according to trace - batcher.retry
        await this.setLastActionTimestamp()
    }

    beforeExit(e) {
        this.notif.sendDiscord(`Terminating process: ${e}`)
        logger.debug(e.stack)
        process.exit()
    }

}

module.exports = {
    Controller,
}
