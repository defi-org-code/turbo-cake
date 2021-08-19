require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");

// const { mnemonic } = require('./secrets.json');

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: "0.8.0",
	defaultNetwork: "hardhat",

	networks: {

		hardhat: {
			forking: {
				url: "https://long-thrumming-dream.bsc.quiknode.pro/4361da560bd47300da588fc1ec5ea1c2ba05891f/",
				// url: "https://cold-silent-rain.bsc.quiknode.pro/f39277cc46387375f0eb657b7aca8ba81431a05e/",
				// url: "https://bsc-dataseed.binance.org/",
				// blockNumber: 9879809,
				// accounts: {
				// 	accountsBalance: "1000000",
				// },
				chainId: 56,
				// blockGasLimit: 12e6,
				// gasPrice: 20000000000,
				unlocked_accounts: ["0x73feaa1eE314F8c655E354234017bE2193C9E24E"],
				// accounts: { mnemonic: },
			}
		},

		mainnet: {
			url: "https://bsc-dataseed.binance.org/",
			chainId: 56,
			gasPrice: 20000000000,
			// accounts: {mnemonic: mnemonic}
		}
	},

	paths: {
		sources: "./contracts",
		tests: "./test",
		cache: "./cache",
		artifacts: "./artifacts"
	},

	mocha: {
    	timeout: 50000
  	}

};
