
const EXCEED_MAX_ERROR = 'Returned error: exceed maximum block range: 5000'

async function getPastEventsLoop(contract, eventName, nBlocks, endBlock, chunkSize=5000, filterObj=null) {

	let events = []
	let _chunkSize = chunkSize
	let _toBlock = endBlock
	let _fromBlock= Math.max(endBlock-nBlocks+1, endBlock-chunkSize+1);
	const exitBlock = endBlock - nBlocks + 1

	while (true) {

		try {

			events = events.concat(await contract.getPastEvents(eventName, {filter: filterObj, fromBlock: _fromBlock, toBlock: _toBlock}))

			console.log(events)

		} catch (e) {

			if (e.message === EXCEED_MAX_ERROR) {
				_chunkSize = Math.max(Math.floor(_chunkSize/2) , 1)
				console.log(`${e}: setting chunkSize to ${_chunkSize}`)
			}
			else {
				console.log(`unhandled error: ${e.message}`)
			}

		}

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
