const {InfluxDB} = require('@influxdata/influxdb-client')
const os = require("os");
const hostname = os.hostname();
const org = 'Orbs'

const {Point} = require('@influxdata/influxdb-client')
require('dotenv').config();


class Influx {

	// TODO: fixme add bot addr
	constructor(bucket, version) {

		this.client = new InfluxDB({url: process.env.INFLUX_URL, token: process.env.INFLUX_TOKEN})
		this.bucket = bucket
		this.version = version
	}

	report(measurementName, fields, tags= {}) {

		const writeApi = this.client.getWriteApi(org, this.bucket);
		writeApi.useDefaultTags({hostname: hostname, version: this.version});

		const point = new Point(measurementName);

		for (const [field, value] of Object.entries(fields)) {
			console.log(field, value);
			point.floatField(field, value);
		}

		for (const [tag, value] of Object.entries(tags)) {
			console.log(tag, value);
			point.tag(tag, value);
		}

		writeApi.writePoint(point);
		writeApi.close()
			.then(() => {
				console.log('WRITE FINISHED')
			})
	}

}


module.exports = Influx;

