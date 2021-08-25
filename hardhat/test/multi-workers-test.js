let { init_test, cakeWhale, cakeToken, revvPoolAddr, cake, revvPoolContract,
		MAX_WORKERS, N_WORKERS,
		swapRouter, revvSwapPath, deadline,
		admin, owner, managerAbi, TRANSFER_BALANCE, expect, BigNumber} = require("./init-test");



describe("MultiWorkersTest", function () {
  it("Multi Workers Test", async function () {

	// ################################################################################
	// init
	// ################################################################################
	await init_test();

	N_WORKERS = 10;
	const batch_size = 2;

	// ################################################################################
	// deploy contract
	// ################################################################################
	const Manager = await ethers.getContractFactory("Manager");
	const manager = await Manager.deploy(owner, admin);
	await manager.deployed();
	const managerContract = new web3.eth.Contract(managerAbi, manager.address);

	// console.log(web3.utils.fromWei(await web3.eth.getBalance(admin)));

    // ################################################################################
    // add workers
	// ################################################################################
	expect(N_WORKERS % batch_size).to.equal(0);
	let totalWorkersAdded = 0;
	while (totalWorkersAdded < N_WORKERS) {

		await managerContract.methods.addWorkers(batch_size).send({from: admin});
		totalWorkersAdded += batch_size;
		expect(await managerContract.methods.getNWorkers().call({from: admin})).to.equal(totalWorkersAdded.toString())
	}

	let WorkersAddr = [];
	for (let i=0; i<N_WORKERS; i++) {
		WorkersAddr.push(await managerContract.methods.workers(i).call({from: admin}));
	}

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
	for (let i=0; i<N_WORKERS; i+=batch_size) {
		console.log(`doHardWork: deposit indices: [${i}, ${i+batch_size}]`);
		await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 10, i, i+batch_size, [swapRouter, 0, revvSwapPath, deadline]]).send({from: admin});
	}

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
	for (let i=0; i<N_WORKERS; i+=batch_size) {
		console.log(`doHardWork: withdraw indices: [${i}, ${i+batch_size}]`);
		await managerContract.methods.doHardWork([withdraw, swap, deposit, revvPoolAddr, revvPoolAddr, TRANSFER_BALANCE, 10, i, i+batch_size, [swapRouter, 0, revvSwapPath, deadline]]).send({from: admin});
	}

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
