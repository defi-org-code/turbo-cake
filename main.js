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

    let account
    let managerContract
	// let web3

    if (runningMode === RunningMode.PRODUCTION) {
    	const Web3 = require("web3");
		web3 = new Web3(process.env.ENDPOINT_HTTPS);
	    account = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

    } else if (runningMode === RunningMode.DEV) {

        account = web3.eth.accounts.create(); // account is admin

	    // account = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

		// process.exit()
		await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [CAKE_WHALE_ACCOUNT]});
		await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [account.address]});
        await hre.network.provider.request({method: "hardhat_setBalance", params: [account.address, "0x100000000000000000000"]});

        const cakeContract =  new web3.eth.Contract(CAKE_ABI, CAKE_ADDRESS);
        let amount = new BigNumber(1e18) //await cakeContract.methods.balanceOf(CAKE_WHALE_ACCOUNT).call()
        await cakeContract.methods.transfer(account.address, amount.toString()).send({ from: CAKE_WHALE_ACCOUNT});

        console.log('Bot cake balance (DEV mode): ', await cakeContract.methods.balanceOf(account.address).call())

        managerContract =  new web3.eth.Contract(managerAbi);
        const res = await managerContract.deploy({data: managerBytecode, arguments: [OWNER_ADDRESS, account.address]}).send({from: account.address})

		managerContract = new web3.eth.Contract(managerAbi, res.options.address, {from: account.address});

        await cakeContract.methods.transfer(managerContract.options.address, amount.toString()).send({ from: CAKE_WHALE_ACCOUNT});

		console.log(`manager contract deployed at address: ${managerContract.options.address}`)
    }

    web3.eth.defaultAccount = account.address;

    logger.debug(`[PID pid ${process.pid}] Starting Bot: admin=${account.address}, mode=${runningMode}, mute-discord=${process.env.MUTE_DISCORD}`);

    const strategy = new Strategy(env, runningMode, account, web3, managerContract);
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


