let {
	cakeWhale, cakeToken,
	revvPoolAddr, cake, revvPoolContract,
	admin, owner,
	N_WORKERS, MAX_WORKERS, TRANSFER_BALANCE,
	managerAbi,
	init_test,
	expect, BigNumber
} = require("./init-test");



describe("MultiSingleWorkerTest", function () {
  it("Multi To Single Worker Test", async function () {

	// ################################################################################
	// init
	// ################################################################################
	await init_test();

	// ################################################################################
	// multi workers - deploy contract
	// ################################################################################
	const Manager = await ethers.getContractFactory("Manager");
	const manager = await Manager.deploy(owner, admin);
	await manager.deployed();
	const managerContract = new web3.eth.Contract(managerAbi, manager.address);

	// console.log(`owner=${owner}, admin=${admin}, manager=${manager.address}`);
    // ################################################################################
    // multi workers - add workers
	// ################################################################################
	await managerContract.methods.addWorkers(MAX_WORKERS).send({from: admin});
	const nWorkers = await managerContract.methods.getNWorkers().call({from: admin})
	expect(nWorkers).to.equal(MAX_WORKERS.toString())

	let WorkersAddr = [];
	for (let i=0; i<nWorkers; i++) {
		WorkersAddr.push(await managerContract.methods.workers(i).call({from: admin}));
	}

	// ################################################################################
	// multi workers - transfer cakes to manager
	// ################################################################################
	// const totalCakesInit = await cake.methods.balanceOf(cakeWhale).call();
	await cake.methods.transfer(manager.address, new BigNumber(TRANSFER_BALANCE).multipliedBy(MAX_WORKERS).toString()).send({from: cakeWhale});

	const mngTotalCakes = await cake.methods.balanceOf(manager.address).call();
	expect(mngTotalCakes).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(MAX_WORKERS).toString());

	// ################################################################################
	// multi workers - transfer cakes to workers
	// ################################################################################
  	await managerContract.methods.transferToWorkers([cakeToken, TRANSFER_BALANCE, 0, MAX_WORKERS]).send({from: admin});

	for (const worker of WorkersAddr) {
		// console.log(`worker: ${worker}, cake balance= ${await cake.methods.balanceOf(worker).call()}`);
		expect(await cake.methods.balanceOf(worker).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// multi workers - worker doHardWork - deposit cakes in revv pool
	// ################################################################################
	let withdraw=false, swap=false, deposit=true;
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 0, 0, MAX_WORKERS]).send({from: admin});

	let res;
	for (const worker of WorkersAddr) {
		res = await revvPoolContract.methods.userInfo(worker).call();
		expect(res['amount']).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// multi workers - workers has no cakes (all staked in revv pool)
	// ################################################################################
	for (const worker of WorkersAddr) {
		expect(await cake.methods.balanceOf(worker).call()).to.equal('0');
	}

	// ################################################################################
	// multi workers - workers doHardWork - withdraw cakes from revv pool
	// ################################################################################
	withdraw=true; swap=false; deposit=false;
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 0, 0, MAX_WORKERS]).send({from: admin});

	for (const worker of WorkersAddr) {
		res = await revvPoolContract.methods.userInfo(worker).call();
		expect(res['amount']).to.equal('0');
	}

	// ################################################################################
	// multi workers - cakes sent back to workers (from revv pool)
	// ################################################################################
	for (const worker of WorkersAddr) {
		expect(await cake.methods.balanceOf(worker).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// multi workers - transfer all cakes from worker back to manager
	// ################################################################################
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal('0');
  	await managerContract.methods.transferToManager([cakeToken, 0, MAX_WORKERS]).send({from: admin});
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(MAX_WORKERS).toString());

	// ################################################################################
	// single worker flow
	// ################################################################################

	// ################################################################################
	// single worker - transfer cakes to workers
	// ################################################################################
  	await managerContract.methods.transferToWorkers([cakeToken, TRANSFER_BALANCE, 0, 1]).send({from: admin});

	expect(await cake.methods.balanceOf(WorkersAddr[0]).call()).to.equal(TRANSFER_BALANCE);

	for (let i=1; i < MAX_WORKERS; i++) {
		expect(await cake.methods.balanceOf(WorkersAddr[i]).call()).to.equal('0');
	}

	// ################################################################################
	// single worker - worker doHardWork - deposit cakes in revv pool
	// ################################################################################
	withdraw=false; swap=false; deposit=true;
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 0, 0, 1]).send({from: admin});

	res = await revvPoolContract.methods.userInfo(WorkersAddr[0]).call();
	expect(res['amount']).to.equal(TRANSFER_BALANCE);

	for (let i=1; i < MAX_WORKERS; i++) {
		res = await revvPoolContract.methods.userInfo(WorkersAddr[i]).call();
		expect(res['amount']).to.equal('0');
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
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 0, 0, 1]).send({from: admin});

	res = await revvPoolContract.methods.userInfo(WorkersAddr[0]).call();
	expect(res['amount']).to.equal('0');

	for (let i=1; i < MAX_WORKERS; i++) {
		res = await revvPoolContract.methods.userInfo(WorkersAddr[i]).call();
		expect(res['amount']).to.equal('0');
	}

	// ################################################################################
	// cakes sent back to workers (from revv pool)
	// ################################################################################
	expect(await cake.methods.balanceOf(WorkersAddr[0]).call()).to.equal(TRANSFER_BALANCE);

	for (let i=1; i < MAX_WORKERS; i++) {
		res = await revvPoolContract.methods.userInfo(WorkersAddr[i]).call();
		expect(await cake.methods.balanceOf(WorkersAddr[i]).call()).to.equal('0');
	}

	// ################################################################################
	// transfer all cakes from worker back to manager
	// ################################################################################
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(MAX_WORKERS-1).toString());
  	await managerContract.methods.transferToManager([cakeToken, 0, 1]).send({from: admin});
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(MAX_WORKERS).toString());

	// ################################################################################
	// transfer all cakes to owner
	// ################################################################################
	expect(await cake.methods.balanceOf(owner).call()).to.equal('0');
  	await managerContract.methods.transferToOwner(cakeToken).send({from: admin});
	expect(await cake.methods.balanceOf(owner).call()).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(MAX_WORKERS).toString());

  });
});
