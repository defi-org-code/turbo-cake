const web3_ws = require('./web3_ws')


async function subscribeEvent(self, abi, addr, callback) {

	const contract = new web3_ws.eth.Contract(abi, addr);

	contract.events.allEvents()
		.on("connected", async function(subscriptionId){
			console.log('subscriptionId: ', subscriptionId);
			await callback(self, 'connected', subscriptionId);
		})
		.on('data', async function(event){
			console.log(event); // same results as the optional callback above
			await callback(self, 'data', event);
		})
		.on('changed', async function(event){
			console.log('change', event)
			await callback(self, 'changed', event);
		})
		.on('error', async function(error, receipt) {
			console.log('error', error)
			await callback(self, 'error', error);

		});
}

module.exports = subscribeEvent

