const {RunningMode} = require("../config");
const {Logger} = require('../logger')
const logger = new Logger('policy')

const Action = {
    NO_OP: "no-op",
    ENTER: "enter-syrup-pool",
    HARVEST: "harvest",
    SWITCH: "switch-syrup-pool",
    EXIT: "exit-syrup-pool",
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

    constructor(config) {
        super();
        this.syrupSwitchInterval = config.syrupSwitchInterval; // TODO: change name to minMilisecBetweenSyrupSwitch
        this.harvestInterval = config.harvestInterval;
        this.apySwitchTh = config.apySwitchTh;
        this.runningMode = config.runningMode
        this.randApy = config.randApy
    }

	getRandomInt(max) {
	  return Math.floor(Math.random() * max);
	}

    getTopYielderAddr(poolsInfo) {

    	let apyDict = {}
		for (const poolAddr of Object.keys(poolsInfo)) {

			if (poolsInfo[poolAddr]['active'] === false) {
				continue
			}

			apyDict[poolsInfo[poolAddr]['apy']] = poolAddr
		}

		if ((this.runningMode === RunningMode.DEV) && (this.randApy === true)) {
			logger.warning(`RANDOM mode is on, returning random pool ...`)
			const apyArr = Object.keys(apyDict)
			return apyDict[apyArr[this.getRandomInt(apyArr.length)]]
		}

        return apyDict[Math.max.apply(null, Object.keys(apyDict))];
    }

	shouldSwitchPools(poolsInfo, curSyrupPoolAddr, topYielderAddr, lastActionTimestamp) {

		if (Date.now() - lastActionTimestamp < this.syrupSwitchInterval) {
			logger.debug('shouldSwitchPools: outside interval update')
			return false
		}

		return (poolsInfo[topYielderAddr]['apy'] - poolsInfo[curSyrupPoolAddr]['apy'] >= this.apySwitchTh) ||
				(poolsInfo[curSyrupPoolAddr]['active'] === false);
	}


    async getAction(args) {

		/*
		* get best pool apy
		* check move criteria
		* return action
		* */
		const topYielderAddr = this.getTopYielderAddr(args.poolsInfo);

        if (args.curSyrupPoolAddr == null) { // enter "top" syrup pool apy estimate

            return {
                name: Action.ENTER,
                from: null,
                to: {address: topYielderAddr, name: args.poolsInfo[topYielderAddr].rewardSymbol, apy: args.poolsInfo[topYielderAddr].apy, active: args.poolsInfo[topYielderAddr].active, hasUserLimit: args.poolsInfo[topYielderAddr].hasUserLimit}
            }
        }

		if (this.shouldSwitchPools(args.poolsInfo, args.curSyrupPoolAddr, topYielderAddr, args.lastActionTimestamp)) {

			return {
				name: Action.SWITCH,
				from: {address: args.curSyrupPoolAddr, name: args.poolsInfo[args.curSyrupPoolAddr].rewardSymbol, apy: args.poolsInfo[args.curSyrupPoolAddr].apy, active: args.poolsInfo[args.curSyrupPoolAddr].active, hasUserLimit: args.poolsInfo[args.curSyrupPoolAddr].hasUserLimit},
				to: {address: topYielderAddr, name: args.poolsInfo[topYielderAddr].rewardSymbol, apy: args.poolsInfo[topYielderAddr].apy, active: args.poolsInfo[topYielderAddr].active, hasUserLimit: args.poolsInfo[topYielderAddr].hasUserLimit}
			};
		}

		logger.debug('now,lasttimestamp,harvestInterval,eval: ', Date.now(), args.lastActionTimestamp, this.harvestInterval, Date.now() - args.lastActionTimestamp)

        if (Date.now() - args.lastActionTimestamp > this.harvestInterval) {

            return {
                name: Action.HARVEST,
                from: {address: args.curSyrupPoolAddr, name: args.poolsInfo[args.curSyrupPoolAddr].rewardSymbol, apy: args.poolsInfo[args.curSyrupPoolAddr].apy, active: args.poolsInfo[args.curSyrupPoolAddr].active, hasUserLimit: args.poolsInfo[args.curSyrupPoolAddr].hasUserLimit},
                to: {address: args.curSyrupPoolAddr, name: args.poolsInfo[args.curSyrupPoolAddr].rewardSymbol, apy: args.poolsInfo[args.curSyrupPoolAddr].apy, active: args.poolsInfo[args.curSyrupPoolAddr].active, hasUserLimit: args.poolsInfo[args.curSyrupPoolAddr].hasUserLimit},
            };
        }

        return {name: Action.NO_OP}
    }

}

module.exports = {
    Action,
    GreedyPolicy,
}
