const hre = require("hardhat");
const { init_test, cakeWhale, cakeToken, cake,
		betaPoolAddr, betaWhale, betaToken, beta, betaPoolContract, betaSwapPath,
		admin, owner, swapRouter, deadline, managerAbi, workerAbi, N_WORKERS, TRANSFER_BALANCE, expect, BigNumber} = require("./init-test");


describe("Beta-Pool-Test", function () {
  it("Beta Pool Test", async function () {

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

	const workersAddr = await managerContract.methods.getWorkers(0, _nWorkers).call({from: admin})
	// console.log(workersAddr)

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

	let workerContract
	for (const worker of WorkersAddr) {
		// console.log(`worker: ${worker}, cake balance= ${await cake.methods.balanceOf(worker).call()}`);
		expect(await cake.methods.balanceOf(worker).call()).to.equal(TRANSFER_BALANCE);
	}

	// ################################################################################
	// workers doHardWork - deposit cakes in beta pool
	// ################################################################################
	let withdraw=false, swap=false, deposit=true;
	let multiplier = 0
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, betaPoolAddr, betaPoolAddr, TRANSFER_BALANCE, 0, N_WORKERS, [swapRouter, multiplier, betaSwapPath, deadline]]).send({from: admin});

	let res;
	for (const worker of WorkersAddr) {
		res = await betaPoolContract.methods.userInfo(worker).call();
		expect(res['amount']).to.equal(TRANSFER_BALANCE);

		// workerContract = new web3.eth.Contract(workerAbi, worker);
		// console.log(await workerContract.methods.getCodeHash().call())

	}

	// ################################################################################
	// workers have no cakes, all staked in beta pool, workers have no beta
	// ################################################################################
	for (const worker of WorkersAddr) {
		expect(await cake.methods.balanceOf(worker).call()).to.equal('0');
		res = await betaPoolContract.methods.userInfo(worker).call();
		expect(res['amount']).to.equal(TRANSFER_BALANCE);

		res = await beta.methods.balanceOf(worker).call();
		expect(Number(res)).to.be.equal(0);

	}

	await hre.network.provider.send("evm_mine")
	// ################################################################################
	// workers doHardWork - withdraw rewards without swap, check workers have beta
	// ################################################################################
	withdraw=true; swap=false; deposit=false;
	let amount=0;
	multiplier = 100
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, betaPoolAddr, betaPoolAddr, amount, 0, N_WORKERS, [swapRouter, multiplier, betaSwapPath, deadline]]).send({from: admin});

	for (const worker of WorkersAddr) {
		res = await beta.methods.balanceOf(worker).call();
		expect(Number(res)).to.be.gt(0);
	}

	// ################################################################################
	// workers doHardWork - swap + deposit
	// ################################################################################
	withdraw=false; swap=true; deposit=true;
	amount=0;
	multiplier = 0
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, betaPoolAddr, betaPoolAddr, amount, 0, N_WORKERS, [swapRouter, multiplier, betaSwapPath, deadline]]).send({from: admin});

	for (const worker of WorkersAddr) {
		res = await betaPoolContract.methods.userInfo(worker).call();
		expect(Number(TRANSFER_BALANCE)).to.be.lt(Number(res['amount']));
	}

	// ################################################################################
	// get workers current amount status in pool
	// ################################################################################
	let workersAmount = {}
	let betaAmounts = {}
	let cakeAmounts = {}
	for (const worker of WorkersAddr) {
		res = await betaPoolContract.methods.userInfo(worker).call();
		workersAmount[worker] = Number(res['amount'])

		betaAmounts[worker] = Number(await beta.methods.balanceOf(worker).call());
	}

	await hre.network.provider.send("evm_mine")

	// ################################################################################
	// get reward amount without staking
	// ################################################################################
	withdraw=true; swap=false; deposit=false;
	amount=0;
	multiplier = 0
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, betaPoolAddr, betaPoolAddr, amount, 0, N_WORKERS, [swapRouter, multiplier, betaSwapPath, deadline]]).send({from: admin});

	for (const worker of WorkersAddr) {
		betaAmounts[worker] = Number(await beta.methods.balanceOf(worker).call());
		cakeAmounts[worker] = Number(await cake.methods.balanceOf(worker).call());
	}

	// ################################################################################
	// swap with multiplier = 100
	// ################################################################################
	withdraw=false; swap=true; deposit=false;
	amount=0;
	multiplier = 100
  	await managerContract.methods.doHardWork([withdraw, swap, deposit, betaPoolAddr, betaPoolAddr, amount, 0, N_WORKERS, [swapRouter, multiplier, betaSwapPath, deadline]]).send({from: admin});

	for (const worker of WorkersAddr) {
		// no beta
		res = Number(await beta.methods.balanceOf(worker).call());
		expect(res).to.be.eq(0);

		// more cakes
		res = Number(await cake.methods.balanceOf(worker).call())
		expect(res).to.be.gt(cakeAmounts[worker]);
	}

	let sumCakes = 0
	for (const worker of WorkersAddr) {
		betaAmounts[worker] = Number(await beta.methods.balanceOf(worker).call());
		cakeAmounts[worker] = Number(await cake.methods.balanceOf(worker).call());

		sumCakes += cakeAmounts[worker]
	}

	// ################################################################################
	// transfer all cakes from workers back to manager
	// ################################################################################
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal('0');
  	await managerContract.methods.transferToManager([cakeToken, 0, 0, N_WORKERS]).send({from: admin});
	expect(await cake.methods.balanceOf(manager.address).call()).to.equal(String(sumCakes));

	// ################################################################################
	// transfer all cakes to owner
	// ################################################################################
	expect(await cake.methods.balanceOf(owner).call()).to.equal('0');
  	await managerContract.methods.transferToOwner(cakeToken).send({from: admin});
	expect(await cake.methods.balanceOf(owner).call()).to.equal(String(sumCakes));

  });
});