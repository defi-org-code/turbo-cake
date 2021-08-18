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

	address cake = address(0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);

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

		if (pid == 0) { // TODO: FIXME
			IERC20(cake).approve(stakedPoolAddr,amount);
			ICakePools(stakedPoolAddr).enterStaking(amount);
		}
		else {
			IERC20(ICakePools(stakedPoolAddr).stakedToken()).approve(stakedPoolAddr,amount);
			ICakePools(stakedPoolAddr).deposit(amount);
		}
	}

	function withdraw(address stakedPoolAddr, uint256 amount, uint256 pid) private {
		require(amount > 0, "zero deposit amount");

		if (pid == 0) {
			ICakePools(stakedPoolAddr).leaveStaking(amount);
		}
		else {
			ICakePools(stakedPoolAddr).withdraw(amount);
		}
	}

	function swap(address stakedPoolAddr, uint256 amount) private {
		CakePairs(stakedPoolAddr).swap(amount); // TODO: FIXME tmp
		console.log("swap");
	}

	function doHardWork(DoHardWorkParams memory params) external {

		// here we have only cakes (rewards + staked)
		if (params.withdraw) {  // newStakedPoolAddr != stakedPoolAddr
			// unstake all cakes
			withdraw(params.stakedPoolAddr, params.amount, params.pid);
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
