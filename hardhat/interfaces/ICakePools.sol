//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface ICakePools {

	function deposit(uint256) external;
	function withdraw(uint256) external;
}

interface CakePairs {
	function swap(uint256) external;
}
