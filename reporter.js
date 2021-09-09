const Influx = require('./influx');
const {VERSION} = require('./strategy/params')


class Reporter {

	constructor(runningMode) {
		this.influxClient = new Influx('TurboCake', VERSION);
		this.runningMode = runningMode
	}

	async send(fields, tags={}) {
		this.influxClient.report(`${this.runningMode}.${VERSION}`, fields, tags)
	}
}


module.exports = {
	Reporter
}
