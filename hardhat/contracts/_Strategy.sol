//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IWorker.sol";
import "../interfaces/ICakePools.sol";


contract Strategy is IWorker {

	using SafeERC20 for IERC20;
	event DoHardWork(address stakedPoolAddr);

	constructor() {
	}

	function deposit(address stakedPoolAddr, uint256 amount, uint256 pid) private {
		require(amount > 0, "zero deposit amount");
		console.log(amount, pid);

		bool success;
		bytes memory data;

		if (pid != 0) { // TODO: FIXME
			ICakePools(stakedPoolAddr).deposit(amount, pid);
		}
		else {
			console.log('msg.sender=', msg.sender);
			(success, data) = (ICakePools(stakedPoolAddr).stakedToken()).call(abi.encodeWithSignature("approve(address,uint256)",stakedPoolAddr,amount));
			require (success == true, 'approve');

			(success, data) = (stakedPoolAddr).call(abi.encodeWithSignature("deposit(uint256)",amount));
			require (success == true, 'deposit');
		}
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

		console.log('Strategy address =', address (this));
		console.log('DoHArdWork Strategy: msg.sender=', msg.sender, 'tx.origin=', tx.origin);

		// here we have only cakes (rewards + staked)
		if (params.withdraw) {  // newStakedPoolAddr != stakedPoolAddr
			// unstake all cakes
			withdraw(params.stakedPoolAddr, params.amount);
		}

		// our reward token might be cake, in this case no need to swap
		if (params.swap) {
//			swap(params.stakedPoolAddr, params.amount); // TODO: FIXME tmp
		}

		if (params.deposit) {
			// stake all cakes in staking pool
			deposit(params.newPoolAddr, params.amount, params.pid);
		}

		return true;
//		emit DoHardWork(stakedPoolAddr);
	}

}
