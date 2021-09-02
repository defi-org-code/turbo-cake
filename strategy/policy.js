const {RunningMode} = require("../config");

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
			const apyArr = Object.keys(apyDict)
			return apyDict[apyArr[this.getRandomInt(apyArr.length)]]
		}

        return apyDict[Math.max.apply(null, Object.keys(apyDict))];
    }

	shouldSwitchPools(poolsInfo, curSyrupPoolAddr, topYielderAddr, lastActionTimestamp) {

		if (Date.now() - lastActionTimestamp < this.syrupSwitchInterval) {
			console.log('shouldSwitchPools: outside interval update')
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
                to: topYielderAddr
            }
        }

		if (this.shouldSwitchPools(args.poolsInfo, args.curSyrupPoolAddr, topYielderAddr, args.lastActionTimestamp)) {

			return {
				name: Action.SWITCH,
				from: args.curSyrupPoolAddr,
				to: topYielderAddr
			};
		}

        if (Date.now() - args.lastActionTimestamp > this.harvestInterval) {

            return {
                name: Action.HARVEST,
                from: args.curSyrupPoolAddr,
                to: args.curSyrupPoolAddr
            };
        }

        return {name: Action.NO_OP}
    }

}

module.exports = {
    Action,
    GreedyPolicy,
}
