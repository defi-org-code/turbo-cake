const {WORKER_START_BALANCE, WORKER_END_BALANCE, OWNER_ADDRESS, TRANSFER_BATCH_SIZE, DEV_RAND_FAILURES, MIN_AMOUNT_FOR_REBALANCE} = require("../config");
const Contract = require('web3-eth-contract') // workaround for web3 leakage
const {CAKE_ABI, SMARTCHEF_INITIALIZABLE_ABI, BEP_20_ABI} = require('../abis')
const {Action} = require("./policy");
const {MASTER_CHEF_ADDRESS, CAKE_ADDRESS} = require('./params')
const {assert} = require('../helpers')
const {RunningMode} = require("../config");
const {getRandomInt} = require('../helpers')

const {Logger} = require('../logger')
const logger = new Logger('ContractManager')

const {TxManager} = require("./txManager");

const BigNumber = require('bignumber.js')
BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})

class ContractManager extends TxManager {

	constructor(web3, admin	, manager, redisClient, workersValidateInterval, runningMode) {
		super(web3, admin)
		this.web3 = web3
		this.redisClient = redisClient
		this.admin = admin

		this.manager = manager
		this.cakeContract = this.getContract(CAKE_ABI, CAKE_ADDRESS)
		this.runningMode = runningMode
		this.nWorkers = 0 // how many workers were created
		this.balance = null
		this.nActiveWorkers = null
		this.workersAddr = []
		this.workersBalanceInfo = null
		this.stakedAddr = null
		this.managerBalance = 0
		this.lastWorkersValidate = 0
		this.workersValidateInterval = workersValidateInterval

		this.nStakedWorkers = null
		this.nUnstakedWorkers = null

		this.workersSync = null
		this.workersStakingBalance = null
		this.maxStaked = 0
	}

	async init(poolsInfo) {

		await this.validateAddr()
		// await this.transferToManager(0, 0, 7)
		await this.setNWorkers()
		await this.setWorkersBalanceInfo(poolsInfo)
		await this.transferRewardsToManager()
		this.setWorkersBalance()
		this.setNActiveWorkers()
		this.validateWorkers()

		await this.setTotalBalance()
		// this.initWorkersSync()
		await this.setWorkersStakingAddr()

		return this.stakedAddr
	}

	getContract(contractAbi, contractAddress) {
		const contract = new Contract(contractAbi, contractAddress)
		contract.setProvider(this.web3.currentProvider)
		return contract
	}

	async validateAddr() {
		const admin = await this.manager.methods.admin().call()
		const owner = await this.manager.methods.owner().call()

		if (admin !== this.admin.address) {
			throw Error(`unexpected admin address: contract admin address ${admin}, admin.address ${this.admin.address}`)
		}

		if (owner !== OWNER_ADDRESS) {
			throw Error(`unexpected owner address: contract owner address ${owner}, OWNER_ADDRESS ${OWNER_ADDRESS}`)
		}
	}

	async setNWorkers() {
		this.nWorkers = await this.manager.methods.getNWorkers().call()
		logger.info(`nWorkers was set to ${this.nWorkers}`)
	}

	async fetchWorkersAddr() {
		// TODO: save in redis and fetch only missing
		if (this.nWorkers === '0') {
			this.workersAddr = []
			return
		}

		this.workersAddr = await this.manager.methods.getWorkers(0, this.nWorkers).call()
		logger.info(`workersAddr: ${this.workersAddr}`)
	}

	async fetchWorkersCakeBalance() {

		let cakeBalance

		for (let i=0; i<this.workersAddr.length; i++) {
			cakeBalance = await this.cakeContract.methods.balanceOf(this.workersAddr[i]).call();
			this.workersBalanceInfo[i][CAKE_ADDRESS] = cakeBalance
		}

	}

	async setWorkersBalanceInfo(poolsInfo) {
		let res, poolContract, rewardContract, rewardToken
		let workersBalanceInfo = {}
		let cakeBalance

		logger.info(`setWorkersBalanceInfo started ...`)
		await this.fetchWorkersAddr()

		if (this.workersAddr.length === 0) {
			this.workersBalanceInfo = {}
			return
		}

		logger.info(`fetching workers cake balance ...`)

		for (let i=0; i<this.workersAddr.length; i++) {
			cakeBalance = await this.cakeContract.methods.balanceOf(this.workersAddr[i]).call();
			workersBalanceInfo[i] = {}
			workersBalanceInfo[i][CAKE_ADDRESS] = cakeBalance
		}

		for (const poolAddr of Object.keys(poolsInfo)) {
			poolContract = this.getContract(SMARTCHEF_INITIALIZABLE_ABI, poolAddr)

			rewardToken = await poolAddr.methods.rewardToken().call()
			rewardContract = this.getContract(BEP_20_ABI, rewardToken)

			for (let i=0; i<this.workersAddr.length; i++) {
				res = await poolContract.methods.userInfo(this.workersAddr[i]).call()

				if (res['amount'] !== '0') {
					workersBalanceInfo[i][poolAddr] = res['amount']
				}

				res = await rewardContract.methods.balanceOf(this.workersAddr[i]).call()

				if (res !== '0') {
					workersBalanceInfo[i][rewardToken] = res
				}
			}
		}

		this.workersBalanceInfo = workersBalanceInfo
		logger.info('workersBalanceInfo: ')
		console.log(this.workersBalanceInfo)
	}

	async transferRewardsToManager() {
		// if reward found call setWorkersBalanceInfo in order to update workersBalanceInfo
		throw Error('Not Implemented')
	}

	async setManagerBalance() {
		this.managerBalance = await this.cakeContract.methods.balanceOf(this.manager.options.address).call();
	}

	setWorkersBalance() {

		// updates workersBalance
		let workersBalance = {}
		let workerInfo;

		for (let workerIndex=0; workerIndex<this.workersAddr.length; workerIndex++) {

			workerInfo = this.workersBalanceInfo[workerIndex]
			workersBalance[workerIndex] = {staked: '0', unstaked: '0'}

			for (const [key, value] of Object.entries(workerInfo)) {

				if (key === CAKE_ADDRESS) {
					workersBalance[workerIndex].unstaked = value
				}

				else {

					assert(workersBalance[workerIndex].staked === '0', `worker ${workerIndex} has staking in more than 1 pool: ${workerInfo}`)
					workersBalance[workerIndex].staked = value
				}
			}
		}

		this.workersBalance = workersBalance
	}

	setNActiveWorkers() {

		let nStakedWorkers = 0, nUnstakedWorkers = 0

		for (let [workerIndex, workerBalance] of Object.entries(this.workersBalance)) {

			if (workerBalance.staked !== '0') {
				nStakedWorkers += 1
			}

			if (workerBalance.unstaked !== '0') {

				assert(workerBalance.staked === '0', `unexpected state, worker ${workerIndex} has both staked and unstaked balance: ${workerBalance}`)
				nUnstakedWorkers += 1
			}
		}

		logger.info(`detected ${nStakedWorkers} staked workers, ${nUnstakedWorkers} unstaked workers`)
		this.nActiveWorkers = nStakedWorkers + nUnstakedWorkers
		this.nStakedWorkers = nStakedWorkers
		this.nUnstakedWorkers = nUnstakedWorkers
		return this.nActiveWorkers
	}

	validateWorkers() {

		if (Object.keys(this.workersBalanceInfo).length === 0) {

			assert(this.nActiveWorkers === 0, `workers are out of sync: nActiveWorkers=${this.nActiveWorkers} while there is no active workersBalanceInfo`)
			return
		}

		let workerInfo
		for (let workerIndex=0; workerIndex<this.workersAddr.length; workerIndex++) {

			assert(workerIndex in this.workersBalanceInfo, `worker ${workerIndex} was not found in workersBalanceInfo: ${JSON.stringify(this.workersBalanceInfo)}`)

			workerInfo = this.workersBalanceInfo[workerIndex]
			// only cake or cake + 1 pool is expected
			assert(Object.keys(workerInfo).length <= 2, `worker might have staking in more than 1 pool: ${JSON.stringify(workerInfo)}`)
		}
	}

	async setWorkersStakingAddr() {

		// updates workersBalance
		let workersStakingBalance = {}
		let workerInfo, stakingAddr = null;

		for (let workerIndex=0; workerIndex<this.workersAddr.length; workerIndex++) {

			workerInfo = this.workersBalanceInfo[workerIndex]
			workersStakingBalance[workerIndex] = null

			for (const [contractAddr, balance] of Object.entries(workerInfo)) {

				if (contractAddr !== CAKE_ADDRESS) {
					assert(workersStakingBalance[workerIndex] === null, (`worker ${workerIndex} has staking in more than 1 pool: ${workerInfo}`))
					assert(stakingAddr === null || stakingAddr === contractAddr, `workers are staked at 2 different addresses: ${balance}, ${stakingAddr}`)
					workersStakingBalance[workerIndex] = balance
					stakingAddr = contractAddr
				}
			}
		}

		this.workersStakingBalance = workersStakingBalance
		this.stakedAddr = stakingAddr

		logger.info(`stakingAddr: ${stakingAddr}`)
		logger.info(`workersStakingBalance: `)
		console.log(workersStakingBalance)
	}

	initWorkersSync() {
		// assumes manager balance and nStakedWorkers, nUnstakedWorkers are updated

		if (this.nStakedWorkers !== 0 && this.nUnstakedWorkers !== 0) {
			this.workersSync = false
		}

		else {
			this.workersSync = (this.managerBalance === '0')
		}
	}

	async setTotalBalance() {

		await this.setManagerBalance()
		logger.info(`manager total balance: ${this.managerBalance}`)
		let totalBalance = {unstaked: new BigNumber(this.managerBalance), staked: new BigNumber(0)}
		let maxStaked = 0

		for (let workerBalance of Object.values(this.workersBalance)) {
			totalBalance.staked = totalBalance.staked.plus(workerBalance.staked)
			totalBalance.unstaked = totalBalance.unstaked.plus(workerBalance.unstaked)

			if ((new BigNumber(workerBalance.staked)).gt(maxStaked)) {
				maxStaked = workerBalance.staked
			}

		}

		this.balance = totalBalance
		logger.info(`saving total balance to redis, total balance => `)
		console.log(this.balance)
		this.maxStaked = maxStaked
		logger.info(`maxStaked = ${this.maxStaked}`)

		return this.balance
	}

	shouldRebalance(poolsInfo, poolAddr) {

		if (!poolAddr) {
			return false
		}

		if (new BigNumber(this.managerBalance).gt(MIN_AMOUNT_FOR_REBALANCE)) {
			logger.info(`manager balance = ${this.managerBalance}, sending rebalance signal ...`)
			return true
		}

		let hasUserLimit = poolsInfo[poolAddr].hasUserLimit

		if (!hasUserLimit) {
			logger.info(`pool ${poolAddr} has no user limit`)
			return false
		}

		logger.info(`pool ${poolAddr} has user limit = ${hasUserLimit}: rebalance=${(new BigNumber(this.maxStaked)).gt(WORKER_END_BALANCE)}`)

		return (new BigNumber(this.maxStaked)).gt(WORKER_END_BALANCE)
	}

	calcNWorkers() {
		const totalBalance = this.balance.staked.plus(this.balance.unstaked)
		return Math.ceil(Number((new BigNumber(totalBalance).dividedBy(WORKER_START_BALANCE)).toString()))
	}

	async addWorkers(nExpectedWorkers) {
		logger.debug(`checking if need to add workers...`)

		logger.info(`nExpectedWorkers=${nExpectedWorkers}, nWorkers=${this.nWorkers}`)
		// logger.info(`adding ${nExpectedWorkers-this.nWorkers} workers`)

		for (let i=0; i < nExpectedWorkers - this.nWorkers; i++) {

			logger.info(`adding worker ${i}`)

			let estimatedGas = 2 * (await this.manager.methods.addWorkers(1).estimateGas())
			console.log(`estimatedGas: ${estimatedGas}`)

			const tx = await this.manager.methods.addWorkers(1).encodeABI()
			const res = await this.sendTransactionWait(tx, this.manager.options.address, estimatedGas)

			logger.info(`addWorkers: `)
			console.log(res)
		}

		await this.setNWorkers()
	}

	async transferToWorkers(startIndex, endIndex) {

		if ((this.runningMode === RunningMode.DEV) && DEV_RAND_FAILURES) {
			logger.warning(`RANDOM failure mode is on ...`)
			assert (getRandomInt(3) !== 0, `transferToWorkers: simulating random failure`)
		}

		await this.setManagerBalance()
		const amount = (new BigNumber(this.managerBalance).dividedBy(endIndex-startIndex)).integerValue(BigNumber.ROUND_FLOOR).toString()
		logger.info(`transferToWorkers: amount=${amount}, startIndex=${startIndex}, endIndex=${endIndex}, managerBalance=${this.managerBalance}`)

		if (amount === '0') {
			logger.info(`no available funds to transfer to workers`)
			return
		}

		let _endIndex
		while (startIndex < endIndex) {

			_endIndex = Math.min(endIndex, startIndex+TRANSFER_BATCH_SIZE)
			const tx = await this.manager.methods.transferToWorkers([CAKE_ADDRESS, amount, startIndex, _endIndex]).encodeABI()
			const res = await this.sendTransactionWait(tx, this.manager.options.address)

			logger.info(`transferToWorkers: _startIndex=${startIndex}, _endIndex=${_endIndex}: `)
			console.log(res)
			startIndex += TRANSFER_BATCH_SIZE
		}

		logger.info(`transferred successfully to workers`)
	}

	async transferToManager(amount, startIndex, endIndex) {

		if (startIndex >= endIndex) {
			return
		}

		if ((this.runningMode === RunningMode.DEV) && DEV_RAND_FAILURES) {
			logger.warning(`RANDOM failure mode is on ...`)
			assert (getRandomInt(3) !== 0, `transferToWorkers: simulating random failure`)
		}

		let _endIndex
		while (startIndex < endIndex) {

			_endIndex = Math.min(endIndex, startIndex + TRANSFER_BATCH_SIZE)

			const tx = await this.manager.methods.transferToManager([CAKE_ADDRESS, amount, startIndex, _endIndex]).encodeABI()
			const res = await this.sendTransactionWait(tx, this.manager.options.address)

			logger.info(`transferToManager: _startIndex=${startIndex}, _endIndex=${_endIndex}: `)
			console.log(res)
			startIndex += TRANSFER_BATCH_SIZE
		}

		logger.info(`transferred successfully to manager`)
	}

	async transferToOwner() {
		const tx = await this.manager.methods.transferToOwner(CAKE_ADDRESS).encodeABI()
		const res = await this.sendTransactionWait(tx, this.manager.options.address)

		logger.info(`transferToOwner: `)
		console.log(res)
	}

	availableCakesForStaking() {
		return (this.getUnstakedWorkers() !== [])
	}

	getEmptyWorkers() {
		/*
		* workersBalance should be updated
		* empty worker is a worker without cake and staked balance (unstaked and staked balance = 0)
		*/

		let emptyWorkersId = []

		for (let [workerIndex, workerBalance] of Object.entries(this.workersBalance)) {

			if ((workerBalance.staked === '0') && (workerBalance.unstaked === '0')) {
				emptyWorkersId.push(workerIndex)
			}
		}

		return emptyWorkersId
	}

	getUnstakedWorkers() {
		/*
		* workersBalance should be updated
		* unstaked worker is a worker with cake balance (unstaked balance != 0)
		* might or might not have staked balance (although expected to have staked balance = 0)
		*/

		let emptyWorkersId = []

		for (let [workerIndex, workerBalance] of Object.entries(this.workersBalance)) {

			if (workerBalance.unstaked !== '0') {
				emptyWorkersId.push(workerIndex)
			}
		}

		return emptyWorkersId
	}

	getFullWorkers() {

		/*
		* workersBalance should be updated
		* returns worker indices that exceeds WORKER_END_BALANCE
		*/

		let fullWorkersId = []

		for (let [workerIndex, workerBalance] of Object.entries(this.workersBalance)) {

			if (new BigNumber(workerBalance.unstaked).gt(WORKER_END_BALANCE)) {
				fullWorkersId.push(workerIndex)
			}
		}

		return fullWorkersId

	}

	async transferAllCakesToWorker0() {
		/*
		* transfer all cakes from manager to worker 0
		*/

		await this.setManagerBalance()

		if (this.managerBalance.toString() === '0') {
			logger.info(`manager balance is 0, nothing to transfer to worker`)
			return
		}

		if ((this.runningMode === RunningMode.DEV) && DEV_RAND_FAILURES) {
			logger.warning(`RANDOM failure mode is on ...`)
			assert (getRandomInt(3) !== 0, `transferAllCakesToWorker0: simulating random failure`)
		}

		const startIndex = 0, endIndex = 1, amount = 0
		const tx = await this.manager.methods.transferToWorkers([CAKE_ADDRESS, amount, startIndex, endIndex]).encodeABI()
		const res = await this.sendTransactionWait(tx, this.manager.options.address)

		logger.info(`transferAllCakesToWorker0: `)
		console.log(res)

		logger.info(`transferred all cakes successfully to worker 0`)
	}

	async transferCakesToWorkers(emptyWorkersId) {
		/*
		* calculate number of workers needed to transfer WORKER_START_BALANCE
		* and transfer from manager to empty workers from given list (there might be empty workers that will stay empty)
		* empty workers are workers with cake balance = 0 and staked balance also 0
		* some workers might have different amount than the amount transferred in this function (any amount > 0, but it should be close to WORKER_START_BALANCE)
		*/

		if (emptyWorkersId === []) {
			logger.info(`no empty worker, all workers have either cake in balance or staked in syrup pool`)
			return
		}

		await this.setManagerBalance()

		if (this.managerBalance.toString() === '0') {
			logger.info(`manager balance is 0, nothing to transfer to workers`)
			return
		}

		if ((this.runningMode === RunningMode.DEV) && DEV_RAND_FAILURES) {
			logger.warning(`RANDOM failure mode is on ...`)
			assert (getRandomInt(3) !== 0, `transferToWorkers: simulating random failure`)
		}

		let nWorkers = Math.ceil(Number((this.managerBalance.dividedBy(WORKER_START_BALANCE)).toString()))
		assert (nWorkers < emptyWorkersId.length, `nWorkers = ${nWorkers} >= emptyWorkersId.length = ${emptyWorkersId.length}, can not send cakes to workers`)

		const amount = (new BigNumber(this.managerBalance).dividedBy(nWorkers)).integerValue(BigNumber.ROUND_FLOOR).toString()
		logger.info(`transferToWorkers: amount=${amount}, managerBalance=${this.managerBalance}`)

		let startIndex = emptyWorkersId[0]
		let endIndex

		while (true) {

			endIndex = Math.min(startIndex+TRANSFER_BATCH_SIZE, startIndex+nWorkers)
			// if wi
			if (endIndex !== emptyWorkersId[endIndex-1]+1) {
				endIndex = startIndex + 1
			}

			nWorkers -= (endIndex-startIndex)

			const tx = await this.manager.methods.transferToWorkers([CAKE_ADDRESS, amount, startIndex, endIndex]).encodeABI()
			const res = await this.sendTransactionWait(tx, this.manager.options.address)

			logger.info(`transferToWorkers: startIndex=${startIndex}, endIndex=${endIndex}, nWorkers=${nWorkers}: `)
			console.log(res)

			if (nWorkers <= 0) {
				logger.info(`breaking loop on nWorkers=${nWorkers}`)
				break
			}

			startIndex = endIndex
		}

		logger.info(`transferred cakes successfully to ${emptyWorkersId.length} workers`)
	}

	async transferCakesFromWorkersToMng(workersId) {
		/*
		* transfer from workers id list to manager while trying to optimize number of transactions
		* if workersId contain continuous ids send tx in sizes of BATCH_SIZE o.w transfer 1 by 1
		* e.g: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] with BATCH_SIZE=5 will send 2 tx: 0-5, 5-10
		* e.g: [0, 2, 4, 5, 6, 7, 8, 9] with BATCH_SIZE=5 will send 4 tx: 0-1, 2-3, 4-9, 9-10,
		*/

		if (workersId === []) {
			logger.info(`full worker list is empty`)
			return
		}

		if ((this.runningMode === RunningMode.DEV) && DEV_RAND_FAILURES) {
			logger.warning(`RANDOM failure mode is on ...`)
			assert (getRandomInt(3) !== 0, `transferCakesFromWorkersToMng: simulating random failure`)
		}

		let startIndex = workersId[0]
		let endIndex
		let nWorkersToProcess = workersId.length

		while (true) {

			endIndex = Math.min(startIndex + TRANSFER_BATCH_SIZE, startIndex + nWorkersToProcess)
			if (endIndex !== workersId[endIndex-1]+1) {
				endIndex = startIndex + 1
			}

			nWorkersToProcess -= (endIndex-startIndex)

			const tx = await this.manager.methods.transferToManager([0, startIndex, endIndex]).encodeABI()
			const res = await this.sendTransactionWait(tx, this.manager.options.address)

			logger.info(`transferCakesFromWorkersToMng: startIndex=${startIndex}, endIndex=${endIndex}, nWorkersToProcess=${nWorkersToProcess}: `)
			console.log(res)

			if (nWorkersToProcess <= 0) {
				logger.info(`transferCakesFromWorkersToMng: breaking loop on nWorkersToProcess=${nWorkersToProcess}`)
				break
			}

			startIndex = endIndex
		}

		logger.info(`transferred cakes successfully to ${workersId.length} workers`)
	}

	async prepareEnter(hasUserLimit) {

		if (hasUserLimit) {
			return await this.prepareEnterWithUserLimit()
		} else {
			return await this.prepareEnterWithoutUserLimit()
		}
	}

	async prepareEnterWithoutUserLimit() {
		/*
		* transfer all cakes from workers that are not worker[0] to manager
		* than transfer all cakes from manager to worker[0]
		* returns worker[0] index
		*/

		// fetch and update workers cake balance and set workersBalance object
		await this.fetchWorkersCakeBalance()
		this.setWorkersBalance()

		// get list of all unstaked workers
		let unstakedWorkersId = this.getUnstakedWorkers()

		if ((unstakedWorkersId.length === 1) && (unstakedWorkersId[0] === 0)) {
			logger.info(`only worker[0] has cake balance != 0, ready to enter pool`)
			return

		} else if ((unstakedWorkersId.length > 1) && (unstakedWorkersId[0] === 0)) {
			// remove worker 0 from unstakedWorkersId
			logger.info(`removing worker[0] from unstakedWorkersId, no need to transfer cakes from worker[0] to manager in order to enter pool`)
			unstakedWorkersId.shift()
		}

		// worker 0 was removed from unstakedWorkersId
		await this.transferCakesFromWorkersToMng(unstakedWorkersId)

		await this.transferAllCakesToWorker0()

		return [0]
	}

	async prepareEnterWithUserLimit() {
		/*
		* assuming all rewards were converted to cakes
		* create a list of full workers
		* transfer cakes from full workers to manager (staked workers or not-full workers are unaffected)
		* transfer cakes from manager to workers if needed
		* extract workers indices to batcher in order to enter pool
		* after this function manager should have zero cake balance and all cakes transferred to workers
		* returns all indices of workers with unstaked cakes
		*/

		// fetch and update workers cake balance and set workersBalance object
		await this.fetchWorkersCakeBalance()
		this.setWorkersBalance()

		// transfer cakes from full workers to manager
		let fullWorkersId = this.getFullWorkers()
		await this.transferCakesFromWorkersToMng(fullWorkersId)

		// get empty workers list, calc amount to transfer to each worker and transfer cakes from manager to empty workers
		const emptyWorkersId = this.getEmptyWorkers()
		await this.transferCakesToWorkers(emptyWorkersId)

		// fetch and update workers cake balance and set workersBalance object
		await this.fetchWorkersCakeBalance()
		this.setWorkersBalance()

		return this.getUnstakedWorkers()
	}

	async prepare(nextAction) {

		logger.info(`nWorkers=${this.nWorkers}, nActiveWorkers=${this.nActiveWorkers}, nextAction =>`)
		console.log(nextAction)

		switch (nextAction.name) {

			case Action.NO_OP:
				break

			case Action.ENTER:
				nextAction.workerIndices = await this.prepareEnter(nextAction.to.hasUserLimit)
				break
		}

		return nextAction
	}

	async postRun(nextAction, poolsInfo) {

		switch (nextAction) {

			case Action.TRANSFER_TO_OWNER:

				// assumes no funds in pools TODO: validate - no staked funds
				await this.transferToManager(0, 0, this.nWorkers)
				this.nActiveWorkers = 0
				await this.transferToOwner()
				break
		}

		if ((nextAction.name !== Action.NO_OP) || (Date.now() - this.lastWorkersValidate > this.workersValidateInterval)) {
			this.lastWorkersValidate = Date.now()
			await this.setWorkersBalanceInfo(poolsInfo)
			this.setWorkersBalance()
			await this.setTotalBalance()
			this.setNActiveWorkers()
			this.validateWorkers()
		}
	}

}


module.exports = {
    ContractManager,
};
