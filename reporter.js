const Influx = require('./influx');
const graphite = require('graphite');
const {VERSION, GRAPHITE_IP} = require('./strategy/params')

class Reporter {

	constructor(runningMode) {
		// this.influxClient = new Influx('TurboCake', VERSION);
		this.graphiteClient = graphite.createClient(`plaintext://${GRAPHITE_IP}:2003`)
		this.runningMode = runningMode
		this.prefix = `turbo-cake.${this.runningMode}.${VERSION}`
	}

	addPrefix(_metrics, prefix) {

		let metrics = {}

		for (const key of Object.keys(_metrics)) {
			metrics[`${prefix}.${key}`] = _metrics[key]
		}

		return metrics
	}

	send(metrics) {
		this.graphiteClient.write(this.addPrefix(metrics, this.prefix), function(err) {
		  // if err is null, your data was sent to graphite!
		  console.log(err)
		});
	}
}


module.exports = {
	Reporter
}
