//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


interface IWorker {

	struct SwapParams {
		address swapRouter;
        uint256 multiplier;
        address[] path;
        uint256 deadline;
	}

	struct DoHardWorkParams {
		bool withdraw;
		bool swap;
		bool deposit;
		address stakedPoolAddr;
		address newPoolAddr;
		uint256 amount;
		uint16 startIndex;
		uint16 endIndex;
		SwapParams swapParams;
	}

	struct TransferWorkersParams {
		address stakedToken;
		uint256 amount;
		uint16 startIndex;
		uint16 endIndex;
	}

	struct TransferMngParams {
		address token;
		uint256 amount;
		uint16 startIndex;
		uint16 endIndex;
	}

	struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

}

