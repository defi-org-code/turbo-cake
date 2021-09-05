
const EXCEED_MAX_ERROR = 'exceed maximum block range'
const {Logger} = require('./logger')
const logger = new Logger('bsc-fetcher')


async function getPastEventsLoop(contract, eventName, nBlocks, endBlock, chunkSize=5000, filterObj=null) {

	if (nBlocks === 0) {
		return []
	}

	let events = []
	let _chunkSize = chunkSize
	let _toBlock = endBlock
	let _fromBlock= Math.max(endBlock-nBlocks+1, endBlock-chunkSize+1);
	const exitBlock = endBlock - nBlocks + 1
	let retry = 0

	while (true) {

		try {
			logger.info(`fromBlock=${_fromBlock}, toBlock=${_toBlock}`)
			events = events.concat(await contract.getPastEvents(eventName, {filter: filterObj, fromBlock: _fromBlock, toBlock: _toBlock}))

			console.log(events)

		} catch (e) {

			if (e.message.includes(EXCEED_MAX_ERROR)) {
				_chunkSize = Math.max(Math.floor(_chunkSize/2) , 1)
				logger.info(`${e}: setting chunkSize to ${_chunkSize}`)
			}
			else {
				if (retry < 10) {
					retry += 1
					logger.info(`[ERROR] failed to fetch data: ${e.message}, retry ${retry} ...`)
					continue

				} else {
					logger.info(`[ERROR] failed to fetch data: ${e.message}, skipping range fromBlock=${_fromBlock} toBlock=${_toBlock} ...`)
				}
			}

		}

		retry = 0
		_toBlock = _fromBlock - 1
		_fromBlock = Math.max(exitBlock, _fromBlock-_chunkSize)
		_chunkSize = chunkSize

		if (_fromBlock <= exitBlock) {
			return events
		}

	}
}


module.exports = {
	getPastEventsLoop
}
