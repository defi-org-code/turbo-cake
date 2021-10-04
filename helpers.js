

function assert(condition, message="Assertion failed") {

    if (!condition) {
        throw new Error(message);
    }
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}


module.exports = {
	assert,
	getRandomInt
}
