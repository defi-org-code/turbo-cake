const Influx = require('./influx');
const {VERSION} = require('./strategy/params')


class Reporter {

	constructor(runningMode) {
		this.influxClient = new Influx('TurboCake', VERSION);
		this.runningMode = runningMode
	}

	async send() {
		this.influxClient.report(`${this.runningMode}.${VERSION}`, {'test': 1}, {})
	}
}


module.exports = {
	Reporter
}
