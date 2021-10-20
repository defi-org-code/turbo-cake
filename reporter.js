const graphite = require('graphite');
const {VERSION, GRAPHITE_IP} = require('./core/params')
require('dotenv').config();

const {Logger} = require('./logger')
const logger = new Logger('reporter')

class Reporter {

	constructor(runningMode) {
		// this.graphiteClient = graphite.createClient(`plaintext://${GRAPHITE_IP}:2003`)
		this.runningMode = runningMode
		this.prefix = `turbo-cake.${this.runningMode}.BOT-ID=${process.env.BOT_ID}.${VERSION}`
	}

	addPrefix(_metrics, prefix) {

		let metrics = {}

		for (const key of Object.keys(_metrics)) {
			metrics[`${prefix}.${key}`] = _metrics[key]
		}

		return metrics
	}

	send(metrics) {
		const graphiteClient = graphite.createClient(`plaintext://${GRAPHITE_IP}:2003`)
		graphiteClient.write(this.addPrefix(metrics, this.prefix), Date.now(), function(err) {
		  // if err is null, your data was sent to graphite!
		  if (err !== null) {
			  console.log(`error sending data to graphite ${err}`)
		  }
		});

		graphiteClient.end()
	}
}


module.exports = {
	Reporter
}
