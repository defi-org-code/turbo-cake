const crypto = require('crypto');
const fs = require('fs');
const prompts = require('prompts');
require('dotenv').config();

const outputEncoding = "utf8";
const algorithm = "aes-256-ctr";
const encoding = "base64";
const hash = "sha256";


class KeyEncryption {

	constructor() {
		this.configFileName = `${__dirname}/.config.json`;
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
		const password = process.env.PASSWORD;

		if (!password || !password.length) throw new Error("invalid password");
		return this.decrypt(epk, password);
	}

	async _saveToConfig(encrypted) {

		fs.writeFile(this.configFileName, encrypted, function (err) {
			if (err) return console.log(err);
			console.log('epk was written to file');
		});
	}

	async encrypt(text, password) {
		const key = crypto.createHash(hash).update(String(password)).digest();
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv(algorithm, key, iv);
		let result = cipher.update(text, outputEncoding, encoding);
		result += cipher.final(encoding);
		return `${iv.toString(encoding)}:${result}`;
	}

	async decrypt(text, password) {
		const key = crypto.createHash(hash).update(String(password)).digest();
		const [ivText, encrypted] = text.split(":");
		const iv = Buffer.from(ivText, encoding);
		const decipher = crypto.createDecipheriv(algorithm, key, iv);
		let result = decipher.update(encrypted, encoding, outputEncoding);
		result += decipher.final(outputEncoding);
		return result;
	}

}

module.exports = KeyEncryption
