
class TokenError extends Error {
	constructor(msg, ...params) {
		super(...params)

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, TokenError)
		}

		this.name = 'TokenError'
		this.message = msg
		this.date = new Date()
	}
}


class TransactionFailure extends Error {
	constructor(msg, ...params) {
		super(params)

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, TransactionFailure)
		}

		this.name = 'TransactionFailure'
		this.message = msg
		this.date = new Date()
	}
}


class InvalidTickerIndex extends Error {
	constructor(msg, ...params) {
		super(params)

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, InvalidTickerIndex)
		}

		this.name = 'InvalidTickerIndex'
		this.message = msg
		this.date = new Date()
	}
}


class GasError extends Error {
	constructor(msg, ...params) {
		super(params)

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, GasError)
		}

		this.name = 'GasError'
		this.message = msg
		this.date = new Date()
	}
}

class NotImplementedError extends Error {
	constructor(msg, ...params) {
		super(params)

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, NotImplementedError)
		}

		this.name = 'NotImplementedError'
		this.message = msg
	}
}

class FatalError extends Error {
	constructor(msg, ...params) {
		super(params)

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, FatalError)
		}

		this.name = 'FatalError'
		this.message = msg
		this.date = new Date()
	}
}

module.exports = {
	TokenError,
	TransactionFailure,
	InvalidTickerIndex,
	FatalError,
	GasError
}
