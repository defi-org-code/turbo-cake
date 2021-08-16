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


contract StrategyManager is ReentrancyGuard, IStrategy {

	using SafeERC20 for IERC20;

    address public immutable owner;
    address public admin;
	address public strategy;
	StrategyDelegator[] public delegators;

	event SetStrategy(address indexed strategy);
	event SetAdmin(address newAdmin);
	event DelegatorsAdded(address [] delegatorsAddr);
	event DoHardWork(uint16 startIndex, uint16 endIndex, address stakedPoolAddr, address newPoolAddr);
	event TransferToDelegators(address [] strategy);
	event TransferToManager(address owner);

	modifier restricted() {
        require(msg.sender == owner || msg.sender == admin, "restricted");
        _;
    }

	modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

    constructor(address _owner, address _admin) {
        owner = _owner;
        admin = _admin;
    }

	function setStrategy(address _strategy) external onlyOwner {
		strategy = _strategy;
		emit SetStrategy(strategy);
	}

    function setAdmin(address newAdmin) external onlyOwner {
        admin = newAdmin;
        emit SetAdmin(newAdmin);
    }

	function transferToOwner(address stakedToken) external onlyOwner { // TODO: change to restricted?

		uint256 amount = IERC20(stakedToken).balanceOf(address(this));

		IERC20(stakedToken).safeApprove(owner, amount);
		IERC20(stakedToken).safeTransfer(owner, amount);

		emit TransferToOwner(owner);
	}

	function addDelegators(uint16 numDelegators) external restricted {

		address [] memory delegatorsAddr = new address[](numDelegators);

		for (uint256 i=delegators.length; i < numDelegators; i++) {
			StrategyDelegator delegator = new StrategyDelegator();
			delegators.push(delegator);
			delegatorsAddr[i] = address(delegator);
		}

		emit DelegatorsAdded(delegatorsAddr);
	}

	function doHardWork(DoHardWorkParams memory params) external restricted {

		require ((params.endIndex <= delegators.length) && (params.startIndex < params.endIndex), "Invalid start or end index");

		for (uint16 i=params.startIndex; i < params.endIndex; i++) {
			delegators[i].doHardWork(strategy, params);
		}

		emit DoHardWork(params.startIndex, params.endIndex, params.stakedPoolAddr, params.newPoolAddr);
	}

	function transferToDelegators(TransferDelegatorsParams calldata params) external restricted {

		uint256 amount;
		address [] transferAddr;
		uint256 balance = IERC20(params.stakedToken).balanceOf(address(this));

		require(params.amount * (params.endIndex - params.startIndex) <= balance, "Insufficient funds for all delegators");

		for (uint16 i=params.startIndex; i< params.endIndex; i++) {

			amount = params.amount - IERC20(params.stakedToken).balanceOf(address(delegators[i]));

			if (amount <= 0) {
				continue;
			}

			IERC20(params.stakedToken).safeApprove(address(delegators[i]), amount);
			IERC20(params.stakedToken).safeTransfer(address(delegators[i]), amount);

			transferAddr.push(address(delegators[i]));
		}

		emit TransferToDelegators(transferAddr);
	}

	function transferToManager(TransferDelegatorsParams calldata params) external restricted {

		for (uint16 i=0; i< delegators.length; i++) {
				delegators[i].transferToManager(params.stakedToken);
		}

		emit TransferToManager(address(this));
	}

}
