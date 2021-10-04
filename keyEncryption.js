const crypto = require('crypto');
const fs = require('fs');
const prompts = require('prompts');
const openpgp = require('openpgp');

const outputEncoding = "utf8";
const algorithm = "aes-256-ctr";
const encoding = "base64";
const hash = "sha256";


class KeyEncryption {

	constructor() {
		this.configFileName = `${__dirname}/temp_pk3.gpg`; // .config.json`;
	}

	async loadKey() {
		if (fs.existsSync(this.configFileName)) {
			return await this.readPrivateKey();
		}
		else {
			return await this.writePrivateKey();
		}
	}

	async writePrivateKey() {
		const { privateKey, password } = await prompts([
			{
				type: "text",
				name: "privateKey",
				message: "private key:",
			},
			{
				type: "password",
				name: "password",
				message: "password:",
			},
		]);
		await this._saveToConfig(await this.encrypt(privateKey, password));
		console.log("saved to", this.configFileName);
		return privateKey
	}

	async readPrivateKey() {
		const epk = fs.readFileSync(this.configFileName, {'encoding': 'utf8'});
		let password = process.env.PASSWORD;

		if (!password || !password.length) {
			const input = await prompts({
						type: "password",
						name: "password",
						message: "password",
					});
			password = input.password;
			if (!password || !password.length) throw new Error("invalid password");
		}
		return this.decrypt(epk, password);
	}

	async _saveToConfig(encrypted) {

		fs.writeFile(this.configFileName, encrypted, function (err) {
			if (err) return console.log(err);
			console.log('epk was written to file');
		});
	}

	async encrypt(text, password) {
		const encrypted = await openpgp.encrypt({
			message: await openpgp.createMessage({ text: text }), // input as Message object
			format: "armored",
			passwords: password,
		});

		return encrypted;
	}

	async decrypt(encryptedData, password) {

		const decrypted = await openpgp.decrypt({
			message: await openpgp.readMessage({armoredMessage: encryptedData}),
			passwords: password,
			format: 'utf8'
		})
		return decrypted.data;
	}

}

module.exports = KeyEncryption
