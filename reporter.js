const Influx = require('./influx');
const {VERSION} = require('./core/params')
const env = require('dotenv').config();


class Reporter {

	constructor(runningMode) {
		this.influxClient = new Influx('TurboCake', VERSION);
		this.prefix = `${runningMode}.${process.env.BOT_ID}.${VERSION}`
	}

	async send(fields, tags={}) {
		this.influxClient.report(this.prefix, fields, tags)
	}
}


module.exports = {
	Reporter
}
