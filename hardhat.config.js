require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");


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

    defaultNetwork: "bsc",

    networks: {

        hardhat: {
            forking: {
                url: "https://long-thrumming-dream.bsc.quiknode.pro/4361da560bd47300da588fc1ec5ea1c2ba05891f/",
                chainId: 31337,
                unlocked_accounts: ["0x73feaa1eE314F8c655E354234017bE2193C9E24E", "0xeb79a35801281f34db87848682db56d005806cec"],
            }
        },

        bsc: {
            url: "https://long-thrumming-dream.bsc.quiknode.pro/4361da560bd47300da588fc1ec5ea1c2ba05891f/",
            chainId: 56,
        }
    },

    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },

    mocha: {
        timeout: 75000
    }

};