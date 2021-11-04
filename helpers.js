

function assert(condition, message="Assertion failed") {

    if (!condition) {
        throw new Error(message);
    }
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

/*
* assumes workerIndices are sorted in ascending order
*
* */
function getWorkerEndIndex(workerIndices, startIndex, batchSize, nWorkersToProcess) {

	let size = Math.min(batchSize, nWorkersToProcess)
	let endIndex = startIndex + size - 1
	if (workerIndices[startIndex] + size - 1 !== workerIndices[endIndex]) {
		endIndex = startIndex
	}

	return endIndex
}

module.exports = {
	assert,
	getRandomInt,
	getWorkerEndIndex
}
