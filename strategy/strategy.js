const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const {SMARTCHEF_FACTORY_ADDRESS, VERSION} = require('./params');
const {SMARTCHEF_FACTORY_ABI} = require('../abis');

require('dotenv').config();
const {TokenError, TransactionFailure, InvalidTickerIndex, FatalError, GasError} =  require('../errors');
const fetch = require("node-fetch");
const TxManager = require('./txManager')
const {getPastEventsLoop} = require('../bscFetcher')

// const subscribeEvent = require('../ws/subscriptions');
const KeyEncryption = require('../keyEncryption');
const redis = require("redis");
const Influx = require('../influx');

BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9});

// const {web3} = require("hardhat");
const web3 = new Web3(process.env.ENDPOINT_HTTPS);
const BOT_ADDRESS = process.env.BOT_ADDRESS

const Binance = require('node-binance-api');

//
// let web3;
// console.log('PROD: ', PRODUCTION)
// if (PRODUCTION) {
// 	web3 = new Web3(process.env.ETHEREUM_HTTPS);
// 	console.log('1. PROD: ', PRODUCTION)
//
// } else {
// 	web3 = require("hardhat");
// 	console.log('2. PROD: ', PRODUCTION)
// }


const debug = (...messages) => console.log(...messages);


class Strategy extends TxManager {

	SEC_PER_HOUR = 3600;
	AVG_BLOCK_SEC = 3;
	SECONDS_PER_DAY = this.SEC_PER_HOUR * 24;
	BLOCKS_PER_DAY = this.SECONDS_PER_DAY / this.AVG_BLOCK_SEC;
	BLOCKS_PER_YEAR = this.BLOCKS_PER_DAY * 365;

	PAST_EVENTS_N_DAYS = 10;
	PAST_EVENTS_N_BLOCKS = Math.floor(this.PAST_EVENTS_N_DAYS * this.BLOCKS_PER_DAY);

	constructor() {
		super(web3);

		this.deadline = Date.now();

		this.txFailureCnt = 0;

		this.account = null;
		this.redisClient = null;

		this.prevUpdateTime = Date.now() //- MIN_SEC_BETWEEN_REBALANCE * 1000;

		this.influxClient = new Influx('TurboCake', VERSION);

		this.binance = new Binance().options({
			APIKEY: process.env.BINANCE_KEY,
			APISECRET: process.env.BINANCE_SECRET
		});
	}

	getContract(contractAbi, contractAddress) {
		return new web3.eth.Contract(contractAbi, contractAddress);
	}

	async fetchAbi(addr) {
		const etherscanAbiUrl =  `https://api.bscscan.io/api?module=contract&action=getabi&address=${addr}&apiKey=${process.env.ETHERSCAN_API_KEY}`
		const data = await fetch(etherscanAbiUrl).then(response => response.json());
		return JSON.parse(data.result);
	}

	redisInit() {

		this.redisClient = redis.createClient(); // TODO: handle redis errors

		this.redisClient.on("error", function(error) {
			console.error(error);
			throw new FatalError(`fatal redis error: ${error}`);
		});

		this.redisClient.on("ready", function() {
			debug('redis ready')
		});

	}

	async init() {

		this.redisInit();

		// if (PRODUCTION === true) {
		//
		// 	this.redisClient.get(`stopExecution${process.env.BOT_ID}`, (err, reply) => {
		//
		// 		if (err) throw err;
		// 		if (reply === 'true') {
		// 			throw Error(`stop execution flag is on`);
		// 		}
		// 	});
		// }

		this.account = web3.eth.accounts.privateKeyToAccount(await new KeyEncryption().loadKey());
		debug(`account address: ${this.account.address}`);

		web3.eth.defaultAccount = BOT_ADDRESS;

		this.smartchefFactoryContract = this.getContract(SMARTCHEF_FACTORY_ABI, SMARTCHEF_FACTORY_ADDRESS);
		await this.fetchPools();

	}

	async fetchPools() {

		await getPastEventsLoop(this.smartchefFactoryContract, 'NewSmartChefContract', this.PAST_EVENTS_N_BLOCKS, await web3.eth.getBlockNumber());

	}

	changePct(start, end) {
		return new BigNumber(100).multipliedBy(new BigNumber(end).div(new BigNumber(start)) - new BigNumber(1));
	}

	updateDeadline() {
		this.deadline = Date.now() + DEADLINE_SEC;
	}

	getPositionStartInToken0() {

		this.redisClient.hgetall('positionStart', (err, reply) => {

			if (err) throw err;
			this.positionStart= reply;
			debug(`positionStart=${JSON.stringify(reply)}`);

			this.positionStartInToken0 = this.totalAmountInToken0(this.positionStart['amount0'], this.positionStart['amount1'],
				this.positionStart['price'])

			debug(`positionStartInToken0=${this.positionStartInToken0}`);

		});

	}

	setPositionStartInToken0() {

		// TODO: get amount0, amount1, price
		this.redisClient.hmset('positionStart', {'amount0': amount0, 'amount1': amount1, 'price': price});
		this.getPositionStartInToken0();
	}

	async positionStats() {

		let res;

		const blockNumber = await web3.eth.getBlockNumber();
		const price = this.lastPrice;

		if ((this.position !== null) && this.position['liquidity'] !== '0') {
			debug(`================================================`);
			console.debug(`bot ${process.env.BOT_ID} pid ${process.pid}`);

			const ticker = await this.binance.prices('WBTCETH');

			const normPrice = price / (10 ** (this.token1Decimals - this.token0Decimals));

			if (!Object.keys(this.positionStart).length) {

				await this.getTokenStartValues();

				this.influxClient.writePoint('tokenStats', {
					'ping': 1,
					'price': normPrice,
					'binancePrice': ticker.WBTCETH
				});

				return
			}

			// #########################################################
			// Decrease call
			res = await this.nftPositionMngContract.methods.decreaseLiquidity([this.tokens[this.tokens.length - 1], this.position['liquidity'], 0, 0, this.deadline]).call({from: BOT_ADDRESS});
			console.log(`decrease call res: ${JSON.stringify(res)}`);

			const positionDecreaseValueInToken0 = this.totalAmountInToken0(res['amount0'], res['amount1'], price);

			// #########################################################
			// Collect call
			const amount0 = new BigNumber(10).multipliedBy(this.token0InitBalance).toString();
			const amount1 = new BigNumber(10).multipliedBy(this.token1InitBalance).toString();

			res = await this.nftPositionMngContract.methods.collect([this.tokens[this.tokens.length-1], BOT_ADDRESS, amount0, amount1]).call({from: BOT_ADDRESS});
			debug(`collect call res: ${JSON.stringify(res)}`);

			const positionCollectValueInToken0 = this.totalAmountInToken0(res['amount0'], res['amount1'], price);

			const currPositionValue = positionDecreaseValueInToken0.plus(positionCollectValueInToken0);

			// #########################################################
			const hodlingValue = this.totalAmountInToken0(this.positionStart['amount0'], this.positionStart['amount1'], price);

			debug(`hodlingValue: ${hodlingValue}, positionDecreaseValueInToken0: ${positionDecreaseValueInToken0}, positionCollectValueInToken0=${positionCollectValueInToken0},
			total: ${currPositionValue}`);

			debug(`positionStart: ${JSON.stringify(this.positionStart)}`);

			// change in position
			// const positionVsHoldingPct = this.changePct(currPositionValue, hodlingValue);
			const HoldingVsStartPct = this.changePct(this.positionStartInToken0, hodlingValue);
			const CurrVsStartPosition = this.changePct(this.positionStartInToken0, currPositionValue);
			const il = this.changePct(hodlingValue, positionDecreaseValueInToken0);
			const CurrPositionVsHoldingPct = this.changePct(hodlingValue, currPositionValue);
			const apr = CurrPositionVsHoldingPct / (blockNumber - this.positionStart['blockNumber']) * this.BLOCKS_PER_YEAR;

			debug(`CurrVsStartPosition=${CurrVsStartPosition}, HoldingVsStartPct=${HoldingVsStartPct}`);
			debug(`CurrPositionVsHoldingPct=${CurrPositionVsHoldingPct}, il=${il}`);
			debug(`estimated APR = ${apr}`);
			debug(`================================================`);

			this.influxClient.writePoint('tokenStats', {
				'ping': 1,
				'apr': apr,
				'CurrPositionVsHoldingPct': CurrPositionVsHoldingPct.toNumber(),
				'price': normPrice,
				'il': il.toNumber(),
				'binancePrice': ticker.WBTCETH
			}, {tokenId: this.tokens[this.tokens.length-1]});
		}
	}

	async approveMax() {
		const totalAmounts = await this.getTotalAmounts();
		const totalApproveToken0 = totalAmounts[0].multipliedBy(APPROVE_MULT).integerValue().toString();
		const totalApproveToken1 = totalAmounts[1].multipliedBy(APPROVE_MULT).integerValue().toString();

		const allowanceToken0 = await this.token0Contract.methods.allowance(this.account.address, this.nftPositionMngContract.options.address).call();
		const allowanceToken1 = await this.token1Contract.methods.allowance(this.account.address, this.nftPositionMngContract.options.address).call();

		debug(`approveMax: totalAmounts=${totalAmounts}, allowanceToken0=${allowanceToken0}, allowanceToken1=${allowanceToken1}`);

		if (new BigNumber(allowanceToken0).isLessThan(totalAmounts[0])) {
			this.txState = this.TX_STATE.PENDING;

			let encodedTx = this.token0Contract.methods.approve(this.nftPositionMngContract.options.address, totalApproveToken0).encodeABI();
			await this.sendSignedTx(this, encodedTx, this.token0Contract.options.address);
		}

		if (new BigNumber(allowanceToken1).isLessThan(totalAmounts[1])) {
			this.txState = this.TX_STATE.PENDING;

			let encodedTx = this.token1Contract.methods.approve(this.nftPositionMngContract.options.address, totalApproveToken1).encodeABI();
			await this.sendSignedTx(this, encodedTx, this.token1Contract.options.address);
		}
	}

	async onTxFailure() {

		this.notif.sendDiscord(`failed to send transaction retry #${this.txFailureCnt}`);

		await this.setPosition();
		await this.getTokenStartValues();

		this.txFailureCnt += 1;
		this.txCnt -= 1;

		if (this.txCnt === 0) {
			this.txState = this.TX_STATE.IDLE;
		}

		if (this.txFailureCnt >= MAX_TX_FAILURES) {
			throw new FatalError(`too many retries to send transaction (${this.txFailureCnt})`);
		}

		this.txState = this.TX_STATE.IDLE;
	}

	async onTxSuccess(...params) {
		debug(`onTxSuccess: ${params}`);

		// TODO: check transaction, update state when tx change state from pending to success
		await this.setPosition();
		await this.getTokenStartValues();

		this.txCnt -= 1;

		if (this.txCnt === 0) {
			this.txState = this.TX_STATE.IDLE;
		}
	}

	rebalanceValidate() {

		const rebalanceTimeDiff = (Date.now() - this.prevUpdateTime) / 1000;

		if (rebalanceTimeDiff < MIN_SEC_BETWEEN_REBALANCE) {
			throw new FatalError(`rebalance frequency is too high (rebalanceTimeDiff=${rebalanceTimeDiff} seconds)`);
		}

		this.prevUpdateTime = Date.now();

	}

	async start() {

		try {
			await this.init();
			process.exit() // TODO: remove me

		} catch (e) {

			if (e instanceof TokenError) {
				debug(`failed to init strategy`);
				this.beforeExit(e);
			}

			else if (e instanceof GasError) {
				this.notif.sendDiscord(`${e} pending to gas decrease : ${e.message}`);
				this.txState = this.TX_STATE.HIGH_GAS;
			}

			else {
				debug(`unhandled error`);
				debug(typeof e)
				this.beforeExit(e);
			}
		}

		// TODO: for low frequency swap polls set timer instead
		setInterval(() => this.run(), 1000);
		setInterval(() => this.positionStats(), 60000);
	}

	async validTxState() {

		if (this.txState === this.TX_STATE.HIGH_GAS) {

			if (await this.gasExceedsMax()) {
				// TODO: send notification every x seconds
				return false;
			}

			this.txState = this.TX_STATE.IDLE;
			return true;
		}

		// TODO: alert if txState not in idle for more than X seconds
		return this.txState === this.TX_STATE.IDLE;
	}

	beforeExit(e) {

		// this.redisClient.set(`stopExecution${process.env.BOT_ID}`, true, (err, reply) => {
		// 	if (err) throw err;
		// 	console.log(reply);
		// });

		this.notif.sendDiscord(`Terminating process: ${e}`);
		debug(e.stack);
		process.exit();
	}

	async run() {

		try {

			console.log(`this.txState=${this.txState}`);

			if (!await this.validTxState()) {
				return
			}

			await this.fetchLastPrice();
			// await this.safeUpdateLastPrice();

			const tickerIndices = await this.calcTickerIndices();

			console.log(`tickerIndices=${tickerIndices}`);

			if (this.rebalancePosition(tickerIndices)) {

				debug(`position: ${this.position}`);

				this.txState = this.TX_STATE.PENDING;
				this.updateDeadline();

				let to = this.nftPositionMngContract.options.address;
				let encodedTx;

				const allowanceToken0 = await this.token0Contract.methods.allowance(this.account.address, this.nftPositionMngContract.options.address).call();
				const allowanceToken1 = await this.token1Contract.methods.allowance(this.account.address, this.nftPositionMngContract.options.address).call();
				debug(`allowanceToken0=${allowanceToken0}, allowanceToken1=${allowanceToken1}`);

				const token0Balance = await this.token0Contract.methods.balanceOf(BOT_ADDRESS).call();
				const token1Balance = await this.token1Contract.methods.balanceOf(BOT_ADDRESS).call();

				debug(`token0Balance=${token0Balance}, token1Balance=${token1Balance}`);

				if (this.position !== null) {

					debug(`withdraw`);
					encodedTx = this.withdraw();

				} else {

					debug(`mint`);
					await this.updateMintAmount();

					if ((this.mintAmount0.integerValue().toString() === '0') || (this.mintAmount1.integerValue().toString() === '0')) {
						this.beforeExit(new FatalError(`zero amount, can not mint new positions: (mintAmount0=${this.mintAmount0}, mintAmount1=${this.mintAmount1})`));
					}

					encodedTx = this.mint(tickerIndices);
					this.rebalanceValidate();

				}

				await this.sendSignedTx(this, encodedTx, to);
			}

		} catch(e) {
			// TODO: web provider rate limit support
			debug(e)

			if (e instanceof TransactionFailure) {
				await this.onTxFailure();
			}

			else if (e instanceof GasError) {
				this.notif.sendDiscord(`${e} pending to gas decrease : ${e.message}`);
				this.txState = this.TX_STATE.HIGH_GAS;
			}

			else if (e instanceof InvalidTickerIndex) {
				this.beforeExit(e);
			}

			else if (e instanceof FatalError) {
				this.beforeExit(e);
			}

			else {
				debug(`--> ${e}`);
				if ('status' in e) {
					debug('--status: ', e.status)
				}
				if ('message' in e) {
					debug('--message: ', e.message)
				}

				this.beforeExit(e);
			}

			console.log(e)
		}
	}
}


module.exports = Strategy

