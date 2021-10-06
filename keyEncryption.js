const crypto = require('crypto');
const fs = require('fs');
const prompts = require('prompts');
const openpgp = require('openpgp');

const outputEncoding = "utf8";
const algorithm = "aes-256-ctr";
const encoding = "base64";
const hash = "sha256";


class KeyEncryption {

	constructor(configFileInfo) {
		this.configFileInfo = configFileInfo;
	}

	async loadKey() {
		if (fs.existsSync(this.configFileInfo.name)) {
			return await this.readPrivateKey();
		}
		else {
			// return await this.writePrivateKey();

			throw Error(".config file for privateKey not found")
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
		console.log("saved to", this.configFileInfo.name);
		return privateKey
	}


	async _saveToConfig(encrypted) {

		fs.writeFile(this.configFileInfo.name, encrypted, function (err) {
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




	async readPrivateKey() {
		const epk = fs.readFileSync(this.configFileInfo.name, {'encoding': 'utf8'});

		if (this.configFileInfo.encryptionType === "gpg") {
			return await this.decryptGpg(epk)

		} else {
			return await this.decrypt(epk)
		}
	}

	async decrypt(encryptedData) {
		const password = process.env.PASSWORD;
		if (!password || !password.length) throw new Error("invalid password");

		const key = crypto.createHash(hash).update(String(password)).digest();
		const [ivText, encrypted] = encryptedData.split(":");
		const iv = Buffer.from(ivText, encoding);
		const decipher = crypto.createDecipheriv(algorithm, key, iv);
		let result = decipher.update(encrypted, encoding, outputEncoding);
		result += decipher.final(outputEncoding);
		return result;
	}


	async decryptGpg(encryptedData) {
		let password;
		const input = await prompts({
			type: "password",
			name: "password",
			message: "password",
		});
		password = input.password;
		if (!password || !password.length) throw new Error("invalid password");

		const decrypted = await openpgp.decrypt({
			message: await openpgp.readMessage({armoredMessage: encryptedData}),
			passwords: password,
			format: 'utf8'
		})
		return decrypted.data.trim();
	}

}

module.exports = KeyEncryption
