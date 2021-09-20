const {WORKER_START_BALANCE, WORKER_REBALANCE_TH} = require("../config");
const Contract = require('web3-eth-contract') // workaround for web3 leakage
const {CAKE_ABI} = require('../abis')
const {Action} = require("./policy");
const {MASTER_CHEF_ADDRESS, SMARTCHEF_FACTORY_ADDRESS, CAKE_ADDRESS} = require('./params')
const {FatalError, NotImplementedError} = require('../errors');

const {Logger} = require('../logger')
const logger = new Logger('ContractManager')

const {TxManager} = require("./txManager");

const BigNumber = require('bignumber.js')
BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})

class ContractManager extends TxManager {

	constructor(web3, account, manager, redisClient, workersValidateInterval) {
		super(web3, account)
		this.web3 = web3
		this.redisClient = redisClient
		this.admin = account

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
	}

	async init(poolsInfo) {

		await this.initWorkers(poolsInfo)
		await this.setTotalBalance()
		// redis set total balance

		return this.stakedAddr
	}

	getContract(contractAbi, contractAddress) {
		const contract = new Contract(contractAbi, contractAddress)
		contract.setProvider(this.web3.currentProvider)
		return contract
	}

	async initWorkers(poolsInfo) {

		await this.restrictValidate()
		await this.getNActiveWorkers()
		await this.getNWorkers()
		await this.fetchWorkersAddr()
		await this.setWorkersBalanceInfo(poolsInfo)
		await this.initStakedAddr()
		await this.setWorkersBalance()

		// await this.syncWorkers()
	}

	async restrictValidate() {
		const admin = await this.manager.methods.admin().call()
		const owner = await this.manager.methods.owner().call()

		if (admin !== this.admin.address) {
			throw Error(`unexpected admin address contract admin address ${admin}, init admin address ${this.admin.address}`)
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
	}

	async getWorkersStakingAddr() {

		let reply = await this.redisClient.get('WorkersStakingAddr')

		if (reply == null) {

			logger.info('WorkersStakingAddr is null, fetching staking address from chain')
			await this.fetchWorkersStakingAddr();
			return
		}

		const workersStakingAddr = JSON.parse(reply)
		logger.debug(`workersStakingAddr: `)
		console.log(workersStakingAddr)

		return workersStakingAddr
	}

	async getNActiveWorkers() {

		let reply = await this.redisClient.get('nActiveWorkers')

		if (reply == null) {

			logger.info('nActiveWorkers is null, setting nActiveWorkers to 0')
			this.nActiveWorkers = 0
			return
		}

		this.nActiveWorkers = Number(reply)
	}

	async setWorkersBalanceInfo(poolsInfo) {
		// workersBalanceInfo[index]: {WORKER_ADDRESS: worker_address, CAKE_ADDRESS: cake_Balance, STAKE_ADDR0: stake_balance0, STAKE_ADDR1: stake_balance_1} - expect to have only 1 staking address
		let res, contract
		let workersBalanceInfo = {}
		let cakeBalance

		if (this.workersAddr.length === 0) {
			this.workersBalanceInfo = {}
			return
		}

		for (let i=0; i<this.workersAddr.length; i++) {
			cakeBalance = await this.cakeContract.methods.balanceOf(this.workersAddr[i]).call();
			workersBalanceInfo[i] = {WORKER_ADDRESS: this.workersAddr[i], CAKE_ADDRESS: cakeBalance}
		}

		for (const poolAddr of Object.keys(poolsInfo)) {
			contract = this.getContract(poolsInfo[poolAddr]['abi'], poolAddr)

			if (poolAddr === MASTER_CHEF_ADDRESS) {

				for (let i=0; i<this.workersAddr.length; i++) {
					res = await contract.methods.userInfo(0, this.workersAddr[i]).call()

					if (res['amount'] !== '0') {
						workersBalanceInfo[i][poolAddr] = res['amount']
					}
				}
			}

			else {

				for (let i=0; i<this.workersAddr.length; i++) {
					res = await contract.methods.userInfo(this.workersAddr[i]).call()

					if (res['amount'] !== '0') {
						workersBalanceInfo[i][poolAddr] = res['amount']
					}
				}
			}
		}

		this.workersBalanceInfo = workersBalanceInfo
	}

	async setManagerBalance() {
		this.managerBalance = await this.cakeContract.methods.balanceOf(this.manager.options.address).call();
	}

	async setWorkersBalance() {

		// updates workersBalance
		let workersBalance = {}
		let workerInfo;

		for (let workerIndex=0; workerIndex<this.workersAddr.length; workerIndex++) {

			workerInfo = this.workersBalanceInfo[workerIndex]
			workersBalance[workerIndex] = {}

			for (const [key, value] of Object.entries(workerInfo)) {

				if (key === 'WORKER_ADDRESS') {
					logger.debug(`processing worker ${value} ...`)
				}

				else if (key === 'CAKE_ADDRESS') {
					workersBalance[workerIndex].unstaked = value
				}

				else {
					workersBalance[workerIndex].staked = value
				}
			}
		}

		this.workersBalance = workersBalance
	}

	initStakedAddr() {

		// validate all workers have the same staking addr and return this addr
		if (Object.keys(this.workersBalanceInfo).length === 0) {

			if(this.nActiveWorkers !== 0) {
				// TODO: sync workers and call init
				throw Error(`workers are out of sync: nActiveWorkers=${this.nActiveWorkers} while there is no active workersBalanceInfo`)
			}

			this.stakedAddr = null
			return
		}

		let expectedKeys = Object.keys(this.workersBalanceInfo[0])

		if (expectedKeys.length > 3) {
			// WORKER_ADDRESS, CAKE_ADDRESS ->2 and we might have additional 1 staked addr (or not)
			// TODO: sync workers and call init
			throw Error(`workers are out of sync: ${this.workersBalanceInfo}`)
		}

		let workerInfo
		for (let workerIndex=0; workerIndex<this.workersAddr.length; workerIndex++) {

			if (workerIndex === this.nActiveWorkers) {
				expectedKeys = Object.keys(this.workersBalanceInfo[this.nActiveWorkers])

				if (expectedKeys.length !== 2) {
					// WORKER_ADDRESS, CAKE_ADDRESS ->2 and we might have additional 1 staked addr (or not)
					// TODO: sync workers and call init
					throw Error(`workers are out of sync: ${this.workersBalanceInfo}`)
				}
			}

			workerInfo = this.workersBalanceInfo[workerIndex]

			if (Object.keys(workerInfo) !== expectedKeys) {
				// TODO: sync workers and call init
				throw Error(`workers are out of sync (workerIndex=${workerIndex}, nActiveWorkers=${this.nActiveWorkers}): ${this.workersBalanceInfo}`)
			}
		}

		expectedKeys = Object.keys(this.workersBalanceInfo[0])

		if (expectedKeys.length === 2) {
			this.stakedAddr = null
		}

		// else if (expectedKeys.length === 3)

		for (let key of expectedKeys) {

			if ((key !== 'WORKER_ADDR') && (key !== 'CAKE_ADDRESS')) {
				this.stakedAddr = expectedKeys
				return
			}
		}

		throw Error('could not find staking addr')
	}

	async setTotalBalance() {
		await this.setManagerBalance()
		let totalBalance = {unstaked: new BigNumber(this.managerBalance), staked: new BigNumber(0)}

		for (let [workerIndex, workerBalance] of Object.entries(this.workersBalance)) {
			totalBalance.staked = totalBalance.staked.plus(workerBalance.staked)
			totalBalance.unstaked = totalBalance.unstaked.plus(workerBalance.unstaked)
		}

		this.balance = totalBalance
	}

	async syncWorkers() {
		// check if workers are synced if not:
		// swap all digens to cakes, transfer all to manager
	}

	async addWorkers() {
		logger.debug(`checking if need to add workers...`)

		await this.setManagerBalance()
		logger.info(`manager balance: ${this.managerBalance}`)

		const nExpectedWorkers = this.calcNWorkers(this.managerBalance)

		logger.info(`nExpectedWorkers=${nExpectedWorkers}`)

		if (nExpectedWorkers < this.nWorkers) {
			logger.info(`adding workers: nWorkers(${this.nWorkers})<nExpectedWorkers`)

			const tx = await this.manager.methods.addWorkers(nExpectedWorkers-this.nWorkers).encodeABI()
			const res = await this.sendTransactionWait(tx, this.manager.options.address, undefined, this.admin.address)

			logger.info(`addWorkers: `)
			console.log(res)

			this.nWorkers = nExpectedWorkers
			return true
		}

		return false
	}

	calcNWorkers(balance) {
		return (new BigNumber(balance).dividedBy(WORKER_START_BALANCE)).toString()
	}

	async transferToWorkers(startIndex, endIndex) {
		const amount = (new BigNumber(this.managerBalance).dividedBy(endIndex-startIndex)).toString()
		logger.info(`transferToWorkers: amount=${amount}, startIndex=${startIndex}, endIndex=${endIndex}`)
		const tx = await this.manager.methods.transferToWorkers([CAKE_ADDRESS, amount, startIndex, endIndex]).encodeABI()
		const res = await this.sendTransactionWait(tx, this.manager.options.address, undefined, this.admin.address)

		logger.info(`transferToWorkers: `)
		console.log(res)
	}

	async transferToManager(amount, startIndex, endIndex) {
		const tx = await this.manager.methods.transferToManager([CAKE_ADDRESS, amount, startIndex, endIndex]).encodeABI()
		const res = await this.sendTransactionWait(tx, this.manager.options.address, undefined, this.admin.address)

		logger.info(`transferToManager: `)
		console.log(res)
	}

	async run(nextAction, poolsInfo) {

		if (Date.now() - this.lastWorkersValidate > this.workersValidateInterval) {
			// await this.initWorkers(poolsInfo) // TODO: periodic updates
			this.lastWorkersValidate = Date.now()
		}

		if (nextAction.name === Action.ENTER) {

			logger.info(`enter pool, nActiveWorkers=${this.nActiveWorkers}, nextAction:`)
			console.log(nextAction)

			if (nextAction.to.hasUserLimit === true) {

				if (this.nActiveWorkers === 0) {
					logger.info(`nActiveWorkers=0`)
					// transfer all funds back to manager and then transfer to all (nWorkers) workers
					await this.addWorkers()
					this.nActiveWorkers = this.nWorkers
					await this.transferToWorkers(0, this.nActiveWorkers)
					this.redisClient.set('nActiveWorkers', this.nActiveWorkers)
				}

				if (this.nActiveWorkers === 1) {
					// transfer all funds back to manager and then transfer to all (nWorkers) workers
					await this.transferToManager(0, 0, this.nActiveWorkers)
					await this.addWorkers()
					this.nActiveWorkers = this.nWorkers
					await this.transferToWorkers(0, this.nActiveWorkers)
					this.redisClient.set('nActiveWorkers', this.nActiveWorkers)
				}

			} else {

				if (this.nActiveWorkers === 0) {
					this.nActiveWorkers = 1
					await this.transferToWorkers(0,  this.nActiveWorkers)
					this.redisClient.set('nActiveWorkers', this.nActiveWorkers)
				}

				else if (this.nActiveWorkers > 1) {
					// transfer all funds back to manager and then transfer to all worker 0
					await this.transferToManager(0, 0, this.nActiveWorkers)
					this.nActiveWorkers = 1
					await this.transferToWorkers(0,  this.nActiveWorkers)
					this.redisClient.set('nActiveWorkers', this.nActiveWorkers)
				}
			}
		}

		nextAction.startIndex = 0
		nextAction.endIndex = this.nActiveWorkers
		return nextAction
	}

}


module.exports = {
    ContractManager,
};
