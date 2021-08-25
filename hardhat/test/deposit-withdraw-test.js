const { init_test, cakeWhale, cakeToken, revvPoolAddr, cake, revvPoolContract,
		admin, owner, swapRouter, revvSwapPath, deadline, managerAbi, N_WORKERS, TRANSFER_BALANCE, expect, BigNumber} = require("./init-test");


describe("DepositWithdrawTest", function () {
  it("Deposit Withdraw Test", async function () {

	// ################################################################################
	// init
	// ################################################################################
	await init_test();

	// ################################################################################
	// deploy contract
	// ################################################################################
	const Manager = await ethers.getContractFactory("Manager");
	const manager = await Manager.deploy(owner, admin);
	await manager.deployed();
	const managerContract = new web3.eth.Contract(managerAbi, manager.address);

	// console.log(`owner=${owner}, admin=${admin}, manager=${manager.address}`);
    // ################################################################################
    // add workers
	// ################################################################################
	await managerContract.methods.addWorkers(N_WORKERS).send({from: admin});
	const _nWorkers = await managerContract.methods.getNWorkers().call({from: admin})
	expect(_nWorkers).to.equal(N_WORKERS.toString())

	let WorkersAddr = [];
	for (let i=0; i<_nWorkers; i++) {
		WorkersAddr.push(await managerContract.methods.workers(i).call({from: admin}));
	}

	// ################################################################################
	// get past events of WorkersAdded
	// ################################################################################
	let blockNum = await web3.eth.getBlockNumber();
	let events = await managerContract.getPastEvents('WorkersAdded', {fromBlock: blockNum-1, toBlock: blockNum});
    const nWorkers = events[0]['returnValues']['nWorkers'];
	expect(nWorkers).to.equal(N_WORKERS.toString());

	// ################################################################################
	// transfer cakes to manager
	// ################################################################################
	// const totalCakesInit = await cake.methods.balanceOf(cakeWhale).call();
	await cake.methods.transfer(manager.address, new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString()).send({from: cakeWhale});

	const mngTotalCakes = await cake.methods.balanceOf(manager.address).call();
	expect(mngTotalCakes).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString());

	// ################################################################################
	// transfer cakes to workers
	// ################################################################################
  	await managerContract.methods.transferToWorkers([cakeToken, TRANSFER_BALANCE, 0, N_WORKERS]).send({from: admin});

	for (const worker of WorkersAddr) {
		// console.log(`worker: ${worker}, cake balance= ${await cake.methods.balanceOf(worker).call()}`);
		expect(await cake.methods.balanceOf(worker).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// workers doHardWork - deposit cakes in revv pool
	// ################################################################################
	let withdraw=false, swap=false, deposit=true;
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 10, 0, N_WORKERS, [swapRouter, 0, revvSwapPath, deadline]]).send({from: admin});

	let res;
	for (const worker of WorkersAddr) {
		res = await revvPoolContract.methods.userInfo(worker).call();
		expect(res['amount']).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// workers has no cakes (all staked in revv pool)
	// ################################################################################
	for (const worker of WorkersAddr) {
		expect(await cake.methods.balanceOf(worker).call()).to.equal('0');
	}

	// ################################################################################
	// workers doHardWork - withdraw cakes from revv pool
	// ################################################################################
	withdraw=true; swap=false; deposit=false;
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, 0, 10, 0, N_WORKERS, [swapRouter, 0, revvSwapPath, deadline]]).send({from: admin});

	for (const worker of WorkersAddr) {
		res = await revvPoolContract.methods.userInfo(worker).call();
		expect(res['amount']).to.equal('0');
	}

	// ################################################################################
	// cakes sent back to workers (from revv pool)
	// ################################################################################
	for (const worker of WorkersAddr) {
		expect(await cake.methods.balanceOf(worker).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// transfer all cakes from workers back to manager
	// ################################################################################
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal('0');
  	await managerContract.methods.transferToManager([cakeToken, 0, N_WORKERS]).send({from: admin});
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString());

	// ################################################################################
	// transfer all cakes to owner
	// ################################################################################
	expect(await cake.methods.balanceOf(owner).call()).to.equal('0');
  	await managerContract.methods.transferToOwner(cakeToken).send({from: admin});
	expect(await cake.methods.balanceOf(owner).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString());

  });
});
