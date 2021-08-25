const {
	cakeWhale, cakeToken,
	cake, admin, owner, unauthorized,
	N_WORKERS, TRANSFER_BALANCE,
	managerAbi,
	init_test,
	expect, BigNumber
} = require("./init-test");

let msg;


describe("FailureTest", function () {
  it("Failure Test", async function () {

	// ################################################################################
	// init
	// ################################################################################
	await init_test();

	// ################################################################################
	// deploy contracts
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
	await cake.methods.transfer(manager.address, new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString()).send({from: cakeWhale});

	const mngTotalCakes = await cake.methods.balanceOf(manager.address).call();
	expect(mngTotalCakes).to.equal(new BigNumber(TRANSFER_BALANCE).multipliedBy(N_WORKERS).toString());

	// ################################################################################
	// set admin from admin
	// ################################################################################
	msg = '';
	try {
		msg = await managerContract.methods.setAdmin(manager.address).send({from: admin});

	} catch (e) {
		msg = e.message;
	}

	expect(msg).to.equal("VM Exception while processing transaction: reverted with reason string 'onlyOwner'");

	// ################################################################################
	// transfer funds to workers from unauthorized
	// ################################################################################
	msg = '';
	try {
	  	msg = await managerContract.methods.transferToWorkers([cakeToken, TRANSFER_BALANCE, 0, N_WORKERS]).send({from: unauthorized});

	} catch (e) {
		msg = e.message;
	}

	expect(msg).to.equal("VM Exception while processing transaction: reverted with reason string 'restricted'");

  });
});
