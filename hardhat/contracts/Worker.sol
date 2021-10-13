//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0; // TODO: use 0.8.6

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IPancakeInterfaces.sol";


contract Worker {

	using SafeERC20 for IERC20;

    address public immutable owner;

	address cake = address(0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);
	address masterChefAddress = address(0x73feaa1eE314F8c655E354234017bE2193C9E24E);
	address smartChefFactory = address(0x927158Be21Fe3D4da7E96931bb27Fd5059A8CbC2);
	address swapRouter = address(0x10ED43C718714eb63d5aA57B78B54704E256024E);
	uint256 deadline = 900;

	event DoHardWork(address poolAddr);

	modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

	constructor() {
		owner = msg.sender;
	}

	function depositMasterChef(address poolAddr, uint256 amount) external onlyOwner {
		IERC20(cake).approve(poolAddr,amount);
		IMasterChef(poolAddr).enterStaking(amount);
	}

	function depositSmartChef(address poolAddr, uint256 amount) external onlyOwner {
		IERC20(cake).approve(poolAddr,amount);
		ISmartChef(poolAddr).deposit(amount);
	}

	function withdrawMasterChef(address poolAddr, uint256 amount) external onlyOwner {
		IMasterChef(poolAddr).leaveStaking(amount);
	}

	function withdrawSmartChef(address poolAddr, uint256 amount) external onlyOwner {
		ISmartChef(poolAddr).withdraw(amount);
	}

	function swap(address rewardToken, uint16 path, uint256 amountIn) external onlyOwner {
		// consider move to manager
		// multiplier, deadline - hardcoded
		// update swapRouter from trezor

		// talk with tal: oracle or amountOutMin
		// add harvest stats -> bot monitoring
		// remove contracts from the bot
//        uint256 [] memory amounts = ISmartChef(swapRouter).getAmountsOut(amountIn, path);
//		uint256 amountOutMin = amounts[amounts.length-1].mul(params.multiplier).div(100);
		uint256 amountOutMin = 0; // TODO: move to bot?

		IERC20(rewardToken).approve(swapRouter,amountIn);
		ISwapRouter(swapRouter).swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), block.timestamp + deadline);
	}

	function transferToManager() external onlyOwner {
		uint256 amount;

		amount = IERC20(cake).balanceOf(address(this));

		IERC20(token).safeTransfer(owner, amount);
	}

}
