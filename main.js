const hre = require("hardhat");
let {web3} = require("hardhat");
const BigNumber = require('bignumber.js')

const KeyEncryption = require('./keyEncryption');
const env = require('dotenv').config();
const { Strategy } = require('./strategy/strategy');
const { RunningMode, CAKE_WHALE_ACCOUNT, CAKE_ADDRESS} = require('./config');
const yargs = require('yargs/yargs');
const {CAKE_ABI} = require("./abis");
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;

const {Logger} = require('./logger')
const logger = new Logger('main')

async function main() {

    const runningMode = (argv.prod==="true"? RunningMode.PRODUCTION: RunningMode.DEV);

    let accountOld, accountNew;
    const confFileInfoOld = {
        name: `${__dirname}/.config.old`,
        encryptionType: "default",
    };

    const confFileInfoNew = {
        name: `${__dirname}/.config.new`,
        encryptionType: "gpg",
    };

    if (runningMode === RunningMode.PRODUCTION) {
        const Web3 = require("web3");
        web3 = new Web3(process.env.ENDPOINT_HTTPS);
    }

    accountOld = web3.eth.accounts.privateKeyToAccount(
        await new KeyEncryption(confFileInfoOld).loadKey());

    console.log("Extracted old account address :  ", accountOld.address)


    accountNew = web3.eth.accounts.privateKeyToAccount(
        await new KeyEncryption(confFileInfoNew).loadKey());
    console.log("Extracted new account address :  ", accountNew.address)

    console.log(runningMode)

    if (runningMode === RunningMode.DEV) {
        await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [CAKE_WHALE_ACCOUNT]});
        await hre.network.provider.request({method: "hardhat_setBalance", params: [accountOld.address, "0x100000000000000000000"]});

        const cakeContract =  new web3.eth.Contract(CAKE_ABI, CAKE_ADDRESS);
        let amount = await cakeContract.methods.balanceOf(CAKE_WHALE_ACCOUNT).call()
        await cakeContract.methods.transfer(accountOld.address, amount.toString()).send({ from: CAKE_WHALE_ACCOUNT});


    }

    logger.debug(`[PID pid ${process.pid}] Starting Transition to new address: old address=${accountOld.address}, 
    new address=${accountNew.address},
    mode=${runningMode}, mute-discord=${process.env.MUTE_DISCORD}`);

    // process.exit()
    const strategy = new Strategy(env, runningMode, accountOld, accountNew, web3);
    await strategy.start();
}


main()
    .then(() => {
		logger.debug(`Transition to new address initialized and running, mute discord notification = ${process.env.MUTE_DISCORD}`);
	})
	.catch((error) => {
        logger.error(error);
        process.exit(1);
    });


