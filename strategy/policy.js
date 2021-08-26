
const Action = {
    NO_OP: "no-op",
    ENTER: "enter-syrup-pool",
    COMPOUND: "compound",
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
        this.minTimeBufferSyrupSwitch = config.minTimeBufferSyrupSwitch;
        this.minTimeBufferCompounds = config.minTimeBufferCompounds;
        this.apySwitchTh = config.apySwitchTh;

    }

    getTopYielderAddr(poolsInfo) {

    	let apyDict = {}

		for (const poolAddr of Object.keys(poolsInfo)) {
			apyDict[poolsInfo[poolAddr]['apy']] = poolAddr
		}

		return apyDict[Object.keys(poolsInfo).reduce((a, b) => poolsInfo[a] > poolsInfo[b] ? a : b)]
    }


    shouldSwitchPools(poolsInfo, curSyrupPoolAddr, topYielderAddr) {

		if (curSyrupPoolAddr >= topYielderAddr) {
			return false
		}

		return poolsInfo[topYielderAddr]['apy'] - poolsInfo[curSyrupPoolAddr]['apy'] >= this.apySwitchTh;
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

        if (args.curSyrupPoolAddr == null) { // enter "top" syrup pool apy estimate
            action = {
                name: Action.ENTER,
                args: {
                    to:  this.getTopYielderAddr(args.poolsInfo),
                }
            }
        }

        else if (Date.now() - args.lastActionTimestamp > this.minTimeBufferSyrupSwitch) { // check should switch syrup pool

            const topYielderAddr = this.getTopYielderAddr(args.poolsInfo);

            if (this.shouldSwitchPools(args.poolsInfo, args.curSyrupPoolAddr, topYielderAddr)) {

                action = {
                    name: Action.SWITCH,
                    args: {
                        from: args.curSyrupPoolAddr,
                        to: topYielderAddr,
                    }
                };
            }
        }

        else if (Date.now() - args.lastActionTimestamp > this.minTimeBufferCompounds) {

            action = {
                name: Action.COMPOUND,
                args: {
                    to: args.curSyrupPoolAddr,
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
