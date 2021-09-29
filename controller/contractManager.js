const {WORKER_START_BALANCE, OWNER_ADDRESS} = require("../config");
const Contract = require('web3-eth-contract') // workaround for web3 leakage
const {CAKE_ABI, SMARTCHEF_INITIALIZABLE_ABI} = require('../abis')
const {Action} = require("./policy");
const {MASTER_CHEF_ADDRESS, CAKE_ADDRESS} = require('./params')
const {FatalError, NotImplementedError} = require('../errors');

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

	async getWorkersStakingAddr() {

		let reply = await this.redisClient.get(`WorkersStakingAddr.${process.env.BOT_ID}`)

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

		let reply = await this.redisClient.get(`nActiveWorkers.${process.env.BOT_ID}`)

		if (reply == null) {

			logger.info('nActiveWorkers is null, setting nActiveWorkers to 0')
			this.nActiveWorkers = 0
			return
		}

		this.nActiveWorkers = Number(reply)
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

	async setWorkersBalance() {

		// updates workersBalance
		let workersBalance = {}
		let workerInfo;

		for (let workerIndex=0; workerIndex<this.workersAddr.length; workerIndex++) {

			workerInfo = this.workersBalanceInfo[workerIndex]
			workersBalance[workerIndex] = {}

			for (const [key, value] of Object.entries(workerInfo)) {

				if (key === CAKE_ADDRESS) {
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

		// only cake or cake + 1 pool is expected
		if (expectedKeys.length > 2) {
			// TODO: sync workers and call init
			throw Error(`workers are out of sync: ${this.workersBalanceInfo}`)
		}

		let workerInfo
		for (let workerIndex=0; workerIndex<this.workersAddr.length; workerIndex++) {

			if (workerIndex === this.nActiveWorkers) {
				expectedKeys = Object.keys(this.workersBalanceInfo[this.nActiveWorkers])

				if (expectedKeys.length !== 1) {
					// TODO: sync workers and call init
					throw Error(`workers are out of sync: ${this.workersBalanceInfo}`)
				}
			}

			workerInfo = this.workersBalanceInfo[workerIndex]

			if (JSON.stringify(Object.keys(workerInfo)) !== JSON.stringify(expectedKeys)) {
				// TODO: sync workers and call init
				throw Error(`workers are out of sync (workerIndex=${workerIndex}, nActiveWorkers=${this.nActiveWorkers}): ${JSON.stringify(this.workersBalanceInfo)}`)
			}

		}

		expectedKeys = Object.keys(this.workersBalanceInfo[0])

		for (let key of expectedKeys) {

			if (key !== CAKE_ADDRESS) {
				this.stakedAddr = key
				return
			}
		}

		this.stakedAddr = null
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
		logger.info(`total balance: `)
		console.log(this.balance)
		return this.balance
	}

	async syncWorkers() {
		// check if workers are synced if not:
		// swap all digens to cakes, transfer all to manager
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

		this.nWorkers = nExpectedWorkers
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

	async run(nextAction, poolsInfo) {

		if (Date.now() - this.lastWorkersValidate > this.workersValidateInterval) {
			// await this.initWorkers(poolsInfo) // TODO: periodic updates
			this.lastWorkersValidate = Date.now()
		}

		if (nextAction.name === Action.ENTER) {

			logger.info(`enter pool, nActiveWorkers=${this.nActiveWorkers}, nextAction:`)
			console.log(nextAction)

			await this.setWorkersBalanceInfo(poolsInfo) // TODO: improve

			if (nextAction.to.hasUserLimit === true) {

				if (this.nActiveWorkers === 0) {
					logger.info(`nActiveWorkers=0`)
					// transfer all funds back to manager and then transfer to all (nWorkers) workers
					await this.addWorkers()
					this.nActiveWorkers = this.nWorkers
					await this.transferToWorkers(0, this.nActiveWorkers)
					this.redisClient.set(`nActiveWorkers.${process.env.BOT_ID}`, this.nActiveWorkers)
				}

				if (this.nActiveWorkers === 1) {
					// transfer all funds back to manager and then transfer to all (nWorkers) workers
					await this.transferToManager(0, 0, this.nActiveWorkers)
					await this.addWorkers()
					this.nActiveWorkers = this.nWorkers
					await this.transferToWorkers(0, this.nActiveWorkers)
					this.redisClient.set(`nActiveWorkers.${process.env.BOT_ID}`, this.nActiveWorkers)
				}

			} else {

				if (this.nActiveWorkers === 0) {
					this.nActiveWorkers = 1
					await this.addWorkers(1)
					await this.transferToWorkers(0,  this.nActiveWorkers)
					this.redisClient.set(`nActiveWorkers.${process.env.BOT_ID}`, this.nActiveWorkers)
				}

				else if (this.nActiveWorkers > 1) {
					// transfer all funds back to manager and then transfer to all worker 0
					await this.transferToManager(0, 0, this.nActiveWorkers)
					this.nActiveWorkers = 1
					await this.addWorkers(1)
					await this.transferToWorkers(0,  this.nActiveWorkers)
					this.redisClient.set(`nActiveWorkers.${process.env.BOT_ID}`, this.nActiveWorkers)
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
