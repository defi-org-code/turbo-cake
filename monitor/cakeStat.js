const {CAKE_VAULT_ADDRESS, MASTERCHEF_ADDRESS, CAKE_ADDRESS} = require('./address')
const {CAKE_VAULT_ABI, MASTERCHEF_ABI, CAKE_ABI} = require('./abis')

const {getContract, fetchAbi, BigNumber} = require('./common')
const prompts = require('prompts');

class CakeStat {

	constructor() {

	}

	async init() {
		this.cakeVaultContract = await getContract(CAKE_VAULT_ABI, CAKE_VAULT_ADDRESS)
		this.masterchefContract = await getContract(MASTERCHEF_ABI, MASTERCHEF_ADDRESS)
	}

	async numCakesInCakeVault(userAddr) {
		const userInfo = await this.cakeVaultContract.methods.userInfo(userAddr).call()
		const totalShares = await this.cakeVaultContract.methods.totalShares().call()
		const balanceOf = await this.cakeVaultContract.methods.balanceOf().call()

		return balanceOf * userInfo['shares'] / totalShares
	}

	async numCakesInMasterchef(userAddr, pid=0) {
		const poolInfo = await this.masterchefContract.methods.poolInfo(pid).call()
		const userInfo = await this.masterchefContract.methods.userInfo(pid, userAddr).call()

		const amount = new BigNumber(userInfo['amount'])
		const rewardDebt = new BigNumber(userInfo['rewardDebt'])
		const accCakePerShare = new BigNumber(poolInfo['accCakePerShare'])

		return amount.mul(accCakePerShare).div(1e12).sub(rewardDebt)
	}

	async numCakesInSmartchef(poolAddr, userAddr) {

		const smartchefAbi = await fetchAbi(poolAddr)
		const smartchefContract = await getContract(smartchefAbi, poolAddr)

		const PRECISION_FACTOR = new BigNumber(await smartchefContract.methods.PRECISION_FACTOR().call())

		const userInfo = await smartchefContract.methods.userInfo(userAddr).call()
		const accCakePerShare = new BigNumber(await smartchefContract.methods.accTokenPerShare().call())

		const amount = new BigNumber(userInfo['amount'])
		const rewardDebt = new BigNumber(userInfo['rewardDebt'])

		const stakedToken = await smartchefContract.methods.stakedToken().call()
		const stakedTokenContract = await getContract(await fetchAbi(stakedToken), stakedToken)
		const decimals = new BigNumber(await stakedTokenContract.methods.decimals().call())

		return amount.multipliedBy(accCakePerShare).dividedBy(PRECISION_FACTOR).minus(rewardDebt).dividedBy(decimals).toString()
	}

	async run() {

		const poolAddr = "0xDe4AEf42Bb27a2cb45c746aCDe4e4D8aB711D27C"
		const userAddr = "0xef35d7c8cae7e65d2a93145f8fd33d394d686706"

		// const {poolAddr, userAddr} = await prompts([
		// {
		// 	type: "text",
		// 	name: "poolAddr",
		// 	message: "pool address:",
		// },
		// {
		// 	type: "text",
		// 	name: "userAddr",
		// 	message: "user address:",
		// },
		// ]);

		await this.init()

		switch (poolAddr.toLowerCase()) {

			case CAKE_VAULT_ADDRESS.toLowerCase():
				return await this.numCakesInCakeVault(userAddr)

			case MASTERCHEF_ADDRESS.toLowerCase():
				return await this.numCakesInMasterchef(userAddr)

			default:
				console.log(await this.numCakesInSmartchef(poolAddr, userAddr))
				return await this.numCakesInSmartchef(poolAddr, userAddr)

		}
	}
}


let cakeStat = new CakeStat()
cakeStat.run()

