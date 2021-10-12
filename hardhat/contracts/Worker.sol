//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0; // TODO: use 0.8.6

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol"; // TODO: remove no need in solidity 8
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";// TODO: remove no need in solidity 8

import "../interfaces/IWorker.sol";
import "../interfaces/ICakePools.sol";


contract Worker is IWorker {

	using SafeERC20 for IERC20;
    using SafeMath for uint256;// TODO: remove no need in solidity 8

    address public immutable owner;

	address cake = address(0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);
	address masterChefAddress = address(0x73feaa1eE314F8c655E354234017bE2193C9E24E);
	address smartChefFactory = address (0x927158Be21Fe3D4da7E96931bb27Fd5059A8CbC2);
	address swapRouter = address (0x10ED43C718714eb63d5aA57B78B54704E256024E);

	event DoHardWork(address poolAddr);

	modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

	constructor() {
		owner = msg.sender;
	}

	function deposit(address poolAddr) external onlyOwner {
		// make func clearer
		amount = IERC20(cake).balanceOf(address(this));

		IERC20(cake).approve(poolAddr,amount);

		if (poolAddr == masterChefAddress) {
			ICakePools(poolAddr).enterStaking(amount);
		}
		else {
			ICakePools(poolAddr).deposit(amount);
		}
	}

	function withdraw(address poolAddr, bool withdrawRewardsOnly) external onlyOwner {
		// make func clearer

		UserInfo memory userInfo;
		uint256 amount = 0;

		if (poolAddr == masterChefAddress) {

			if (withdrawRewardsOnly == false) {
				userInfo = IMasterchef(poolAddr).userInfo(0, address(this));
				amount = userInfo.amount;
			}

			ICakePools(poolAddr).leaveStaking(amount);
		}
		else {

			if (withdrawRewardsOnly == false) {
				userInfo = ICakePools(poolAddr).userInfo(address(this));
				amount = userInfo.amount;
			}

			ICakePools(poolAddr).withdraw(amount);
		}
	}

	function swap(address poolAddr, uint16 path) external onlyOwner {
		// consider move to manager
		// multiplier, deadline - hardcoded
		// update swapRouter from trezor

		uint256 amountIn = IERC20(ICakePools(poolAddr).rewardToken()).balanceOf(address(this));

		if (amountIn == 0) {
			return;
		}

		// talk with tal: oracle or amountOutMin
		// add harvest stats -> bot monitoring
		// remove contracts from the bot
//        uint256 [] memory amounts = ICakePools(swapRouter).getAmountsOut(amountIn, path);
//		uint256 amountOutMin = amounts[amounts.length-1].mul(params.multiplier).div(100);
		uint256 amountOutMin = 0; // TODO: move to bot?

		IERC20(ICakePools(poolAddr).rewardToken()).approve(swapRouter,amountIn);
		ICakePools(swapRouter).swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), params.deadline);
	}

	function transferToManager() external onlyOwner {
		uint256 amount;

		amount = IERC20(cake).balanceOf(address(this));

		IERC20(token).safeTransfer(owner, amount);
	}

}
