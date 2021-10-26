const Influx = require('./influx');
const {VERSION} = require('./core/params')
require('dotenv').config();


class Reporter {

	constructor(runningMode) {
		this.influxClient = new Influx('turbo-cake', VERSION);
		this.measurementPrefix = `${runningMode}.${process.env.BOT_ID}.`
	}

	async send(measurement, fields, tags={}) {
		this.influxClient.report(this.measurementPrefix + measurement, fields, tags)
	}
}


module.exports = {
	Reporter
}
