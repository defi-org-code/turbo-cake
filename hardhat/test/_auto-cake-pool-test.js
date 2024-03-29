const { init_test, cakeWhale, cakeToken, cake,
		admin, owner, swapRouter, revvSwapPath, deadline, managerAbi, N_WORKERS, TRANSFER_BALANCE,
		autoCakePoolAddr, autoCakePoolContract,
		expect, BigNumber} = require("./init-test");


describe("AutoCakePoolTest", function () {
  it("Auto Cake Pool Test", async function () {

	return;

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
	// workers doHardWork - deposit in cake pool
	// ################################################################################
	let withdraw=false, swap=false, deposit=true;
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, autoCakePoolAddr, autoCakePoolAddr, TRANSFER_BALANCE, 1, 0, N_WORKERS, [swapRouter, 0, revvSwapPath, deadline]]).send({from: admin});

	let res;
	for (const worker of WorkersAddr) {
		res = await autoCakePoolContract.methods.userInfo(0, worker).call();
		expect(res['amount']).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// workers has no cakes (all staked in auto cake pool)
	// ################################################################################
	for (const worker of WorkersAddr) {
		expect(await cake.methods.balanceOf(worker).call()).to.equal('0');
	}

	// ################################################################################
	// workers doHardWork - withdraw cakes from auto pool
	// ################################################################################
	withdraw=true; swap=false; deposit=false;
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, autoCakePoolAddr, autoCakePoolAddr, TRANSFER_BALANCE, 1, 0, N_WORKERS, [swapRouter, 0, revvSwapPath, deadline]]).send({from: admin});

	// ################################################################################
	// check cakes sent back to workers (auto cake pool)
	// ################################################################################
	let balance;
	for (const worker of WorkersAddr) {
		balance = new BigNumber(await cake.methods.balanceOf(worker).call());
		expect(balance.gt(TRANSFER_BALANCE)).to.true;
	}

	// ################################################################################
	// transfer all cakes from workers back to manager
	// ################################################################################
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal('0');
  	await managerContract.methods.transferToManager([cakeToken, 0, N_WORKERS]).send({from: admin});
  	balance = new BigNumber(await cake.methods.balanceOf(manager.address).call());
	expect(balance.gt(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString())).to.true;

	// ################################################################################
	// transfer all cakes to owner
	// ################################################################################
	expect(await cake.methods.balanceOf(owner).call()).to.equal('0');
  	await managerContract.methods.transferToOwner(cakeToken).send({from: admin});
  	balance = new BigNumber(await cake.methods.balanceOf(owner).call());
	expect(balance.gt(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString())).to.true;

  });
});
