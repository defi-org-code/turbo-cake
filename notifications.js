const fetch = require('node-fetch');
require('dotenv').config();


class Notifications {
	constructor() {
	}

	sendDiscord(msg) {

		if (process.env.BOT_ID === "-1") {
			console.log(msg);
			return
		}

		fetch(process.env.DISCORD_WEB_HOOK, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json; charset=UTF-8',
			},
			body: JSON.stringify({
				"content": `[BOT_ID ${process.env.BOT_ID}]: ${msg}`
			}),
		}).then((response) => {
			console.log(response);
		});
	}

}

module.exports = Notifications

