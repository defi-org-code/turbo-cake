const hre = require("hardhat");
let {web3} = require("hardhat");
const BigNumber = require('bignumber.js')

const KeyEncryption = require('./keyEncryption');
const env = require('dotenv').config();
const { Strategy } = require('./strategy/strategy');
const { RunningMode, CAKE_WHALE_ACCOUNT, CAKE_ADDRESS, OWNER_ADDRESS} = require('./config');
const yargs = require('yargs/yargs');
const {CAKE_ABI} = require("./abis");
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;

const {Logger} = require('./logger')
const logger = new Logger('main')

const managerAbi = require('./hardhat/artifacts/contracts/Manager.sol/Manager.json').abi
const managerBytecode = require('./hardhat/artifacts/contracts/Manager.sol/Manager.json').bytecode


async function main() {

    const runningMode = (argv.prod==="true"? RunningMode.PRODUCTION: RunningMode.DEV);

    let admin
    let managerContract
	// let web3

    if (runningMode === RunningMode.PRODUCTION) {
    	const Web3 = require("web3");
		web3 = new Web3(process.env.ENDPOINT_HTTPS);
	    admin = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

    } else if (runningMode === RunningMode.DEV) {

        admin = web3.eth.accounts.create();

	    // admin = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

		// process.exit()
		await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [CAKE_WHALE_ACCOUNT]});
		await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [admin.address]});
        await hre.network.provider.request({method: "hardhat_setBalance", params: [admin.address, "0x100000000000000000000"]});

        const cakeContract =  new web3.eth.Contract(CAKE_ABI, CAKE_ADDRESS);
        let amount = new BigNumber(1e18) //await cakeContract.methods.balanceOf(CAKE_WHALE_ACCOUNT).call()
        await cakeContract.methods.transfer(admin.address, amount.toString()).send({ from: CAKE_WHALE_ACCOUNT});

        console.log('Bot cake balance (DEV mode): ', await cakeContract.methods.balanceOf(admin.address).call())

        managerContract =  new web3.eth.Contract(managerAbi);
        const res = await managerContract.deploy({data: managerBytecode, arguments: [OWNER_ADDRESS, admin.address]}).send({from: admin.address})

		managerContract = new web3.eth.Contract(managerAbi, res.options.address, {from: admin.address});

        await cakeContract.methods.transfer(managerContract.options.address, amount.toString()).send({ from: CAKE_WHALE_ACCOUNT});

		console.log(`manager contract deployed at address: ${managerContract.options.address}`)
    }

    web3.eth.defaultAccount = admin.address;

    logger.debug(`[PID pid ${process.pid}] Starting Bot: admin=${admin.address}, mode=${runningMode}, mute-discord=${process.env.MUTE_DISCORD}`);

    const strategy = new Strategy(env, runningMode, admin, web3, managerContract);
    await strategy.start();
}


main()
    .then(() => {
		logger.debug(`Bot initialized and running, mute discord notification = ${process.env.MUTE_DISCORD}`);
	})
	.catch((error) => {
        logger.error(error);
        process.exit(1);
    });


