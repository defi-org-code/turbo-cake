
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

    }

    getTopYielderAddr(poolsInfo) {

    	let apyDict = {}

		for (const poolAddr of Object.keys(poolsInfo)) {
			apyDict[poolsInfo[poolAddr]['apy']] = poolAddr
		}

		return apyDict[Object.keys(poolsInfo).reduce((a, b) => poolsInfo[a] > poolsInfo[b] ? a : b)]
    }


    shouldSwitchPools(from, to) {

        // if (topYielderAddr != args.curSyrupPoolAddr) {
        //
        // }
        // const curSyrupPoolInfo = args.poolsInfo[args.curSyrupPoolAddr];
        // const cur
        //
        // if (args.poolsInfo[topYielderAddr]['apr'] > curSyrupPoolInfo['apr'] * (1 + this.minSwitchRiskBuffer) ) {
        //     return {addr: topYielderAddr};
        // }

   // }
        return false;
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
            const topYielderAddr = this.getTopYielderAddr(args.poolsInfo);
            action = {
                name: Action.ENTER,
                args: {
                    to:  topYielderAddr,
                }
            }
        }

        else if (Date.now() - args.lastActionTimestamp > this.minTimeBufferSyrupSwitch) { // check should switch syrup pool
            const topYielderAddr = this.getTopYielderAddr(args.poolsInfo);
            const topYielderPoolInfo = this.poolsInfo[topYielderAddr];
            const curSyrupPoolInfo = args.poolsInfo[args.curSyrupPoolAddr];
            if (this.shouldSwitchPools(curSyrupPoolInfo, topYielderPoolInfo)) {
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
