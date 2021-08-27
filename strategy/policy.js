
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
        this.minSecBetweenSyrupSwitch = config.minSecBetweenSyrupSwitch; // TODO: change name to minMilisecBetweenSyrupSwitch
        this.minSecBetweenHarvests = config.minSecBetweenHarvests;
        this.apySwitchTh = config.apySwitchTh;
        this.paused = false;
        this.lastActionTimestamp = Date.now() - config.minSecBetweenSyrupSwitch - 1;
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

		if (curSyrupPoolAddr >= topYielderAddr) {
			return false
		}

		return poolsInfo[topYielderAddr]['apy'] - poolsInfo[curSyrupPoolAddr]['apy'] >= this.apySwitchTh;
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

        let action = {
            name: Action.NO_OP,
        };

        // if (this.paused) {
        //     return args.lastAction;
        // }

        if (args.curSyrupPoolAddr == null) { // enter "top" syrup pool apy estimate

			// TODO: better update after tx result
			this.lastActionTimestamp = Date.now()

            action = {
                name: Action.ENTER,
                args: {
                    poolAddress:  this.getTopYielderAddr(args.poolsInfo),
                }
            }
        }

        else if (Date.now() - this.lastActionTimestamp > this.minSecBetweenSyrupSwitch) { // check should switch syrup pool

            const topYielderAddr = this.getTopYielderAddr(args.poolsInfo);

            if (this.shouldSwitchPools(args.poolsInfo, args.curSyrupPoolAddr, topYielderAddr)) {

				// TODO: better update after tx result
		        this.lastActionTimestamp = Date.now()

                action = {
                    name: Action.SWITCH,
                    args: {
                        from: args.curSyrupPoolAddr,
                        to: topYielderAddr,
                    }
                };
            }
        }

        else if (Date.now() - this.lastActionTimestamp > this.minSecBetweenHarvests) {

			// TODO: better update after tx result
			this.lastActionTimestamp = Date.now()

            action = {
                name: Action.HARVEST,
                args: {
                    poolAddress: args.curSyrupPoolAddr,
                }
            };
        }

        return action;
    }


}

module.exports = {
    Action,
    GreedyPolicy,
}
