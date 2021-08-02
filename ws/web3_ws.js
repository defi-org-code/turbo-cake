
const Web3 = require('web3');
require('dotenv').config();

const debug = (...messages) => console.log(...messages)

const ETHEREUM_ENDPOINT_WS = process.env.ETHEREUM_WS;
const web3_ws = new Web3();

const options = {
	// Enable auto reconnection
	reconnect: {
		auto: true,
		delay: 5000, // ms
		maxAttempts: 5,
		onTimeout: false
	}
};

function refreshProvider(web3Obj, providerUrl) {
	let retries = 0

	function retry(event) {
		debug(`retries: ${retries} times tried`)

		if (event) {
			debug('Web3 provider disconnected or errored.')
			retries += 1

			if (retries > 5) {
				debug(`Max retries of 5 exceeding: ${retries} times tried`)
				return setTimeout(refreshProvider, 5000)
			}
		} else {
			debug('event: ', event)
			debug(`Reconnecting web3_ws provider ${ETHEREUM_ENDPOINT_WS}`)
			refreshProvider(web3Obj, providerUrl)
		}

		return null
	}

	const provider = new Web3.providers.WebsocketProvider(ETHEREUM_ENDPOINT_WS, options)

	// provider.on('end', () => retry())
	provider.on('error', () => retry())

	web3Obj.setProvider(provider)

	// debug('web3: ', web3Obj)
	// debug('provider: ', provider)
	debug('New Web3 provider initiated')

	return provider
}

debug(`url: ${ETHEREUM_ENDPOINT_WS}`)

refreshProvider(web3_ws, ETHEREUM_ENDPOINT_WS)

module.exports = web3_ws
