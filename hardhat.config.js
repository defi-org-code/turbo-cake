require("@nomiclabs/hardhat-web3");
require("hardhat-gas-reporter");
require("hardhat-etherscan-abi");
const path = require('path');
const config = require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const {
    NFT_POSITION_MNG_ADDRESS,
} = require('./strategy/params');
const {TOKENS} = require('./abis');
const fetch = require("node-fetch");

async function fetchAbi(addr) {
    const etherscanAbiUrl =  `https://api.etherscan.io/api?module=contract&action=getabi&address=${addr}&apiKey=${process.env.ETHERSCAN_API_KEY}`
    const data = await fetch(etherscanAbiUrl).then(response => response.json());
    return JSON.parse(data.result);
}

task( "check-setup", "verify hardhat config", async (_, { network: network, web3, ethers: ethers }) => {
    const botAddress = "0x4bD047CA72fa05F0B89ad08FE5Ba5ccdC07DFFBF";
    const WBTC_WHALE_ADDR = "0xaF306BaD224F70D6E1971ba17D97c144cAB119E4";
    const WETH_WHALE_ADDR = "0xaae0633e15200bc9c50d45cd762477d268e126bd";

    await network.provider.request({method: "hardhat_impersonateAccount",params: [botAddress]});
    await network.provider.request({method: "hardhat_impersonateAccount",params: [WBTC_WHALE_ADDR]});
    await network.provider.request({method: "hardhat_impersonateAccount",params: [WETH_WHALE_ADDR]});


    let tokenId = 4;
    const nftPosMngAbi = await fetchAbi(NFT_POSITION_MNG_ADDRESS);
    const nftPositionMngContract =  new web3.eth.Contract(nftPosMngAbi, NFT_POSITION_MNG_ADDRESS);
    const wbtc = new web3.eth.Contract(TOKENS.WBTC.abi, TOKENS.WBTC.address);
    const weth = new web3.eth.Contract(TOKENS.WETH.abi, TOKENS.WETH.address);

    let position = await nftPositionMngContract.methods.positions(tokenId).call();
    console.log(`bot current position: ${JSON.stringify(position, null, 4)}\n`);
    let deadline = Date.now() + 11111;
    let liquidity = position['liquidity']; //"34399999543676";
    let wbtcBalance = await wbtc.methods.balanceOf(botAddress).call();
    let wethBalance = await weth.methods.balanceOf(botAddress).call();
    console.log(`bot current balance: WBTC ${JSON.stringify(wbtcBalance, null, 4)} WETH ${JSON.stringify(wethBalance, null, 4)}\n`);

    let callData = [];
    let data =  nftPositionMngContract.methods.decreaseLiquidity([tokenId, liquidity, 0, 0, deadline]).encodeABI();
    // console.log(`call data: ${JSON.stringify(data)}`);
    callData.push(data);
    let amount0Max = "3678668530781";
    let amount1Max = "2026051594659310190842762";
    data =  nftPositionMngContract.methods.collect([tokenId, botAddress, amount0Max, amount1Max]).encodeABI();
    callData.push(data);

    // let res = await nftPositionMngContract.methods.multicall(callData).send({from:botAddress, value:0});
    // // console.log(`DATATATATATATA: ${JSON.stringify(data)}`);
    // console.log(`res: ${JSON.stringify(res, null, 4)}`);
    // wbtcBalance = await wbtc.methods.balanceOf(botAddress).call();
    // wethBalance = await weth.methods.balanceOf(botAddress).call();
    // console.log(`bot current balance: WBTC ${JSON.stringify(wbtcBalance, null, 4)}
    //             WETH ${JSON.stringify(wethBalance, null, 4)}\n`);


    let wbtcWhaleBalance = await wbtc.methods.balanceOf(WBTC_WHALE_ADDR).call();
    let wethWhaleBalance = await weth.methods.balanceOf(WETH_WHALE_ADDR).call();
    await  wbtc.methods.transfer(botAddress, wbtcWhaleBalance).send({from: WBTC_WHALE_ADDR});
    await  weth.methods.transfer(botAddress, wethWhaleBalance).send({from: WETH_WHALE_ADDR});
    //
    wbtcBalance = await wbtc.methods.balanceOf(botAddress).call();
    wethBalance = await weth.methods.balanceOf(botAddress).call();
    console.log(`bot current balance: WBTC ${JSON.stringify(wbtcBalance, null, 4)}
                WETH ${JSON.stringify(wethBalance, null, 4)}\n`);

    let amount0Desired = "5467080";//"995106898";
    let amount1Desired = "3159046097094220";//"444361911669508228";
    // callData = [];
    // data = wbtc.methods.approve(NFT_POSITION_MNG_ADDRESS, amount0Desired).encodeABI();

    res = await wbtc.methods.approve(NFT_POSITION_MNG_ADDRESS, "9951068983678668530781").send({from:botAddress});
    console.log(JSON.stringify(res, null, 4));
    return;
    // callData.push(data);
    // data = weth.methods.approve(NFT_POSITION_MNG_ADDRESS, amount1Desired).encodeABI();
    res = await weth.methods.approve(NFT_POSITION_MNG_ADDRESS, amount1Desired).send({from:botAddress});
    console.log(JSON.stringify(res, null, 4));
    // callData.push(data);

    deadline = Date.now() + 11111;
    const mintParams = [
        TOKENS.WBTC.address,
        TOKENS.WETH.address,
        "3000", //fee
        "198720", //position["tickLower"] - 60,
        "202740", //parseInt(position["tickUpper"]) + 60,
        amount0Desired, //amount0Desired
        amount1Desired, //amount1Desired
        0, //amount0Min
        0, //amount1Min
        botAddress, //recipient
        deadline];

    console.log(mintParams);
    console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$");
    // return;

    // res = await nftPositionMngContract.methods.multicall(callData).send({from:botAddress, value:0});
    // console.log(`res: ${JSON.stringify(res, null, 4)}`);
    // return;


    // res = await nftPositionMngContract.methods.mint(mintParams).call({from:botAddress});
    // console.log(`res: ${JSON.stringify(res, null, 4)}`);
    // return;
    data =  nftPositionMngContract.methods.mint(mintParams).encodeABI();
    callData.push(data);
    res = await nftPositionMngContract.methods.multicall(callData).send({from:botAddress, value:0});
    // console.log(`DATATATATATATA: ${JSON.stringify(data)}`);
    console.log(`res: ${JSON.stringify(res, null, 4)}`);

    return;

    console.log(`network: ${network.name} `);
    console.log(`network config: \n ${JSON.stringify(network.config, null, 4)}`);
    console.log(await web3.eth.getAccounts());
    console.log(`current block: ${await web3.eth.getBlockNumber()}`);
    const POOL_ADDRESS = "0xCBCdF9626bC03E24f779434178A73a0B4bad62eD";
    const poolContract = await ethers.getVerifiedContractAt(POOL_ADDRESS);
    const token0Addr = web3.utils.toChecksumAddress(await poolContract.token0());
    const token0Contract = await ethers.getVerifiedContractAt(token0Addr);
    const token0Name = await token0Contract.name();
    const token0Decimals = await token0Contract.decimals();
    console.log(`Retrieved token info of "${token0Name}": decimals ${token0Decimals}, and address ${token0Addr}`);
});

module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            forking: {
                blockNumber: 12820712 , // 12760970
                url: `https://eth-mainnet.alchemyapi.io/v2/${config.parsed.ALCHEMY_API_KEY}`,
				// accounts: [{
				// 	privateKey: "0x1a2274e01c3d49ea3167d167149aa1e3c8a9acde453262b5d45d80aba218a5af",
				// 	balance: "100000000000",
				// }],
				// accounts: [["0x1a2274e01c3d49ea3167d167149aa1e3c8a9acde453262b5d45d80aba218a5af", "100000"]]
            },
            chainId: 1
            // blockGasLimit: 12e6,
            // accounts: {
            //     accountsBalance: "1e12",
            // },
        },
    },
    paths: {
        sources: "./contracts",
        tests: "./tests",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    etherscan: {
        apiKey: `${config.parsed.ETHERSCAN_API_KEY}`
    }
}


