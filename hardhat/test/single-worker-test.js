const { init_test, cakeWhale, cakeToken, revvPoolAddr, cake, revvPoolContract,
		admin, owner, managerAbi, TRANSFER_BALANCE, expect} = require("./init-test");


describe("SingleWorkerTest", function () {
  it("Single Worker Test", async function () {

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
	await managerContract.methods.addWorkers(1).send({from: admin});
	const nWorkers = await managerContract.methods.getNWorkers().call({from: admin})
	expect(nWorkers).to.equal('1')

	let WorkersAddr = [];
	for (let i=0; i<nWorkers; i++) {
		WorkersAddr.push(await managerContract.methods.workers(i).call({from: admin}));
	}

	// ################################################################################
	// transfer cakes to manager
	// ################################################################################
	// const totalCakesInit = await cake.methods.balanceOf(cakeWhale).call();
	await cake.methods.transfer(manager.address, TRANSFER_BALANCE).send({from: cakeWhale});

	const mngTotalCakes = await cake.methods.balanceOf(manager.address).call();
	expect(mngTotalCakes).to.equal(TRANSFER_BALANCE);

	// ################################################################################
	// transfer cakes to worker
	// ################################################################################
  	await managerContract.methods.transferToWorkers([cakeToken, TRANSFER_BALANCE, 0, 1]).send({from: admin});

	for (const worker of WorkersAddr) {
		// console.log(`worker: ${worker}, cake balance= ${await cake.methods.balanceOf(worker).call()}`);
		expect(await cake.methods.balanceOf(worker).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// worker doHardWork - deposit cakes in revv pool
	// ################################################################################
	let withdraw=false, swap=false, deposit=true;
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 10, 0, 1]).send({from: admin});

	let res;
	for (const worker of WorkersAddr) {
		res = await revvPoolContract.methods.userInfo(worker).call();
		expect(res['amount']).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// worker has no cakes (all staked in revv pool)
	// ################################################################################
	for (const worker of WorkersAddr) {
		expect(await cake.methods.balanceOf(worker).call()).to.equal('0');
	}

	// ################################################################################
	// worker doHardWork - withdraw cakes from revv pool
	// ################################################################################
	withdraw=true; swap=false; deposit=false;
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 10, 0, 1]).send({from: admin});

	for (const worker of WorkersAddr) {
		res = await revvPoolContract.methods.userInfo(worker).call();
		expect(res['amount']).to.equal('0');
	}

	// ################################################################################
	// cakes sent back to worker (from revv pool)
	// ################################################################################
	for (const worker of WorkersAddr) {
		expect(await cake.methods.balanceOf(worker).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// transfer all cakes from worker back to manager
	// ################################################################################
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal('0');
  	await managerContract.methods.transferToManager([cakeToken, 0, 1]).send({from: admin});
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal(TRANSFER_BALANCE);

	// ################################################################################
	// transfer all cakes to owner
	// ################################################################################
	expect(await cake.methods.balanceOf(owner).call()).to.equal('0');
  	await managerContract.methods.transferToOwner(cakeToken).send({from: admin});
	expect(await cake.methods.balanceOf(owner).call()).to.equal(TRANSFER_BALANCE);

  });
});
