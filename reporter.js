const Influx = require('./influx');
const graphite = require('graphite');
const {VERSION, GRAPHITE_IP} = require('./strategy/params')

class Reporter {

	constructor(runningMode) {
		// this.influxClient = new Influx('TurboCake', VERSION);
		this.graphiteClient = graphite.createClient(`http://${GRAPHITE_IP}:2003`);
		this.runningMode = runningMode
		this.prefix = `turbo-cake.${this.runningMode}.${VERSION.replace('.', '_')}`
		console.log(this.graphiteClient)
	}

	addPrefix(_metrics, prefix) {

		let metrics = {}

		for (const key of Object.keys(_metrics)) {
			metrics[`${prefix}.${key}`] = _metrics[key]
		}

		return metrics
	}

	send(metrics) {
		console.log(metrics)
		// this.influxClient.report(`${this.runningMode}.${VERSION}`, fields, tags)
		// const tags = {'name': `turbo-cake`, 'version': VERSION};
		// this.graphiteClient.writeTagged(metrics, tags, function(err) {
		console.log(this.addPrefix(metrics, this.prefix))

		this.graphiteClient.write(this.addPrefix(metrics, this.prefix), function(err) {
		  // if err is null, your data was sent to graphite!
		  console.log(err)
		});
	}
}


module.exports = {
	Reporter
}
