//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IWorker.sol";
import "../interfaces/ICakePools.sol";

contract Worker is ReentrancyGuard, IWorker {

	using SafeERC20 for IERC20;
    address public immutable owner;

	event DoHardWork(address stakedPoolAddr);

	modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

	constructor() {
		owner = msg.sender;
	}

	function deposit(address stakedPoolAddr, uint256 amount, uint256 pid) private {
		require(amount > 0, "zero deposit amount");

		bool success;
		bytes memory data;

		if (pid != 0) { // TODO: FIXME
			ICakePools(stakedPoolAddr).deposit(amount, pid);
		}
		else {
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

	function doHardWork(DoHardWorkParams memory params) external {

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

		emit DoHardWork(params.stakedPoolAddr);

	}

	function transferToManager(address stakedToken) external onlyOwner nonReentrant {

		uint256 amount = IERC20(stakedToken).balanceOf(address(this));

		if (amount == 0) {
			return;
		}

		IERC20(stakedToken).safeTransfer(owner, amount);
	}

}
