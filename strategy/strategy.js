const asyncRedis = require("async-redis");
const Notifications = require('../notifications');
const {GreedyPolicy, Action} = require("./policy");
const {Executor} = require("./executor");
const {Pancakeswap} = require("./pancakeswap");
const {Reporter} = require('../reporter')

const {
    RunningMode, DEV_ACCOUNT, DEV_SMARTCHEF_ADDRESS_LIST,
    SYRUP_SWITCH_INTERVAL, HARVEST_INTERVAL,
    PANCAKE_UPDATE_INTERVAL, TICK_INTERVAL, SWAP_SLIPPAGE, SWAP_TIME_LIMIT, APY_SWITCH_TH,
    DEV_TICK_INTERVAL, DEV_PANCAKE_UPDATE_INTERVAL, DEV_SYRUP_SWITCH_INTERVAL, DEV_HARVEST_INTERVAL,
    BEST_ROUTE_UPDATE_INTERVAL, DEV_BEST_ROUTE_UPDATE_INTERVAL, DEV_RAND_APY,
    REPORT_INTERVAL, RAND_APY
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
        config.randApy = RAND_APY
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


    constructor(env, runningMode, account, accountNew, web3) {

        this.state = {
            position: null,
            terminating: false,
        }
        const config = loadConfig(runningMode);
        logger.info('config: ')
        console.log(config);
        this.config = config;

        this.web3 = web3;
        this.account = account;
        this.accountNew = accountNew;

        this.notif = new Notifications(runningMode);
        this.redisInit();
        this.ps = new Pancakeswap(runningMode, account.address, this.redisClient, web3, this.notif,
            config.pancakeUpdateInterval, config.bestRouteUpdateInterval);

        this.policy = new GreedyPolicy(config);
        this.curSyrupPoolAddr = null;
        this.executor = null;
        this.nextAction = {name: Action.NO_OP,};
        this.tickIndex = 0;


        this.tickInterval = config.tickInterval;
        this.reportInterval = config.reportInterval
		this.syrupSwitchInterval = config.syrupSwitchInterval

        this.runningMode = runningMode;
        this.name = "pancakeswap-strategy";
        this.lastActionTimestamp = null;
        this.inTransition = false;

		// this.reporter = new Reporter(runningMode)
    }

    setupTransition() {

        if (this.runningMode === RunningMode.DEV) {
            const syrupPoolAddress = DEV_SMARTCHEF_ADDRESS_LIST[0];

            this.transitionActionQueue = [
                {
                    name: Action.ENTER,
                    from: null,
                    to: {
                        address: syrupPoolAddress, name: this.ps.poolsInfo[syrupPoolAddress].rewardSymbol,
                        apy: this.ps.poolsInfo[syrupPoolAddress].apy,
                        active: this.ps.poolsInfo[syrupPoolAddress].active,
                        hasUserLimit: this.ps.poolsInfo[syrupPoolAddress].hasUserLimit
                    }
                },


                {
                    name: Action.EXIT,
                    from: {
                        address: syrupPoolAddress,
                        name: this.ps.poolsInfo[syrupPoolAddress].rewardSymbol,
                        apy: this.ps.poolsInfo[syrupPoolAddress].apy,
                        active: this.ps.poolsInfo[syrupPoolAddress].active,
                        hasUserLimit: this.ps.poolsInfo[syrupPoolAddress].hasUserLimit,
                        routeToCake: this.ps.poolsInfo[syrupPoolAddress].routeToCake
                    },
                    to: {
                        address: null,
                    }
                },



                {
                    name: Action.ADDRESS_CHECK,
                    account: this.account,
                    accountNew: this.accountNew,
                    to: {
                        address: null,
                    }

                }


            ]




        }  else {

            this.transitionActionQueue = [
                // {
                //     name: Action.EXIT,
                //     from: {
                //         address: this.curSyrupPoolAddr,
                //         name: this.ps.poolsInfo[this.curSyrupPoolAddr].rewardSymbol,
                //         apy: this.ps.poolsInfo[this.curSyrupPoolAddr].apy,
                //         active: this.ps.poolsInfo[this.curSyrupPoolAddr].active,
                //         hasUserLimit: this.ps.poolsInfo[this.curSyrupPoolAddr].hasUserLimit,
                //         routeToCake: this.ps.poolsInfo[this.curSyrupPoolAddr].routeToCake
                //     },
                //     to: {
                //         address: null,
                //     }
                // },


                {
                    name: Action.ADDRESS_CHECK,
                    account: this.account,
                    accountNew: this.accountNew,
                    to: {
                        address: null,
                    }

                }
            ]

        }


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

			this.setupTransition();

            this.intervalId = setInterval(() => this.run(), this.tickInterval);
            // setInterval(() => this.reportStats(), this.reportInterval);

        } catch (e) {
            this.notif.sendDiscord(`[ERROR] unhandled error: ${e}`);
            this.beforeExit(e);
        }
    }

    async reportStats() {
		const investReport = await this.ps.getInvestReport(this.curSyrupPoolAddr)

		if (investReport === null) {
			return
		}

		logger.debug(`reportStats: investReport=${JSON.stringify(investReport)}`)
		this.notif.sendDiscord(`investment report: ${JSON.stringify(investReport)}`)
		// await this.reporter.send(investReport)
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
		// await this.reporter.send({ping: 1})

	    try {
            if (this.inTransition) {
            	logger.debug('inTransition')
                return;
            }

            this.inTransition = true;
            if (this.state.terminating) {
                this.notif.sendDiscord(`Terminating process`)
                process.exit()

            } else {
                await this.ps.update(this.curSyrupPoolAddr);
                logger.debug('ps udpate ended')
                await this.setAction();
                logger.debug('set action ended')
                await this.executeAction();
                logger.debug('executeAction ended')

            }

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

        if (this.transitionActionQueue) {
            if (this.transitionActionQueue.length) {
                this.nextAction = this.transitionActionQueue.shift();

            } else {
                // if (!this.accountOld) {
                //     this.accountOld = this.account;
                //     this.account = this.accountNew;
                //     this.accountNew = null;
                //     logger.debug(`setAction: Post transition new bot address functionality check`)
                // }
                this.state.terminating = true;
                this.nextAction =  {name: Action.NO_OP}
            }

        }  else {

            const lastAction = this.nextAction;
            this.nextAction = await this.policy.getAction({
                'poolsInfo': this.ps.poolsInfo,
                'curSyrupPoolAddr': this.curSyrupPoolAddr,
                'lastActionTimestamp': this.lastActionTimestamp,
                'lastAction': lastAction,
            });

        }

        // logger.debug(`setAction: nextAction=${JSON.stringify(this.nextAction)}`)

    }

    async executeAction() {

		logger.debug('executeAction: ', (this.nextAction? this.nextAction.name: ""))

        const action = this.nextAction; // closure
        const startTime = Date.now();

        if (!action || this.state.terminating || action.name === Action.NO_OP ) {
            this.executor = null;
            this.inTransition = false;
            return;
        }

		// TODO: move to init and pass action through executor.run()
        this.executor = new Executor({
            action: action,
            web3: this.web3,
            account: this.account,
            notifClient: this.notif,
            swapSlippage: this.config.swapSlippage,
            swapTimeLimit: this.config.swapTimeLimit,
        });


        const safePrintAction = {
            name: action.name,
            from: action.from,
            to: action.to,
        }
        if (action.account ) {
            safePrintAction.account = action.account.address
        }
        if (action.accountNew ) {
            safePrintAction.accountNew = action.accountNew.address
        }

        this.executor.on("failure", async (trace) => await this.handleExecutionError(trace, safePrintAction, startTime));
        this.executor.on("success", async (trace) => await this.handleExecutionSuccess(trace, safePrintAction, startTime));

        await this.executor.run();
    }

    async handleExecutionSuccess(trace, action, startTime) {

        let rewardEndedNotice, randApyNotice;
        if (action.name === Action.SWITCH && action.from.active === false) {
            rewardEndedNotice = "switch from inactive pool (rewards has ended)";
        } else if (action.name === Action.SWITCH) {
            randApyNotice = "switch pools randomly for testing "
        }
        this.notif.sendDiscord(`strategy.handleExecutionSuccess:
                    ${rewardEndedNotice? rewardEndedNotice:""}
                    ${randApyNotice? randApyNotice:""}
					action = ${JSON.stringify(action)}
		            exec time(sec) = ${(Date.now() - startTime) / 1000}; `);

        this.curSyrupPoolAddr = action.to.address
        this.executor = null;
        this.inTransition = false;
		await this.setLastActionTimestamp()


        // if (action.name === Action.EXIT) {
        //     clearInterval(this.intervalId);
        //     this.inTransition = true;
        // }

        // if (action.name === Action.HARVEST) {
        	// await this.reportStats()
        // }
    }

    async handleExecutionError(err, action, startTime) {
        this.notif.sendDiscord(`strategy.handleExecutionError:
					action = ${JSON.stringify(action)}
		            exec time(sec) = ${(Date.now() - startTime) / 1000}; `);

        // this.nextAction = { name: Action.NO_OP,};
        // TODO: continue flow according to trace - executor.retry
        this.executor = null;
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
