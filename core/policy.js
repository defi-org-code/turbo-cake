const {RunningMode} = require("../config");
const {Logger} = require('../logger')
const logger = new Logger('policy')
const {getRandomInt} = require('../helpers')

const Action = {
    NO_OP: "no-op",
    ENTER: "enter-syrup-pool",
    HARVEST: "harvest",
    EXIT: "exit-syrup-pool",
    TRANSFER_TO_OWNER: "transfer-to-owner"
}


class Policy {

    constructor() {
        this.action = {
            name: null,
            args: null,
        }
    }

    async getAction() {
        return this.action;
    }
}


class GreedyPolicy extends Policy {

    constructor(redisClient, config) {
        super();
        this.syrupSwitchInterval = config.syrupSwitchInterval; // TODO: change name to minMilisecBetweenSyrupSwitch
        this.harvestInterval = config.harvestInterval;
        this.apySwitchTh = config.apySwitchTh;
        this.runningMode = config.runningMode
        this.randApy = config.randApy

        this.redisClient = redisClient
    }

    getTopYielderAddr(poolsInfo) {

    	let apyDict = {}
		for (const poolAddr of Object.keys(poolsInfo)) {

			if ((poolsInfo[poolAddr]['active'] === false) || (poolsInfo[poolAddr]['apy'] === null)) {
				continue
			}

			apyDict[poolsInfo[poolAddr]['apy']] = poolAddr
		}

		if (Object.keys(apyDict).length === 0) {
			throw Error(`Could not find any active pool while searching for best pool address`)
		}

		logger.info(`apyDict: `)
		console.info(apyDict)

		if ((this.runningMode === RunningMode.DEV) && (this.randApy === true)) {
			logger.warning(`RANDOM mode is on, returning random pool ...`)
			const apyArr = Object.keys(apyDict)
			return apyDict[apyArr[getRandomInt(apyArr.length)]]
		}

        return apyDict[Math.max.apply(null, Object.keys(apyDict))];
    }

	shouldSwitchPools(poolsInfo, curSyrupPoolAddr, topYielderAddr, lastActionTimestamp) {

		if (Date.now() - lastActionTimestamp < this.syrupSwitchInterval) {
			logger.debug('shouldSwitchPools: outside interval update')
			// logger.debug(`diff=${Date.now() - lastActionTimestamp}, interval=${this.syrupSwitchInterval}, now=${Date.now()}, lastActionTimestamp=${lastActionTimestamp}`)
			return false
		}

		if (!(topYielderAddr in poolsInfo)) {
			throw Error(`topYielderAddr ${topYielderAddr} not found in poolsInfo`)
		}

		logger.debug(`shouldSwitchPools: topYielderAddr=${topYielderAddr}, curSyrupPoolAddr=${curSyrupPoolAddr}`)

		return (poolsInfo[topYielderAddr]['apy'] - poolsInfo[curSyrupPoolAddr]['apy'] >= this.apySwitchTh) ||
				(poolsInfo[curSyrupPoolAddr]['active'] === false);
	}

	async externalCommand(args) {

		let externalCommand = await this.redisClient.get(`command.${process.env.BOT_ID}`)

		if (externalCommand == null) {
			return null
		}

		logger.info(`external command ${externalCommand} detected`)

		if (externalCommand === 'TransferToOwner') {

			if (args.curSyrupPoolAddr !== null) {

				logger.info(`exit from pool ${args.curSyrupPoolAddr} before transfer ...`)

				return {
					name: Action.EXIT,
					from: {address: args.curSyrupPoolAddr, name: args.poolsInfo[args.curSyrupPoolAddr].rewardSymbol, apy: args.poolsInfo[args.curSyrupPoolAddr].apy, active: args.poolsInfo[args.curSyrupPoolAddr].active, hasUserLimit: args.poolsInfo[args.curSyrupPoolAddr].hasUserLimit, routeToCake: args.poolsInfo[args.curSyrupPoolAddr].routeToCake},
					to: {address: null}
				};

			} else {

				this.redisClient.del(`command.${process.env.BOT_ID}`)
				logger.info(`send transfer all funds to owner action and reset command flag ...`)

				return {
					name: Action.TRANSFER_TO_OWNER,
					from: {address: null},
					to: {address: null}
				};
			}
		}

		return null
	}

    async getAction(args) {

		/*
		* get best pool apy
		* check move criteria
		* return action
		* */
		// logger.debug(`getAction args:`)
		// console.log(args)

		if ((args.balance.staked.toString() === '0') && (args.balance.unstaked.toString() === '0')) {
			logger.info(`total balance is 0, ignoring state and setting action to ${Action.NO_OP}`)
			return {name: Action.NO_OP}
		}

		const externalCommand = await this.externalCommand(args)
		if (externalCommand !== null) {
			return externalCommand
		}

		const topYielderAddr = this.getTopYielderAddr(args.poolsInfo);

        if (args.curSyrupPoolAddr == null) { // enter "top" syrup pool apy estimate

            return {
                name: Action.ENTER,
                from: {address: null},
                to: {address: topYielderAddr, name: args.poolsInfo[topYielderAddr].rewardSymbol, apy: args.poolsInfo[topYielderAddr].apy, active: args.poolsInfo[topYielderAddr].active, hasUserLimit: args.poolsInfo[topYielderAddr].hasUserLimit}
            }
        }

		if (this.shouldSwitchPools(args.poolsInfo, args.curSyrupPoolAddr, topYielderAddr, args.lastActionTimestamp)) {

			return {
				name: Action.EXIT, // should enter on next tick
				from: {address: args.curSyrupPoolAddr, name: args.poolsInfo[args.curSyrupPoolAddr].rewardSymbol, apy: args.poolsInfo[args.curSyrupPoolAddr].apy, active: args.poolsInfo[args.curSyrupPoolAddr].active, hasUserLimit: args.poolsInfo[args.curSyrupPoolAddr].hasUserLimit, routeToCake: args.poolsInfo[args.curSyrupPoolAddr].routeToCake},
				to: {address: null}
			};
		}

		// logger.debug(`now=${Date.now()},lastActionTimestamp=${args.lastActionTimestamp},harvestInterval=${this.harvestInterval},eval=${Date.now() - args.lastActionTimestamp}`)

        if (Date.now() - args.lastActionTimestamp > this.harvestInterval) {

			if (args.rebalance) {
				return {
					name: Action.EXIT,
					from: {address: args.curSyrupPoolAddr, name: args.poolsInfo[args.curSyrupPoolAddr].rewardSymbol, apy: args.poolsInfo[args.curSyrupPoolAddr].apy, active: args.poolsInfo[args.curSyrupPoolAddr].active, hasUserLimit: args.poolsInfo[args.curSyrupPoolAddr].hasUserLimit, routeToCake: args.poolsInfo[args.curSyrupPoolAddr].routeToCake},
					to: {address: null}
				};
			}

            return {
                name: Action.HARVEST,
                from: {address: args.curSyrupPoolAddr, name: args.poolsInfo[args.curSyrupPoolAddr].rewardSymbol, apy: args.poolsInfo[args.curSyrupPoolAddr].apy, active: args.poolsInfo[args.curSyrupPoolAddr].active, hasUserLimit: args.poolsInfo[args.curSyrupPoolAddr].hasUserLimit, routeToCake: args.poolsInfo[args.curSyrupPoolAddr].routeToCake},
                to: {address: args.curSyrupPoolAddr, name: args.poolsInfo[args.curSyrupPoolAddr].rewardSymbol, apy: args.poolsInfo[args.curSyrupPoolAddr].apy, active: args.poolsInfo[args.curSyrupPoolAddr].active, hasUserLimit: args.poolsInfo[args.curSyrupPoolAddr].hasUserLimit, routeToCake: args.poolsInfo[args.curSyrupPoolAddr].routeToCake},
            };
        }

        return {name: Action.NO_OP}
    }

}

module.exports = {
    Action,
    GreedyPolicy,
}
