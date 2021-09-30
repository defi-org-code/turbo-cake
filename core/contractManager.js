const {WORKER_START_BALANCE, OWNER_ADDRESS} = require("../config");
const Contract = require('web3-eth-contract') // workaround for web3 leakage
const {CAKE_ABI, SMARTCHEF_INITIALIZABLE_ABI} = require('../abis')
const {Action} = require("./policy");
const {MASTER_CHEF_ADDRESS, CAKE_ADDRESS} = require('./params')
const {assert} = require('../helpers')

const {Logger} = require('../logger')
const logger = new Logger('ContractManager')

const {TxManager} = require("./txManager");

const BigNumber = require('bignumber.js')
BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})

class ContractManager extends TxManager {

	constructor(web3, admin	, manager, redisClient, workersValidateInterval) {
		super(web3, admin)
		this.web3 = web3
		this.redisClient = redisClient
		this.admin = admin

		this.manager = manager
		this.cakeContract = this.getContract(CAKE_ABI, CAKE_ADDRESS)

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

		this.fullStaking = null
		this.workersStakingAddr = null
		this.stakedAddr = null
	}

	async init(poolsInfo) {

		await this.validateAddr()
		await this.getNWorkers()
		await this.setWorkersBalanceInfo(poolsInfo)
		this.setWorkersBalance()
		this.setNActiveWorkers()
		this.validateWorkers()

		await this.setTotalBalance()
		this.initFullStaking()
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

	async getNWorkers() {
		this.nWorkers = await this.manager.methods.getNWorkers().call()
	}

	async fetchWorkersAddr() {
		// TODO: save in redis and fetch only missing
		if (this.nWorkers === 0) {
			this.workersAddr = []
			return
		}

		this.workersAddr = await this.manager.methods.getWorkers(0, this.nWorkers).call()
		logger.info(`workersAddr: ${this.workersAddr}`)
	}

	async setWorkersBalanceInfo(poolsInfo) {
		let res, contract
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
			contract = this.getContract(SMARTCHEF_INITIALIZABLE_ABI, poolAddr)

			if (poolAddr === MASTER_CHEF_ADDRESS) {

				for (let i=0; i<this.workersAddr.length; i++) {
					logger.info(`fetching worker[${i}] usersInfo from pool ${poolsInfo[poolAddr]['rewardSymbol']} ...`)

					res = await contract.methods.userInfo(0, this.workersAddr[i]).call()

					if (res['amount'] !== '0') {
						workersBalanceInfo[i][poolAddr] = res['amount']
					}
				}
			}

			else {

				// TODO: fetch rewards symbol balance (expected to be 0) - in case we have some rewards (not in cake) convert to cake

				for (let i=0; i<this.workersAddr.length; i++) {
					res = await contract.methods.userInfo(this.workersAddr[i]).call()

					if (res['amount'] !== '0') {
						workersBalanceInfo[i][poolAddr] = res['amount']
					}

					if (res['rewardDebt'] !== '0') {
						logger.info(`setWorkersBalanceInfo: workerAddr=${this.workersAddr[i]}, res=${JSON.stringify(res)}`)
					}
				}
			}
		}

		this.workersBalanceInfo = workersBalanceInfo
		logger.info('workersBalanceInfo: ')
		console.log(this.workersBalanceInfo)
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

	getActiveWorkersIndices() {

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

		// validate all workers have the same staking addr and return this addr
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
		let workersStakingAddr = {}
		let workerInfo, stakingAddr = null;

		for (let workerIndex=0; workerIndex<this.workersAddr.length; workerIndex++) {

			workerInfo = this.workersBalanceInfo[workerIndex]
			workersStakingAddr[workerIndex] = null

			for (const [key, value] of Object.entries(workerInfo)) {

				if (key !== CAKE_ADDRESS) {
					assert(workersStakingAddr[workerIndex] === null, (`worker ${workerIndex} has staking in more than 1 pool: ${workerInfo}`))
					assert(stakingAddr === null || stakingAddr === value, `workers are staked at 2 different addresses: ${value}, ${stakingAddr}`)
					workersStakingAddr[workerIndex] = value
					stakingAddr = value
				}
			}
		}

		this.workersStakingAddr = workersStakingAddr
		this.stakedAddr = stakingAddr

		logger.info(`stakingAddr: ${stakingAddr}`)
		logger.info(`workersStakingAddr: `)
		console.log(workersStakingAddr)
	}

	initFullStaking() {
		// assumes manager balance is updated

		if (this.nStakedWorkers !== 0 && this.nUnstakedWorkers !== 0) {
			this.fullStaking = false
		}

		else {
			this.fullStaking = (this.managerBalance === '0')
		}

	}

	async setTotalBalance() {

		await this.setManagerBalance()
		logger.info(`manager total balance: ${this.managerBalance}`)
		let totalBalance = {unstaked: new BigNumber(this.managerBalance), staked: new BigNumber(0)}

		for (let [workerIndex, workerBalance] of Object.entries(this.workersBalance)) {
			totalBalance.staked = totalBalance.staked.plus(workerBalance.staked)
			totalBalance.unstaked = totalBalance.unstaked.plus(workerBalance.unstaked)
		}

		this.balance = totalBalance
		logger.info(`saving total balance to redis, total balance => `)
		console.log(this.balance)
		return this.balance
	}

	async addWorkers(nExpectedWorkers=null) {
		logger.debug(`checking if need to add workers...`)

		if (nExpectedWorkers === null) {

			await this.setManagerBalance()
			logger.info(`manager balance: ${this.managerBalance}`)

			nExpectedWorkers = this.calcNWorkers(this.managerBalance)
		}

		logger.info(`nExpectedWorkers=${nExpectedWorkers}, nWorkers=${this.nWorkers}`)
		logger.info(`adding ${nExpectedWorkers-this.nWorkers} workers`)

		for (let i=0; i < nExpectedWorkers - this.nWorkers; i++) {

			logger.info(`adding worker ${i}`)

			let estimatedGas = 2 * (await this.manager.methods.addWorkers(1).estimateGas())
			console.log(`estimatedGas: ${estimatedGas}`)

			const tx = await this.manager.methods.addWorkers(1).encodeABI()
			const res = await this.sendTransactionWait(tx, this.manager.options.address, estimatedGas)

			logger.info(`addWorkers: `)
			console.log(res)
		}

		this.nWorkers = await this.getNWorkers()
	}

	calcNWorkers(balance) {
		return Math.ceil(Number((new BigNumber(balance).dividedBy(WORKER_START_BALANCE)).toString()))
	}

	async transferToWorkers(startIndex, endIndex) {
		const amount = (new BigNumber(this.managerBalance).dividedBy(endIndex-startIndex)).toString()
		logger.info(`transferToWorkers: amount=${amount}, startIndex=${startIndex}, endIndex=${endIndex}`)
		const tx = await this.manager.methods.transferToWorkers([CAKE_ADDRESS, amount, startIndex, endIndex]).encodeABI()
		const res = await this.sendTransactionWait(tx, this.manager.options.address)

		logger.info(`transferToWorkers: `)
		console.log(res)
	}

	async transferToManager(amount, startIndex, endIndex) {
		const tx = await this.manager.methods.transferToManager([CAKE_ADDRESS, amount, startIndex, endIndex]).encodeABI()
		const res = await this.sendTransactionWait(tx, this.manager.options.address)

		logger.info(`transferToManager: `)
		console.log(res)
	}

	async transferToOwner() {
		const tx = await this.manager.methods.transferToOwner(CAKE_ADDRESS).encodeABI()
		const res = await this.sendTransactionWait(tx, this.manager.options.address)

		logger.info(`transferToOwner: `)
		console.log(res)
	}

	async prepare(nextAction) {

		if (Date.now() - this.lastWorkersValidate > this.workersValidateInterval) {
			// TODO: periodic updates - add workers? (e.g.: we are staked in pool for long period without pool change and each worker has now more than 100 cakes)
			this.lastWorkersValidate = Date.now()
		}

		logger.info(`nWorkers=${this.nWorkers}, nActiveWorkers=${this.nActiveWorkers}, nextAction =>`)
		console.log(nextAction)

		switch (nextAction.name) {

			case Action.ENTER:

				if (nextAction.to.hasUserLimit === true) {

					if (this.nActiveWorkers === 0) {
						logger.info(`nActiveWorkers=0`)
						// transfer all funds back to manager and then transfer to all (nWorkers) workers
						await this.addWorkers()
						this.nActiveWorkers = this.nWorkers
						await this.transferToWorkers(0, this.nActiveWorkers)
					}

					if (this.nActiveWorkers === 1) {
						// transfer all funds back to manager and then transfer to all (nWorkers) workers
						await this.transferToManager(0, 0, this.nActiveWorkers)
						await this.addWorkers()
						this.nActiveWorkers = this.nWorkers
						await this.transferToWorkers(0, this.nActiveWorkers)
					}

				} else {

					if (this.nActiveWorkers === 0) {
						this.nActiveWorkers = 1
						await this.addWorkers(1)
						await this.transferToWorkers(0,  this.nActiveWorkers)

					}

					else if (this.nActiveWorkers > 1) {
						// transfer all funds back to manager and then transfer all to worker 0
						await this.transferToManager(0, 0, this.nActiveWorkers)
						this.nActiveWorkers = 1
						await this.addWorkers(1)
						await this.transferToWorkers(0,  this.nActiveWorkers)
					}
				}

				break

			default:
				break
		}

		nextAction.startIndex = 0
		nextAction.endIndex = this.nActiveWorkers
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

		if (nextAction.name !== Action.NO_OP) {
			await this.setWorkersBalanceInfo(poolsInfo)
			await this.setTotalBalance()
		}
	}

}


module.exports = {
    ContractManager,
};
