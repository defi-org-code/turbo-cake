//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../interfaces/IStrategy.sol";
import "../interfaces/ICakePools.sol";

contract Strategy is Ownable, IStrategy {

	event DoHardWork(address stakedPoolAddr);

	constructor() {
	}

	function deposit(address stakedPoolAddr, uint256 amount) private {
		require(amount > 0, "zero deposit amount");
		ICakePools(stakedPoolAddr).deposit(amount);
	}

	function withdraw(address stakedPoolAddr, uint256 amount) private {
		require(amount > 0, "zero deposit amount");
		ICakePools(stakedPoolAddr).withdraw(amount);
	}

	function swap(address stakedPoolAddr, uint256 amount) private {
		CakePairs(stakedPoolAddr).swap(amount); // TODO: FIXME tmp
		console.log("swap");
	}

	function doHardWork(DoHardWorkParams memory params) external returns (bool) {

		// here we have only cakes (rewards + staked)
		if (params.withdraw) {  // newStakedPoolAddr != stakedPoolAddr
			// unstake all cakes
			withdraw(params.stakedPoolAddr, params.amount);
		}

		// our reward token might be cake, in this case no need to swap
		if (params.swap) {
			swap(params.stakedPoolAddr, params.amount); // TODO: FIXME tmp
		}

		if (params.deposit) {
			// stake all cakes in staking pool
			deposit(params.stakedPoolAddr, params.amount);
		}

		return true;
//		emit DoHardWork(stakedPoolAddr);
	}

}
