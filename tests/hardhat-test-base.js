const Strategy = require('../strategy/strategy')
const {
	POOL_ADDRESS,
	NFT_POSITION_MNG_ADDRESS
} = require('../strategy/params');

require('dotenv').config();
const {TokenError} =  require('../errors');
const BigNumber = require('bignumber.js');
const KeyEncryption = require('../keyEncryption');
const hre = require("hardhat");

const {	POOL_ABI, NFT_POSITION_MANGER_ABI, SWAP_ROUTER_ABI, WBTC_ABI, WETH_ABI} = require('./abis');
const {
	WBTC_WHALE_ADDR,
	WETH_WHALE_ADDR,
	SWAP_ROUTER_ADDR,
	WBTC_ADDR,
	WETH_ADDR
} = require('./params');

const BOT_ADDRESS = process.env.BOT_ADDRESS
const INDEX_RATIO = process.env.INDEX_RATIO
const WIN_LEN_PCT = process.env.WIN_LEN_PCT

function sleep (time) {
	return new Promise((resolve) => setTimeout(resolve, time));
}

async function main() {

	await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [BOT_ADDRESS]});
	await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [WBTC_WHALE_ADDR]});
	await hre.network.provider.request({method: "hardhat_impersonateAccount",params: [WETH_WHALE_ADDR]});

	await hre.network.provider.request({method: "hardhat_setBalance", params: [BOT_ADDRESS, "0x100000000000000000000"]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [WBTC_WHALE_ADDR, "0x100000000000000000000"]});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [WETH_WHALE_ADDR, "0x100000000000000000000"]});

	// ######################################################
	// get contracts
	// ######################################################
	const swapRouterContract = await new hre.web3.eth.Contract(SWAP_ROUTER_ABI, SWAP_ROUTER_ADDR);
	const nftContract = await new hre.web3.eth.Contract(NFT_POSITION_MANGER_ABI, NFT_POSITION_MNG_ADDRESS);
	const poolContract = await new hre.web3.eth.Contract(POOL_ABI, POOL_ADDRESS);

	const WBTCContract = await new hre.web3.eth.Contract(WBTC_ABI, WBTC_ADDR);
	const WETHContract = await new hre.web3.eth.Contract(WETH_ABI, WETH_ADDR);

	// ######################################################
	// get whale balances
	// ######################################################
	let wbtcWhaleBalance = await WBTCContract.methods.balanceOf(WBTC_WHALE_ADDR).call();
	let wethWhaleBalance = await WETHContract.methods.balanceOf(WETH_WHALE_ADDR).call();

	// ######################################################
	// transfer funds to bot
	// ######################################################
	await  WBTCContract.methods.transfer(BOT_ADDRESS, wbtcWhaleBalance).send({from: WBTC_WHALE_ADDR});
	await  WETHContract.methods.transfer(BOT_ADDRESS, wethWhaleBalance).send({from: WETH_WHALE_ADDR});

	// ######################################################
	// get bot balances
	// ######################################################
	let botWbtcBalance = await WBTCContract.methods.balanceOf(BOT_ADDRESS).call();
	let botWethBalance = await WETHContract.methods.balanceOf(BOT_ADDRESS).call();
	console.log(`botWbtcBalance=${botWbtcBalance}`);
	console.log(`botWethBalance=${botWethBalance}`);

	// ######################################################
	// grant approve
	// ######################################################
	await WBTCContract.methods.approve(SWAP_ROUTER_ADDR, botWbtcBalance).send({from: BOT_ADDRESS});
	await WETHContract.methods.approve(SWAP_ROUTER_ADDR, botWethBalance).send({from: BOT_ADDRESS});

	await WBTCContract.methods.approve(NFT_POSITION_MNG_ADDRESS, botWbtcBalance).send({from: BOT_ADDRESS});
	await WETHContract.methods.approve(NFT_POSITION_MNG_ADDRESS, botWethBalance).send({from: BOT_ADDRESS});

	await WBTCContract.methods.approve(POOL_ADDRESS, botWbtcBalance).send({from: BOT_ADDRESS});
	await WETHContract.methods.approve(POOL_ADDRESS, botWethBalance).send({from: BOT_ADDRESS});

	// ######################################################
	// swap
	// ######################################################
	// const amount0 = 1e8;
	// let swapOut = new BigNumber(amount0 / 16).multipliedBy(1e10).toString();
	// console.log(`swapOut=${swapOut}`);
	//
	// const slot0 = await poolContract.methods.slot0().call();
	// console.log(`slot0=${JSON.stringify(slot0)}`);
	//
	// await swapRouterContract.methods.exactOutputSingle(
	// 	[WBTC_ADDR, WETH_ADDR, 3000, BOT_ADDRESS, Date.now() + 3600,
	// 		swapOut, amount0*10,
	// 		"16350675961812804615485321449046016"])
	// 	.send({from: BOT_ADDRESS});

	// ######################################################
	// get bot balances
	// ######################################################
	botWbtcBalance = await WBTCContract.methods.balanceOf(BOT_ADDRESS).call();
	botWethBalance = await WETHContract.methods.balanceOf(BOT_ADDRESS).call();
	console.log(`botWbtcBalance=${botWbtcBalance}`);
	console.log(`botWethBalance=${botWethBalance}`);

	// const tick = 60 * Math.floor(slot0['tick'] / 60);
	// const tick_lower = tick - 60*10;
	// const tick_upper = tick + 60*10;
	// const amount0 = "223622";
	// const amount1 = "37388041075484";

	// await nftContract.methods.mint([WBTC_ADDR, WETH_ADDR, 3000, tick_lower, tick_upper, amount0, amount1, 0, 0, WBTC_WHALE_ADDR, Date.now() + 3600]).send({from: WBTC_WHALE_ADDR});

	const strategy = new Strategy(WIN_LEN_PCT, INDEX_RATIO);
	await strategy.start()

	botWbtcBalance = await WBTCContract.methods.balanceOf(BOT_ADDRESS).call();
	botWethBalance = await WETHContract.methods.balanceOf(BOT_ADDRESS).call();
	console.log(`--botWbtcBalance=${botWbtcBalance}`);
	console.log(`--botWethBalance=${botWethBalance}`);

	// ######################################################
	// swap
	// ######################################################
	const amount0 = 3000e8;
	let swapOut = new BigNumber(amount0).multipliedBy(1e10).toString();
	console.log(`swapOut=${swapOut}`);

	const slot0 = await poolContract.methods.slot0().call();
	console.log(`slot0=${JSON.stringify(slot0)}`);

	sleep(5000).then(async () => {
		botWbtcBalance = await WBTCContract.methods.balanceOf(BOT_ADDRESS).call();
		botWethBalance = await WETHContract.methods.balanceOf(BOT_ADDRESS).call();
		console.log(`--botWbtcBalance=${botWbtcBalance}`);
		console.log(`--botWethBalance=${botWethBalance}`);

		let slot0 = await poolContract.methods.slot0().call();
		console.log(`slot0=${JSON.stringify(slot0)}`);

		const res = await swapRouterContract.methods.exactOutputSingle(
			[WBTC_ADDR, WETH_ADDR, 3000, BOT_ADDRESS, Date.now() + 3600,
				swapOut, amount0,
				"3299437668851303944827891320173402"])
			.send({from: BOT_ADDRESS});

		console.log(`swap: res=${JSON.stringify(res)}`);

		botWbtcBalance = await WBTCContract.methods.balanceOf(BOT_ADDRESS).call();
		botWethBalance = await WETHContract.methods.balanceOf(BOT_ADDRESS).call();
		console.log(`--botWbtcBalance=${botWbtcBalance}`);
		console.log(`--botWethBalance=${botWethBalance}`);

		slot0 = await poolContract.methods.slot0().call();
		console.log(`slot0=${JSON.stringify(slot0)}`);

	});

	sleep(5000).then(async () => {
		botWbtcBalance = await WBTCContract.methods.balanceOf(BOT_ADDRESS).call();
		botWethBalance = await WETHContract.methods.balanceOf(BOT_ADDRESS).call();
		console.log(`--botWbtcBalance=${botWbtcBalance}`);
		console.log(`--botWethBalance=${botWethBalance}`);

		let slot0 = await poolContract.methods.slot0().call();
		console.log(`slot0=${JSON.stringify(slot0)}`);

		const res = await swapRouterContract.methods.exactOutputSingle(
			[WBTC_ADDR, WETH_ADDR, 3000, BOT_ADDRESS, Date.now() + 3600,
				swapOut, amount0,
				"3299437668851303944827891320173402"])
			.send({from: BOT_ADDRESS});

		console.log(`swap: res=${JSON.stringify(res)}`);

		botWbtcBalance = await WBTCContract.methods.balanceOf(BOT_ADDRESS).call();
		botWethBalance = await WETHContract.methods.balanceOf(BOT_ADDRESS).call();
		console.log(`--botWbtcBalance=${botWbtcBalance}`);
		console.log(`--botWethBalance=${botWethBalance}`);

		slot0 = await poolContract.methods.slot0().call();
		console.log(`slot0=${JSON.stringify(slot0)}`);

	});
}

main()
