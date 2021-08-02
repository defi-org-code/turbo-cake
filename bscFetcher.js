

async function getPastEventsLoop(contract, eventName, filterObj, nBlocks, endBlock, chunkSize=5000) {

	let events = []
	let _chunkSize = chunkSize
	let _toBlock = endBlock
	let _fromBlock= Math.max(endBlock-nBlocks+1, endBlock-chunkSize+1);
	const exitBlock = endBlock - nBlocks + 1

	console.log(eventName, filterObj, nBlocks, endBlock, chunkSize, _fromBlock, _toBlock)

	while (true) {

		try {

			events = events.concat(await contract.getPastEvents(eventName, {filter: filterObj, fromBlock: _fromBlock, toBlock: _toBlock}))

			if (_fromBlock <= exitBlock) {
				return events
			}

			_toBlock = _fromBlock - 1
			_fromBlock = Math.max(exitBlock, _fromBlock-_chunkSize)
			_chunkSize = chunkSize

		} catch (e) {
			console.log(`${e}`)
			_chunkSize = Math.max(Math.floor(chunkSize/2) , 1)
		}

	}
}


module.exports = {
	getPastEventsLoop
}
