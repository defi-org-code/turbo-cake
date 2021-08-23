const Web3 = require('web3')
const BigNumber = require('bignumber.js')
const fetch = require("node-fetch")

require('dotenv').config()

BigNumber.config({POW_PRECISION: 100, EXPONENTIAL_AT: 1e+9})

BSC_ENDPOINT = 'https://long-thrumming-dream.bsc.quiknode.pro/4361da560bd47300da588fc1ec5ea1c2ba05891f/'
BSCSCAN_API_KEY="9QIMBTKE5W6FRW5PR3QXK4I4U7B7U2KIWN"

const web3 = new Web3(BSC_ENDPOINT)


function getContract(contractAbi, contractAddress) {
	return new web3.eth.Contract(contractAbi, contractAddress)
}

async function fetchAbi(addr) {

	const bscscanAbiUrl =  `https://api.bscscan.com/api?module=contract&action=getabi&address=${addr}&apiKey=${BSCSCAN_API_KEY}`
	const data = await fetch(bscscanAbiUrl).then(response => response.json())
	return JSON.parse(data.result)
}


module.exports = {
	getContract,
	fetchAbi,
	web3,
	BigNumber
}
