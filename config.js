MILLISECONDS_IN_SEC = 1000
MILLISECONDS_IN_MIN = 60 * MILLISECONDS_IN_SEC
MILLISECONDS_IN_HOUR = 60 * MILLISECONDS_IN_MIN

PANCAKE_UPDATE_INTERVAL = MILLISECONDS_IN_HOUR
SYRUP_SWITCH_INTERVAL = MILLISECONDS_IN_HOUR
HARVEST_INTERVAL = 24 * MILLISECONDS_IN_HOUR
TICK_INTERVAL = MILLISECONDS_IN_MIN
SWAP_SLIPPAGE = 10 // TODO: test and change
SWAP_TIME_LIMIT = 15 * MILLISECONDS_IN_MIN
APY_SWITCH_TH = 5 // percent units

DEV_TICK_INTERVAL = 10 * MILLISECONDS_IN_SEC
DEV_PANCAKE_UPDATE_INTERVAL = 30 * MILLISECONDS_IN_SEC
DEV_SYRUP_SWITCH_INTERVAL = 30 * MILLISECONDS_IN_SEC
DEV_HARVEST_INTERVAL = 60 * MILLISECONDS_IN_SEC

DEV_ACCOUNT = "0xEf61Fe3cC3BC8d0D0266325221F5F0A9B7014C84" //"0x73feaa1eE314F8c655E354234017bE2193C9E24E" //"0xeb79a35801281f34db87848682db56d005806cec"
CAKE_WHALE_ACCOUNT = "0x8894e0a0c962cb723c1976a4421c95949be2d4e3"
DEV_SMARTCHEF_ADDRESS_LIST = ["0x52733Ad7b4D09BF613b0389045e33E2F287afa04", "0x8aa5b2c67852ed5334c8a7f0b5eb0ef975106793"]
CAKE_ADDRESS = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"

const RunningMode = {
    DEV: "development",
    PRODUCTION: "production",
}


module.exports = {
    RunningMode,
    PANCAKE_UPDATE_INTERVAL,
    SYRUP_SWITCH_INTERVAL,
    HARVEST_INTERVAL,
    TICK_INTERVAL,
    SWAP_SLIPPAGE,
    SWAP_TIME_LIMIT,
    DEV_ACCOUNT,
    DEV_SMARTCHEF_ADDRESS_LIST,
    APY_SWITCH_TH,
    CAKE_ADDRESS,
    CAKE_WHALE_ACCOUNT,
    DEV_TICK_INTERVAL,
    DEV_PANCAKE_UPDATE_INTERVAL,
    DEV_SYRUP_SWITCH_INTERVAL,
    DEV_HARVEST_INTERVAL
}
