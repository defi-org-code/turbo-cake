//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


interface IWorker {

	struct SwapParams { // should be removed
		address swapRouter; // verify only 1 router exist
        uint256 multiplier; // remove use hardcoded value
        address[] path; // whitelisted - can be controlled by trezor
        uint256 deadline; // remove - use hardcoded?
	}

	struct DoHardWorkParams {
		bool withdraw;// remove
		bool swap;// remove
		bool deposit;// remove
		address stakedPoolAddr;
		address newPoolAddr;// remove
		uint256 amount;
		uint16 startIndex;
		uint16 endIndex;
		SwapParams swapParams;//remove
	}

	struct TransferWorkersParams {
		address stakedToken; // remove - should be cake
		uint256 amount;
		uint16 startIndex;
		uint16 endIndex;
	}

	struct TransferMngParams {
		address token; // remove - should be cake
		uint256 amount;
		uint16 startIndex;
		uint16 endIndex;
	}

	struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

}

