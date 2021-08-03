const GasManager = require('./gasManager');
const Notifications = require('../notifications')
const debug = (...messages) => console.log(...messages);


class TxManager {

	account = null

	constructor(web3) {

		this.web3 = web3;
		this.notif = new Notifications();
	}

	async pendingTransactionReceipt(self, txHash) {

		let res;

		try {
			res = await this.web3.eth.getTransactionReceipt(txHash);
		} catch (e) {

			this.notif.sendDiscord(`failed to send transaction: ${e}`);
			await self.onTxFailure();
			return
		}

		if (res === null) {
			console.log(`pending for transaction receipt (txHash=${txHash})`);
			setTimeout(() => this.pendingTransactionReceipt(self, txHash), 5000);
		}

		// TODO:check return status values
		else if (res['status'] === true) {
			this.notif.sendDiscord(`transaction receipt was received: ${JSON.stringify(res)}`);
			await self.onTxSuccess(res);
		}

		// TODO:check return status values
		else if (res['status'] === false) {
			this.notif.sendDiscord(`failed to send transaction: ${JSON.stringify(res)}`);
			await self.onTxFailure();
		}

	}

	async sendSignedTx(self, encodedTx, toAddress, maxGasUnits=500000) {

		debug(`sendSignedTx: ${encodedTx}`);

		let transactionObject = {
			// gasBidPrice: this.web3.utils.toWei(gasBidPrice, 'Gwei'),
			gas: maxGasUnits,
			data: encodedTx,
			from: this.account.address,
			to: toAddress
		};

		debug('sendSignedTx');
		// const res = await this.web3.eth.sendTransaction(transactionObject);

		const signedTx = await this.account.signTransaction(transactionObject);
		const res = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

		// const signedTx = await this.account.signTransaction(transactionObject);
		// const res = this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

		console.log(res);

		// TODO: use txHash pending for dynamic update of gas
		await this.pendingTransactionReceipt(self, res['transactionHash']);
	}

}

module.exports = TxManager
