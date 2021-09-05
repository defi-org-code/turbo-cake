const colours = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        crimson: "\x1b[38m" // Scarlet
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        crimson: "\x1b[48m"
    }
}

class Logger {

	constructor(name) {
		this.name = name.toUpperCase()
	}

	debug(message) {
		console.log(colours.fg.crimson, `[${new Date().toISOString()}][${this.name}][DEBUG] ` + message)
	}

	info(message) {
		console.log(colours.fg.green, `[${new Date().toISOString()}][${this.name}][INFO] ` + message)
	}

	warning(message) {
		console.log(colours.fg.yellow, `[${new Date().toISOString()}][${this.name}][WARNING] ` + message)
	}

	error(message) {
		console.log(colours.fg.red, `[${new Date().toISOString()}][${this.name}][ERROR] ` + message)
	}

}

module.exports = {
	Logger
}
