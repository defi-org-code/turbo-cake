const fetch = require('node-fetch');
const {RunningMode} = require("./config");
require('dotenv').config();

class Notifications {
	constructor(runningMode) {
		this.runningMode = runningMode;
	}

	sendDiscord(msg) {

		console.log(msg);

		if (this.runningMode === RunningMode.DEV || (process.env.MUTE_DISCORD==="true")) {
			return
		}

		fetch(process.env.DISCORD_WEB_HOOK, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json; charset=UTF-8',
			},
			body: JSON.stringify({
				"content": `[BOT_ID ${process.env.BOT_ID}]: ${msg}`,
				"username": 'turbo-cake'
			}),
		})
	}

}

module.exports = Notifications

