const {InfluxDB} = require('@influxdata/influxdb-client')
const os = require("os");
const hostname = os.hostname();
const org = 'xorbs'

const {Point} = require('@influxdata/influxdb-client')
require('dotenv').config();


class Influx {

	constructor(bucket, version) {

		this.client = new InfluxDB({url: process.env.INFLUX_URL, token: process.env.INFLUX_TOKEN})
		this.bucket = bucket
		this.version = version

	}

	writePoint(measurementName, fields, tags= {}) {

		const writeApi = this.client.getWriteApi(org, this.bucket);
		writeApi.useDefaultTags({hostname: hostname, version: this.version, botId: process.env.BOT_ID});

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


// new Influx('UniV3Bot', '1.0.0').writePoint('nameTest2', {fieldTest2: '6'}, {tokenId: '1'});

module.exports = Influx;

