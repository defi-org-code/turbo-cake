//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Strategy.sol";
import "../interfaces/IStrategy.sol";


contract StrategyDelegator is ReentrancyGuard, IStrategy {

	using SafeERC20 for IERC20;
    address public immutable owner;

	modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

	constructor() {
		owner = msg.sender;
	}

    receive() external payable {
    }

	function doHardWork(address strategyAddr, DoHardWorkParams memory params) external onlyOwner nonReentrant {
		Strategy(strategyAddr).doHardWork(params);
	}

	function transferToManager(address stakedToken) external onlyOwner nonReentrant {

		uint256 amount = IERC20(stakedToken).balanceOf(address(this));

		if (amount == 0) {
			return;
		}

		IERC20(stakedToken).safeApprove(owner, amount);
		IERC20(stakedToken).safeTransfer(owner, amount);
	}

}
