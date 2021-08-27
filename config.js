PANCAKE_UPDATE_INTERVAL=5*1000
MIN_SEC_BETWEEN_SYRUP_SWITCH=6*60*60*1000
MIN_SEC_BETWEEN_HARVESTS=24*60*60*1000
TICK_INTERVAL=3*1000
SWAP_SLIPPAGE=15
SWAP_TIME_LIMIT=5*60*1000

DEV_ACCOUNT="0x73feaa1eE314F8c655E354234017bE2193C9E24E" //"0xeb79a35801281f34db87848682db56d005806cec"
DEV_SMARTCHEF_ADDRESS_LIST=["0x52733Ad7b4D09BF613b0389045e33E2F287afa04", "0x8aa5b2c67852ed5334c8a7f0b5eb0ef975106793"]


const RunningMode = {
    DEV: "development",
    PRODUCTION: "production",
}


module.exports = {
    RunningMode,
    PANCAKE_UPDATE_INTERVAL,
    MIN_SEC_BETWEEN_SYRUP_SWITCH,
    MIN_SEC_BETWEEN_HARVESTS,
    TICK_INTERVAL,
    SWAP_SLIPPAGE,
    SWAP_TIME_LIMIT,
    DEV_ACCOUNT,
    DEV_SMARTCHEF_ADDRESS_LIST,
}
