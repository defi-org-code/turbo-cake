//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


interface IWorker {

	struct DoHardWorkParams { // TODO: will be changes to support swaps etc.
		bool withdraw;
		bool swap;
		bool deposit;
		address stakedPoolAddr;
		address newPoolAddr;
		uint256 amount;
		uint256 pid;
		uint16 startIndex;
		uint16 endIndex;
	}

	struct TransferWorkersParams {
		address stakedToken;
		uint256 amount;
		uint16 startIndex;
		uint16 endIndex;
	}

	struct TransferMngParams {
		address stakedToken;
		uint16 startIndex;
		uint16 endIndex;
	}

}

