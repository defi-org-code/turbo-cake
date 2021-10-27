MILLISECONDS_IN_SEC = 1000
MILLISECONDS_IN_MIN = 60 * MILLISECONDS_IN_SEC
MILLISECONDS_IN_HOUR = 60 * MILLISECONDS_IN_MIN

SYRUP_SWITCH_INTERVAL = MILLISECONDS_IN_MIN
HARVEST_INTERVAL = MILLISECONDS_IN_HOUR
TICK_INTERVAL = MILLISECONDS_IN_MIN
SWAP_SLIPPAGE = 10 // TODO: test and change
SWAP_TIME_LIMIT = 15 * MILLISECONDS_IN_MIN
APY_SWITCH_TH = 10 // percent units TODO: should use ema + oracle?
BEST_ROUTE_UPDATE_INTERVAL = 24 * MILLISECONDS_IN_HOUR
REPORT_INTERVAL = 12 * MILLISECONDS_IN_HOUR
WORKERS_VALIDATE_INTERVAL = MILLISECONDS_IN_HOUR

DEV_TICK_INTERVAL = MILLISECONDS_IN_SEC
DEV_APY_SWITCH_TH = -100
DEV_SYRUP_SWITCH_INTERVAL = 3 * MILLISECONDS_IN_SEC
DEV_HARVEST_INTERVAL = 30 * MILLISECONDS_IN_SEC
DEV_BEST_ROUTE_UPDATE_INTERVAL = 10 * MILLISECONDS_IN_SEC
DEV_RAND_APY = true
DEV_ACCOUNT = "0x75460a784C04b5f4Ba3228f9E84452bcbDa84004" //"0x73feaa1eE314F8c655E354234017bE2193C9E24E" //"0xeb79a35801281f34db87848682db56d005806cec"
CAKE_WHALE_ACCOUNT = "0x8894e0a0c962cb723c1976a4421c95949be2d4e3"
DEV_SMARTCHEF_ADDRESS_LIST = ["0x52733Ad7b4D09BF613b0389045e33E2F287afa04", "0x8aa5b2c67852ed5334c8a7f0b5eb0ef975106793"]
DEV_WORKERS_VALIDATE_INTERVAL = 0
DEV_RAND_FAILURES = false

CAKE_ADDRESS = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
WORKER_START_BALANCE = 80e18
WORKER_END_BALANCE = 98e18
TRANSFER_BATCH_SIZE = 5

OWNER_ADDRESS = '0xf477038F89a29C12c053d1C8641c2A5fE2cBD26F'
ADMIN_ADDRESS = '0x44fA73e335a34050e23D8C4F6b1290a4D4925252'
MANAGER_ADDRESS = '0x7e43cFfe0EA4BFCac817c92FEE9Bca1b3be9A679'

MIN_AMOUNT_FOR_REBALANCE = 10e18

const RunningMode = {
    DEV: "development",
    PRODUCTION: "production",
}

module.exports = {
    RunningMode,
    SYRUP_SWITCH_INTERVAL,
    HARVEST_INTERVAL,
    TICK_INTERVAL,
    SWAP_SLIPPAGE,
    SWAP_TIME_LIMIT,
    BEST_ROUTE_UPDATE_INTERVAL,
    DEV_ACCOUNT,
    DEV_SMARTCHEF_ADDRESS_LIST,
    APY_SWITCH_TH,
    CAKE_ADDRESS,
    CAKE_WHALE_ACCOUNT,
    DEV_TICK_INTERVAL,
    DEV_SYRUP_SWITCH_INTERVAL,
    DEV_HARVEST_INTERVAL,
    DEV_BEST_ROUTE_UPDATE_INTERVAL,
    DEV_RAND_APY,
    DEV_APY_SWITCH_TH,
    DEV_RAND_FAILURES,
    REPORT_INTERVAL,
    WORKER_START_BALANCE,
    WORKER_END_BALANCE,
    WORKERS_VALIDATE_INTERVAL,
    DEV_WORKERS_VALIDATE_INTERVAL,
    OWNER_ADDRESS,
    ADMIN_ADDRESS,
    MANAGER_ADDRESS,
    TRANSFER_BATCH_SIZE,
    MIN_AMOUNT_FOR_REBALANCE
}
