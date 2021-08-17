const { expect } = require("chai");
const hre = require("hardhat");
const {accounts, contract} = require("@openzeppelin/test-environment");
const {constants, expectEvent, expectRevert, BN} = require("@openzeppelin/test-helpers");
const BigNumber = require('bignumber.js');

const strategyManagerAbi = require('../artifacts/contracts/StrategyManager.sol/StrategyManager.json').abi

const bnb = ""

const cakeWhale = "0x73feaa1eE314F8c655E354234017bE2193C9E24E";
const cakeToken = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";

const revvWhale = "0x1Cc18962B919ef90085a8b21f8dDC95824Fbad9E"
const revvToken = "0x833f307ac507d47309fd8cdd1f835bef8d702a93"

const revvPoolAddr = "0x8aA5B2C67852ED5334c8A7F0b5eB0eF975106793";


const cakeAbi = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegator","type":"address"},{"indexed":true,"internalType":"address","name":"fromDelegate","type":"address"},{"indexed":true,"internalType":"address","name":"toDelegate","type":"address"}],"name":"DelegateChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegate","type":"address"},{"indexed":false,"internalType":"uint256","name":"previousBalance","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"newBalance","type":"uint256"}],"name":"DelegateVotesChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[],"name":"DELEGATION_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"DOMAIN_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"uint32","name":"","type":"uint32"}],"name":"checkpoints","outputs":[{"internalType":"uint32","name":"fromBlock","type":"uint32"},{"internalType":"uint256","name":"votes","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"subtractedValue","type":"uint256"}],"name":"decreaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"delegatee","type":"address"}],"name":"delegate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"delegatee","type":"address"},{"internalType":"uint256","name":"nonce","type":"uint256"},{"internalType":"uint256","name":"expiry","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"delegateBySig","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"delegator","type":"address"}],"name":"delegates","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"getCurrentVotes","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"blockNumber","type":"uint256"}],"name":"getPriorVotes","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"addedValue","type":"uint256"}],"name":"increaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_to","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"mint","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"numCheckpoints","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}];
const cake = new web3.eth.Contract(cakeAbi, cakeToken);

const revv = new web3.eth.Contract(cakeAbi, revvToken);

const revvAbi = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"tokenRecovered","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"AdminTokenRecovery","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Deposit","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"EmergencyWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"poolLimitPerUser","type":"uint256"}],"name":"NewPoolLimit","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"rewardPerBlock","type":"uint256"}],"name":"NewRewardPerBlock","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"startBlock","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"endBlock","type":"uint256"}],"name":"NewStartAndEndBlocks","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"blockNumber","type":"uint256"}],"name":"RewardsStop","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdraw","type":"event"},{"inputs":[],"name":"PRECISION_FACTOR","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"SMART_CHEF_FACTORY","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"accTokenPerShare","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"bonusEndBlock","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"deposit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"emergencyRewardWithdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"emergencyWithdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"hasUserLimit","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IBEP20","name":"_stakedToken","type":"address"},{"internalType":"contract IBEP20","name":"_rewardToken","type":"address"},{"internalType":"uint256","name":"_rewardPerBlock","type":"uint256"},{"internalType":"uint256","name":"_startBlock","type":"uint256"},{"internalType":"uint256","name":"_bonusEndBlock","type":"uint256"},{"internalType":"uint256","name":"_poolLimitPerUser","type":"uint256"},{"internalType":"address","name":"_admin","type":"address"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"isInitialized","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lastRewardBlock","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_user","type":"address"}],"name":"pendingReward","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"poolLimitPerUser","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_tokenAddress","type":"address"},{"internalType":"uint256","name":"_tokenAmount","type":"uint256"}],"name":"recoverWrongTokens","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"rewardPerBlock","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rewardToken","outputs":[{"internalType":"contract IBEP20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"stakedToken","outputs":[{"internalType":"contract IBEP20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"startBlock","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"stopReward","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bool","name":"_hasUserLimit","type":"bool"},{"internalType":"uint256","name":"_poolLimitPerUser","type":"uint256"}],"name":"updatePoolLimitPerUser","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_rewardPerBlock","type":"uint256"}],"name":"updateRewardPerBlock","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_startBlock","type":"uint256"},{"internalType":"uint256","name":"_bonusEndBlock","type":"uint256"}],"name":"updateStartAndEndBlocks","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"userInfo","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"rewardDebt","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}]
const revvContract = new web3.eth.Contract(revvAbi, revvPoolAddr);

const N_WORKERS = 2;
const TRANSFER_BALANCE = new BigNumber(65).multipliedBy(1e18).toString();

const admin = accounts[0];
const owner = accounts[1];
const unauthorized = accounts[2];

let balance;

describe("DepositTest", function () {
  it("Deposit Test", async function () {

	// ################################################################################
	// impersonate and init balance
	// ################################################################################
	await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [cakeWhale]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [cakeWhale, "0x100000000000000000000"]});

	await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [revvWhale]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [revvWhale, "0x100000000000000000000"]});

	await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [owner]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [owner, "0x1000000000000000000000"]});

	await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [admin]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [admin, "0x1000000000000000000000"]});

	await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [unauthorized]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [unauthorized, "0x1000000000000000000000"]});

	// ################################################################################
	// deploy contract
	// ################################################################################
	const StrategyManager = await ethers.getContractFactory("StrategyManager");
	const strategyManager = await StrategyManager.deploy(owner, admin);
	await strategyManager.deployed();
	const strategyManagerContract = new web3.eth.Contract(strategyManagerAbi, strategyManager.address);

	// console.log(`owner=${owner}, admin=${admin}, strategyManager=${strategyManager.address}`);

    // ################################################################################
    // add workers
	// ################################################################################
	// await strategyManagerContract.methods.setStrategy(strategy.address).send({from: owner});
	// expect(await strategyManagerContract.methods.strategy.call({from: admin}) === strategy.address)

	await strategyManagerContract.methods.addWorkers(N_WORKERS).send({from: admin});

	console.log(await strategyManagerContract.methods.workers(1).call());

	// ################################################################################
	// get past events of WorkersAdded
	// ################################################################################
	let blockNum = await web3.eth.getBlockNumber();
	let events = await strategyManagerContract.getPastEvents('WorkersAdded', {fromBlock: blockNum-1, toBlock: blockNum});
    const WorkersAddr = events[0]['returnValues']['workersAddr'];
	console.log(`workers: ${events[0]['returnValues']['workersAddr']}`);
	expect(WorkersAddr.length).to.equal(N_WORKERS);

	// ################################################################################
	// transfer cakes to manager
	// ################################################################################
	// const totalCakesInit = await cake.methods.balanceOf(cakeWhale).call();
	await cake.methods.transfer(strategyManager.address, new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString()).send({from: cakeWhale});

	const mngTotalCakes = await cake.methods.balanceOf(strategyManager.address).call();
	expect(mngTotalCakes).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString());

	// ################################################################################
	// transfer revv to manager
	// ################################################################################
	await revv.methods.transfer(strategyManager.address, new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString()).send({from: revvWhale});

	const mngTotalRevv = await revv.methods.balanceOf(strategyManager.address).call();
	expect(mngTotalRevv).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString());

	// ################################################################################
	// transfer cakes to workers
	// ################################################################################
  	await strategyManagerContract.methods.transferToWorkers([cakeToken, TRANSFER_BALANCE, 0, N_WORKERS]).send({from: admin});

	for (const worker of WorkersAddr) {
		// console.log(`worker: ${worker}, cake balance= ${await cake.methods.balanceOf(worker).call()}`);
		expect(await cake.methods.balanceOf(worker).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// transfer revv to workers
	// ################################################################################
  	await strategyManagerContract.methods.transferToWorkers([revvToken, TRANSFER_BALANCE, 0, N_WORKERS]).send({from: admin});

	for (const worker of WorkersAddr) {
		expect(await revv.methods.balanceOf(worker).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// workers doHardWork - deposit
	// ################################################################################
	let withdraw=false, swap=false, deposit=true;
  	await strategyManagerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 0, 0, N_WORKERS]).send({from: admin});

	let res;
	for (const worker of WorkersAddr) {
		res = await revvContract.methods.userInfo(worker).call();
		// console.log(await revvContract.methods.userInfo(worker).call());
		expect(res['amount']).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// transfer all revv from workers back to manager
	// ################################################################################
	expect(await revv.methods.balanceOf(strategyManager.address).call()).to.equal('0');
  	await strategyManagerContract.methods.transferToManager([revvToken, 0, N_WORKERS]).send({from: admin});
	expect(await revv.methods.balanceOf(strategyManager.address).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString());

	// ################################################################################
	// transfer all revv to owner
	// ################################################################################
	expect(await revv.methods.balanceOf(owner).call()).to.equal('0');
  	await strategyManagerContract.methods.transferToOwner(revvToken).send({from: admin});
	expect(await revv.methods.balanceOf(owner).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString());

  });
});
