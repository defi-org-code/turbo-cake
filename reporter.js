// const Influx = require('./influx');
const graphite = require('graphite');
const {VERSION, GRAPHITE_IP} = require('./strategy/params')


class Reporter {

	constructor(runningMode) {
		// this.influxClient = new Influx('TurboCake', VERSION);
		this.graphiteClient = graphite.createClient(`plaintext://${GRAPHITE_IP}:2003/`);
		this.runningMode = runningMode
	}

	send(metrics) {
		return
		// this.influxClient.report(`${this.runningMode}.${VERSION}`, fields, tags)
		const tags = {'name': `turbo-cake`, 'version': VERSION};
		// this.graphiteClient.writeTagged(metrics, tags, function(err) {
		this.graphiteClient.write(metrics, function(err) {
		  // if err is null, your data was sent to graphite!
		});
	}
}


module.exports = {
	Reporter
}
