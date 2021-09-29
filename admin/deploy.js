const hre = require("hardhat");
let {web3} = require("hardhat");
const Web3 = require("web3");

const KeyEncryption = require('../keyEncryption');
const {OWNER_ADDRESS, ADMIN_ADDRESS} = require('../config');

const {Logger} = require('../logger')
const logger = new Logger('deployer')

const managerAbi = require('../hardhat/artifacts/contracts/Manager.sol/Manager.json').abi
const managerBytecode = require('../hardhat/artifacts/contracts/Manager.sol/Manager.json').bytecode


async function deploy() {

    let deployer
    let managerContract

	// let admin = web3.eth.accounts.create();
	// console.log(admin)
	// process.exit()

	web3 = new Web3(process.env.ENDPOINT_HTTPS);
	deployer = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());

 	web3.eth.accounts.wallet.add(deployer);

	console.log(deployer.address)

	managerContract =  new web3.eth.Contract(managerAbi);

	await managerContract.deploy({data: managerBytecode, arguments: [OWNER_ADDRESS, ADMIN_ADDRESS]}).estimateGas(function(err, gas) {
	    console.log(gas);
	});

	let res = await managerContract.deploy({data: managerBytecode, arguments: [OWNER_ADDRESS, ADMIN_ADDRESS]})
	.send({from: deployer.address, gas: 5000000})
	.then(function(newContractInstance) {
    	console.log(newContractInstance.options.address) // instance with the new contract address
	});

	managerContract = new web3.eth.Contract(managerAbi, res.options.address, {from: deployer.address});

	console.log(`manager contract deployed at address: ${managerContract.options.address}`)
}


deploy()
    .then(() => {
		logger.debug(`all done`);
	})
	.catch((error) => {
        logger.error(error);
        process.exit(1);
    });


