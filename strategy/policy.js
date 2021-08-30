
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
        this.paused = false;
        this.lastActionTimestamp = Date.now() - config.syrupSwitchInterval - 1;
    }

	getRandomInt(max) {
	  return Math.floor(Math.random() * max);
	}

    getTopYielderAddr(poolsInfo) {

    	let apyDict = {}
		for (const poolAddr of Object.keys(poolsInfo)) {
			apyDict[poolsInfo[poolAddr]['apy']] = poolAddr
		}

		// dbg only
		// const apyArr = Object.keys(apyDict)
		// return apyDict[apyArr[this.getRandomInt(apyArr.length)]]

        return apyDict[Math.max.apply(null, Object.keys(apyDict))];
    }

	shouldSwitchPools(poolsInfo, curSyrupPoolAddr, topYielderAddr) {

		if (Date.now() - this.lastActionTimestamp < this.syrupSwitchInterval) {
			console.log('shouldSwitchPools: outside interval update')
			return false
		}

		return (poolsInfo[topYielderAddr]['apy'] - poolsInfo[curSyrupPoolAddr]['apy'] >= this.apySwitchTh) ||
				(poolsInfo[curSyrupPoolAddr]['active'] === false);
	}

    pause() {
        this.paused = true;
    }

    resume() {
        this.paused = false;
    }

    async getAction(args) {

		/*
		* get best pool apy
		* check move criteria
		* return action
		* */

        if (args.curSyrupPoolAddr == null) { // enter "top" syrup pool apy estimate

			// TODO: better update after tx result
			this.lastActionTimestamp = Date.now()

            return {
                name: Action.ENTER,
                args: {
                    poolAddress:  this.getTopYielderAddr(args.poolsInfo),
                }
            }
        }

        // if (Date.now() - this.lastActionTimestamp > this.syrupSwitchInterval) { // check should switch syrup pool

		const topYielderAddr = this.getTopYielderAddr(args.poolsInfo);

		if (this.shouldSwitchPools(args.poolsInfo, args.curSyrupPoolAddr, topYielderAddr)) {

			// TODO: better update after tx result
			this.lastActionTimestamp = Date.now()

			return {
				name: Action.SWITCH,
				args: {
					from: args.curSyrupPoolAddr,
					to: topYielderAddr,
				}
			};
		}

        if (Date.now() - this.lastActionTimestamp > this.harvestInterval) {

			// TODO: better update after tx result
			this.lastActionTimestamp = Date.now()

            return {
                name: Action.HARVEST,
                args: {
                    poolAddress: args.curSyrupPoolAddr,
                }
            };
        }

        return {name: Action.NO_OP}
    }


    async isActivePool(curSyrupPoolAddr, activePoolsInfo) {
        return activePoolsInfo[curSyrupPoolAddr] && activePoolsInfo[curSyrupPoolAddr]['active'];
    }
}

module.exports = {
    Action,
    GreedyPolicy,
}
