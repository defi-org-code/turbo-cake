
const Action = {
    NO_OP: "no-op",
    ENTER: "enter-syrup-pool",
    HARVEST: "harvest",
    SWITCH: "switch-syrup-pool",
    EXIT: "exit-syrup-pool",
}


class Policy {

    action

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
        this.minSecBetweenSyrupSwitch = config.minSecBetweenSyrupSwitch;
        this.minSecBetweenHarvests = config.minSecBetweenHarvests;

    }

    getTopYielderAddr(poolsInfo, cakeAmount) {
        // assume poolsInfo is up to date and contains
        // bestRoute - with cost per swap,
        // syrup token volatility estimate

        return null;
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

        let action = {
            name: Action.NO_OP,
        };

        if (args.curSyrupPoolAddr == null) { // enter "top" syrup pool apy estimate
            const topYielderAddr = this.getTopYielderAddr(args.poolsInfo, args.cakeBalance);
            // const topYielderPoolInfo = this.poolsInfo[topYielderAddr];
            action = {
                name: Action.ENTER,
                args: {
                    to:  topYielderAddr,
                    // amount: args.cakeBalance,
                }
            }
        }

        else if (Date.now() - args.lastActionTimestamp > this.minSecBetweenSyrupSwitch) { // check should switch syrup pool
            const topYielderAddr = this.getTopYielderAddr(args.poolsInfo, args.cakeBalance);
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

        else if (Date.now() - args.lastActionTimestamp > this.minSecBetweenHarvests) {
            action = {
                name: Action.HARVEST,
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