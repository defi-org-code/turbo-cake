const { expect } = require("chai");
const hre = require("hardhat");
const {accounts, contract} = require("@openzeppelin/test-environment");
const {constants, expectEvent, expectRevert, BN} = require("@openzeppelin/test-helpers");
const BigNumber = require('bignumber.js');

const strategyManagerAbi = require('../artifacts/contracts/StrategyManager.sol/StrategyManager.json').abi

const cakeWhale = "0x73feaa1eE314F8c655E354234017bE2193C9E24E";
const cakeToken = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";

const cakeAbi = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegator","type":"address"},{"indexed":true,"internalType":"address","name":"fromDelegate","type":"address"},{"indexed":true,"internalType":"address","name":"toDelegate","type":"address"}],"name":"DelegateChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegate","type":"address"},{"indexed":false,"internalType":"uint256","name":"previousBalance","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"newBalance","type":"uint256"}],"name":"DelegateVotesChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[],"name":"DELEGATION_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"DOMAIN_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"uint32","name":"","type":"uint32"}],"name":"checkpoints","outputs":[{"internalType":"uint32","name":"fromBlock","type":"uint32"},{"internalType":"uint256","name":"votes","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"subtractedValue","type":"uint256"}],"name":"decreaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"delegatee","type":"address"}],"name":"delegate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"delegatee","type":"address"},{"internalType":"uint256","name":"nonce","type":"uint256"},{"internalType":"uint256","name":"expiry","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"delegateBySig","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"delegator","type":"address"}],"name":"delegates","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"getCurrentVotes","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"blockNumber","type":"uint256"}],"name":"getPriorVotes","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"addedValue","type":"uint256"}],"name":"increaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_to","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"mint","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"numCheckpoints","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}];
const cake = new web3.eth.Contract(cakeAbi, cakeToken);

const N_DELEGATORS = 2;
const TRANSFER_BALANCE = new BigNumber(65).multipliedBy(1e18).toString();

const admin = accounts[0];
const owner = accounts[1];
const unauthorized = accounts[2];


describe("TransferTest", function () {
  it("Transfer Test", async function () {

	// ################################################################################
	// impersonate and init balance
	// ################################################################################
	await network.provider.request({method: "hardhat_impersonateAccount",params: [cakeWhale]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [cakeWhale, "0x100000000000000000000"]});

	await network.provider.request({method: "hardhat_impersonateAccount",params: [owner]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [owner, "0x1000000000000000000000"]});
	await network.provider.request({method: "hardhat_impersonateAccount",params: [admin]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [admin, "0x1000000000000000000000"]});
	await network.provider.request({method: "hardhat_impersonateAccount",params: [unauthorized]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [unauthorized, "0x1000000000000000000000"]});

	// ################################################################################
	// deploy contracts
	// ################################################################################
	const StrategyManager = await ethers.getContractFactory("StrategyManager");
	const strategyManager = await StrategyManager.deploy(owner, admin);
	await strategyManager.deployed();
	const strategyManagerContract = new web3.eth.Contract(strategyManagerAbi, strategyManager.address);

	console.log(`owner=${owner}, admin=${admin}, strategyManager=${strategyManager.address}`);

	const Strategy = await ethers.getContractFactory("Strategy");
    const strategy = await Strategy.deploy();

    // ################################################################################
    // set strategy and add delegators
	// ################################################################################
	await strategyManagerContract.methods.setStrategy(strategy.address).send({from: owner});
	expect(await strategyManagerContract.methods.strategy.call({from: admin}) === strategy.address)

	await strategyManagerContract.methods.addDelegators(N_DELEGATORS).send({from: admin});

	// ################################################################################
	// transfer cakes to manager
	// ################################################################################
	// const totalCakesInit = await cake.methods.balanceOf(cakeWhale).call();
	await cake.methods.transfer(strategyManager.address, new BigNumber(TRANSFER_BALANCE).multipliedBy(N_DELEGATORS).toString()).send({from: cakeWhale});

	const mngTotalCakes = await cake.methods.balanceOf(strategyManager.address).call();
	console.log(`mngTotalCakes=${mngTotalCakes}`);
	expect(mngTotalCakes).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_DELEGATORS).toString());

	// ################################################################################
	// get past events of DelegatorsAdded
	// ################################################################################
	let blockNum = await web3.eth.getBlockNumber();
	let events = await strategyManagerContract.getPastEvents('DelegatorsAdded', {fromBlock: blockNum-1, toBlock: blockNum + 1});
    const delegatorsAddr = events[0]['returnValues']['delegatorsAddr'];
	console.log(`delegators: ${events[0]['returnValues']['delegatorsAddr']}`);
	expect(delegatorsAddr.length).to.equal(N_DELEGATORS);

	// ################################################################################
	// transfer cake funds to delegators
	// ################################################################################
  	await strategyManagerContract.methods.transferToDelegators([cakeToken, TRANSFER_BALANCE, 0, N_DELEGATORS]).send({from: admin});

	for (const delegator of delegatorsAddr) {
		expect(await cake.methods.balanceOf(delegator).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// transfer all funds from delegators back to manager
	// ################################################################################
  	await strategyManagerContract.methods.transferToManager(cakeToken).send({from: admin});
	expect(await cake.methods.balanceOf(strategyManager.address).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_DELEGATORS).toString());

	// ################################################################################
	// transfer all funds to owner
	// ################################################################################
	expect(await cake.methods.balanceOf(owner).call()).to.equal('0');

  	await strategyManagerContract.methods.transferToOwner(cakeToken).send({from: admin});
	expect(await cake.methods.balanceOf(owner).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_DELEGATORS).toString());


  });
});