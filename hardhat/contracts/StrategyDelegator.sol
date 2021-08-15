//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Strategy.sol";
import "../interfaces/IStrategy.sol";


contract StrategyDelegator is Ownable, ReentrancyGuard, IStrategy {

	using SafeERC20 for IERC20;

	constructor() {
	}

	function doHardWork(address strategyAddr, DoHardWorkParams memory params) external onlyOwner nonReentrant {
//		console.log('strategyAddr: ', strategyAddr);
		(bool success, bytes memory data) = strategyAddr.delegatecall(
			abi.encodeWithSignature("_doHardWork(bool,bool)",true,true));

//		(bool success, bytes memory data) = address(strategyAddr).delegatecall(
//			abi.encodeWithSignature("_doHardWork(bool,bool)",true,true));

		console.log(success);
		require (success == true, 'doHardWork failed');
	}

	function TransferToOwner(address stakedToken, uint256 amount) external onlyOwner {

		if (amount == 0) {
			amount = IERC20(stakedToken).balanceOf(address(this));
		}

		IERC20(stakedToken).safeApprove(owner(), amount);
		IERC20(stakedToken).safeTransfer(owner(), amount);
	}
}
