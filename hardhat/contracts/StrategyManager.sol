//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


import "hardhat/console.sol";
import "./StrategyDelegator.sol";
import "./Strategy.sol";

import "../interfaces/IStrategy.sol";


contract StrategyManager is Ownable, ReentrancyGuard, IStrategy {

//	using SafeBEP20 for IBEP20;
	using SafeERC20 for IERC20;

	address public stakedPoolAddr = address(0);
	address public strategy;
	StrategyDelegator[] public delegators;

	// TODO: events
	event Delegators(address [] delegatorsAddr);
	event StrategyUpdate(address indexed strategy);
	event DelegatorsAdded(uint256 nDelegators);
	event DoHardWork(uint16 startIndex, uint16 endIndex, address stakedPoolAddr);
	event TransferToDelegators(address strategy);
	event StakedPoolAddrUpdate(address stakedPoolAddr);

	constructor() {
	}

	function addDelegators(uint32 numDelegators) external onlyOwner nonReentrant {

		address [] memory delegatorsAddr = new address[](numDelegators);

		for (uint256 i=delegators.length; i < numDelegators; i++) {
			StrategyDelegator delegator = new StrategyDelegator();
			delegators.push(delegator);
			delegatorsAddr[i] = address(delegator);
		}

		emit Delegators(delegatorsAddr);
	}

	function doHardWork(DoHardWorkParams memory params) external onlyOwner nonReentrant {

		console.log(params.startIndex, params.endIndex);

		require ((params.endIndex <= delegators.length) && (params.startIndex < params.endIndex), "Invalid start or end index");

		for (uint16 i=params.startIndex; i < params.endIndex; i++) {
			delegators[i].doHardWork(strategy, params);
		}

		emit DoHardWork(params.startIndex, params.endIndex, stakedPoolAddr);
	}

	function updateStrategy(address _strategy) external onlyOwner nonReentrant {
		strategy = _strategy;

		emit StrategyUpdate(strategy);
	}

	function updateStakedPoolAddr(address _stakedPoolAddr) external onlyOwner nonReentrant {
		stakedPoolAddr = _stakedPoolAddr;

		emit StakedPoolAddrUpdate(strategy);
	}

	function transferToDelegators(TransferDelegatorsParams calldata params) external onlyOwner nonReentrant {

		uint256 balance = IERC20(params.stakedToken).balanceOf(address(this));

		require(params.amount * (params.endIndex - params.startIndex) <= balance, "Insufficient funds for all delegators");

		for (uint16 i=params.startIndex; i< params.startIndex; i++) {
			IERC20(params.stakedToken).safeApprove(address(delegators[i]), params.amount);
			IERC20(params.stakedToken).safeTransfer(address(delegators[i]), params.amount);
		}

		emit TransferToDelegators(strategy);
	}

	function transferFromDelegators(TransferDelegatorsParams calldata params) external onlyOwner nonReentrant {

		for (uint16 i=params.startIndex; i< params.startIndex; i++) {
			delegators[i].TransferToOwner(params.stakedToken, params.amount);
		}

		emit TransferToDelegators(strategy);
	}

}
