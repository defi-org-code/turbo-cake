//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Worker.sol";
import "../interfaces/IWorker.sol";


contract StrategyManager is ReentrancyGuard, IWorker {

	using SafeERC20 for IERC20;

    address public immutable owner;
    address public admin;
	address [] public workers;

	// TODO: improve events params
	event SetAdmin(address newAdmin);
	event WorkersAdded(address [] workersAddr);
	event DoHardWork(uint16 startIndex, uint16 endIndex, address stakedPoolAddr, address newPoolAddr);
	event TransferToWorkers(uint16 startIndex, uint16 endIndex, uint256 amount, address stakedToken);
	event TransferToManager(uint16 startIndex, uint16 endIndex, address stakedToken);
	event TransferToOwner(uint256 amount);

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

    /* ---------------------------------------------------------------------------------------------
     * restricted
     * --------------------------------------------------------------------------------------------- */

	function addWorkers(uint16 numWorkers) external restricted {

		for (uint256 i=workers.length; i < numWorkers; i++) {
			Worker worker = new Worker();
			workers.push(address(worker));
		}

		emit WorkersAdded(workers); // TODO: array events costs
	}

	function doHardWork(DoHardWorkParams memory params) external restricted {

		require ((params.endIndex <= workers.length) && (params.startIndex < params.endIndex), "Invalid start or end index");

		for (uint16 i=params.startIndex; i < params.endIndex; i++) {
			Worker(workers[i]).doHardWork(params);
		}

		emit DoHardWork(params.startIndex, params.endIndex, params.stakedPoolAddr, params.newPoolAddr);
	}

	function transferToWorkers(TransferWorkersParams calldata params) external restricted {

		uint256 amount;
		uint256 balance = IERC20(params.stakedToken).balanceOf(address(this));

		require(params.amount * (params.endIndex - params.startIndex) <= balance, "Insufficient funds for all workers");

		for (uint16 i=params.startIndex; i< params.endIndex; i++) {

			amount = params.amount - IERC20(params.stakedToken).balanceOf(workers[i]);

			if (amount <= 0) {
				continue;
			}

			IERC20(params.stakedToken).safeApprove(workers[i], amount);
			IERC20(params.stakedToken).safeTransfer(workers[i], amount);
		}

		emit TransferToWorkers(params.startIndex, params.endIndex, params.amount, params.stakedToken);
	}

	function transferToManager(TransferMngParams calldata params) external restricted {

		for (uint16 i=params.startIndex; i< params.endIndex; i++) {
				Worker(workers[i]).transferToManager(params.stakedToken);
		}

		emit TransferToManager(params.startIndex, params.endIndex, params.stakedToken);
	}

	function transferToOwner(address stakedToken) external restricted { // TODO: change to onlyOwner?

		uint256 amount = IERC20(stakedToken).balanceOf(address(this));

		IERC20(stakedToken).safeApprove(owner, amount);
		IERC20(stakedToken).safeTransfer(owner, amount);

		emit TransferToOwner(amount);
	}

    /* ---------------------------------------------------------------------------------------------
     * only owner
     * --------------------------------------------------------------------------------------------- */

    function setAdmin(address newAdmin) external onlyOwner {
        admin = newAdmin;
        emit SetAdmin(newAdmin);
    }

	function emergencyFunctionCall(address target, bytes memory data) external onlyOwner {
        Address.functionCall(target, data);
    }

    function emergencyFunctionDelegateCall(address target, bytes memory data) external onlyOwner {
        Address.functionDelegateCall(target, data);
    }

}
