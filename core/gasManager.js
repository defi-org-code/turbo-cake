require('dotenv').config();
const fetch = require("node-fetch");
const {GAS_CAP} = require('./params');
const { GasError } =  require('../errors');

class GasManager {

	GAS_STATE = {'IDLE': 0, 'COOL_DOWN': 1};

	constructor(web3) {
		this.web3 = web3;
		this.gasState = this.GAS_STATE.IDLE;
	}

	async fetchGasInfo() {
		// const gasConfirmTime =  `https://api.etherscan.io/api?module=gastracker&action=gasestimate&gasprice=2000000000&apikey=${process.env.ETHERSCAN_API_KEY}`
		const gasOracle =  `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${process.env.ETHERSCAN_API_KEY}`;
		return await fetch(gasOracle).then(response => response.json());
	}

	async fastGasPrice() {

		// const gasInfo = await this.fetchGasInfo();
		// const fastGasPrice = this.web3.utils.toWei(gasInfo['result']['FastGasPrice'], 'Gwei');
		const fastGasPrice = await this.web3.eth.getGasPrice();

		if (fastGasPrice >= GAS_CAP) {
			throw new GasError(`gas price is too high (${fastGasPrice})`);
		}

		return fastGasPrice;
	}

	updateGasState(gasState) {
		this.gasState = gasState;
		console.log(`setting gas state to ${gasState}`);
	}

	async gasExceedsMax() {

		if (this.gasState === this.GAS_STATE.COOL_DOWN) {
			console.log('gas state cooling down ...')
			return true;
		}

		// https://info.etherscan.com/api-return-errors/
		// const gasInfo = await this.fetchGasInfo();
		// const fastGasPrice = gasInfo['result']['FastGasPrice'];

		const fastGasPrice = await this.web3.eth.getGasPrice();
		const exceedMax = fastGasPrice >= GAS_CAP;

		if (exceedMax) {
			setTimeout(() => this.updateGasState(this.GAS_STATE.IDLE), 5000);
			this.gasState = this.GAS_STATE.COOL_DOWN;
		}

		return exceedMax
	}
}


module.exports = GasManager

