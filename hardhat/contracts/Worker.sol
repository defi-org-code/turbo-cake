//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/IWorker.sol";
import "../interfaces/ICakePools.sol";


contract Worker is IWorker {

	using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address public immutable owner;

	address cake = address(0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);
	address masterChefAddress = address(0x73feaa1eE314F8c655E354234017bE2193C9E24E);
	address smartChefFactory = address (0x927158Be21Fe3D4da7E96931bb27Fd5059A8CbC2);

	event DoHardWork(address stakedPoolAddr);

	modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

	constructor() {
		owner = msg.sender;
	}

	modifier validatePool(address pool) {

		if (pool == masterChefAddress) {
			return;
		}

        require(ICakePools(pool).SMART_CHEF_FACTORY() == smartChefFactory, "invalid smartchef factory");

		bytes32 smartChefCodeHash = 0xdff6e8f6a4233f835d067b2c6fa427aa17c0fd39a43960a75e25e35af1445587;
		bytes32 codeHash;
		assembly { codeHash := extcodehash(pool) }

		require(codeHash == smartChefCodeHash, "invalid pool code hash");

        _;
    }

	function deposit(address stakedPoolAddr, uint256 amount) private validatePool (stakedPoolAddr) {
		// TODO: change stakedToken to cake
		// remove amount and use all balance?

		if (amount == 0) {
			amount = IERC20(ICakePools(stakedPoolAddr).stakedToken()).balanceOf(address(this));
		}

		if (stakedPoolAddr == masterChefAddress) {
			IERC20(cake).approve(stakedPoolAddr,amount);
			ICakePools(stakedPoolAddr).enterStaking(amount);
		}
		else {
			IERC20(ICakePools(stakedPoolAddr).stakedToken()).approve(stakedPoolAddr,amount);
			ICakePools(stakedPoolAddr).deposit(amount);
		}
	}

	function withdraw(address stakedPoolAddr, uint256 amount) private {

		// TODO: add validatePool modifier?
		//

		UserInfo memory userInfo;
		if (stakedPoolAddr == masterChefAddress) {

			if (amount != 0) {
				userInfo = IMasterchef(stakedPoolAddr).userInfo(0, address(this));
				amount = userInfo.amount;
			}

			ICakePools(stakedPoolAddr).leaveStaking(amount);
		}
		else {

			if (amount != 0) {
				userInfo = ICakePools(stakedPoolAddr).userInfo(address(this));
				amount = userInfo.amount;
			}

			ICakePools(stakedPoolAddr).withdraw(amount);
		}
	}

	function swap(address stakedPoolAddr, SwapParams calldata params) private {
		// TODO: remove SwapParams
		// add validatePool modifier on stakedPoolAddr or new verifier on swapRouter
		// swap router - hardcoded and can be changed by trezor (whitelist)
		// path - whitelist
		// multiplier, deadline - hardcoded

		uint256 amountIn = IERC20(ICakePools(stakedPoolAddr).rewardToken()).balanceOf(address(this));

		if (amountIn == 0) {
			return;
		}

		// talk with tal: oracle or amountOutMin
		// add harvest stats -> bot monitoring
		// remove contracts from the bot
        uint256 [] memory amounts = ICakePools(params.swapRouter).getAmountsOut(amountIn, params.path);
		uint256 amountOutMin = amounts[amounts.length-1].mul(params.multiplier).div(100);

		IERC20(ICakePools(stakedPoolAddr).rewardToken()).approve(params.swapRouter,amountIn);
		ICakePools(params.swapRouter).swapExactTokensForTokens(amountIn, amountOutMin, params.path, address(this), params.deadline);
	}

	function doHardWork(DoHardWorkParams calldata params) external onlyOwner {
		// TODO: separate functions: withdraw, deposit, harvest

		// here we have only cakes (rewards + staked)
		if (params.withdraw) {  // newStakedPoolAddr != stakedPoolAddr
			// unstake all cakes
			withdraw(params.stakedPoolAddr, params.amount);
		}

		// our reward token might be cake, in this case no need to swap
		if (params.swap) {
			swap(params.stakedPoolAddr, params.swapParams);
		}

		if (params.deposit) {
			// stake all cakes in staking pool
			deposit(params.newPoolAddr, params.amount);
		}

		emit DoHardWork(params.stakedPoolAddr);
	}

	function transferToManager(uint256 amount, address token) external onlyOwner {
		// TODO: token - should be cake
		if (amount == 0) {
			amount = IERC20(token).balanceOf(address(this));
		}

		IERC20(token).safeTransfer(owner, amount);
	}

}
