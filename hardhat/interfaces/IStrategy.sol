//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


interface IStrategy {

	struct DoHardWorkParams {
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

	struct TransferDelegatorsParams {
		address stakedToken;
		uint256 amount;
		uint16 startIndex;
		uint16 endIndex;
	}

}

