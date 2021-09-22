const {Logger} = require('../logger')
const logger = new Logger('TxManager')


class TxManager {

	constructor(web3, account) {
		this.web3 = web3;
		this.account = account;
	}

    async sendTransactionWait(encodedTx, to, gas = undefined, from=this.account.address) {

        if (!encodedTx) {
            return null;
        }

		let transactionObject = {
			gas: (gas ? gas : 500000),
			data: encodedTx,
			from: from,
			to: to,
		};

		logger.debug("sendTransactionWait ");
		console.log('transactionObject: ', transactionObject);
		const signedTx = await this.account.signTransaction(transactionObject);
		// logger.debug('signedTx:')
		// console.log(signedTx)

		const txResponse = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
		// logger.debug('## txResponse ##');
		// console.log(txResponse);

		const res = await this.pendingWait(1000, txResponse.transactionHash);
		// logger.debug('## txReceipt ##', res.gasUsed);
		// console.log(res);

		return res;
	}

    pendingWait = (milliseconds, txHash) => {
        return new Promise(resolve => setTimeout(async () => {
            const res = await this.web3.eth.getTransactionReceipt(txHash);
            if (res === null) {
                return this.pendingWait(milliseconds, txHash)
            }
            if (res['status'] === true) {
                resolve(res)
            }
            return null;
        }, milliseconds),)
    }
}

module.exports = {
	TxManager,
};
