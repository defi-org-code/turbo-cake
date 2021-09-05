
class Logger {

	constructor(name) {
		this.name = name.toUpperCase()
	}

	debug(message) {
		console.log(`[${new Date().toISOString()}][${this.name}][DEBUG] ` + message)
	}

	info(message) {
		console.log(`[${new Date().toISOString()}][${this.name}][INFO] ` + message)
	}

	warning(message) {
		console.log(`[${new Date().toISOString()}][${this.name}][WARNING] ` + message)
	}

	error(message) {
		console.log(`[${new Date().toISOString()}][${this.name}][ERROR] ` + message)
	}

}

module.exports = {
	Logger
}
