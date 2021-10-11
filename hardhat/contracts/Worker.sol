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
	address SMART_CHEF_FACTORY = address (0x927158Be21Fe3D4da7E96931bb27Fd5059A8CbC2);

	event DoHardWork(address stakedPoolAddr);

	modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

	constructor() {
		owner = msg.sender;
	}

	function validatePool(address pool) private {
        require(ICakePools(pool).SMART_CHEF_FACTORY() == SMART_CHEF_FACTORY, "invalid smartchef factory");

		bool equal;
		bytes32 smartChefCode = 0x866f2224d2bcc0a716d292663e34396dd64d657e342d87867aa429b6377f1b2d;
		bytes memory poolCode = pool.code;
		uint256 len = smartChefCode.length;

		assembly {
            equal := eq(keccak256(poolCode, len), smartChefCode)
        }

        require(equal, "invalid smartchef code");
    }

	function deposit(address stakedPoolAddr, uint256 amount) private {

		validatePool(stakedPoolAddr);

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

		uint256 amountIn = IERC20(ICakePools(stakedPoolAddr).rewardToken()).balanceOf(address(this));

		if (amountIn == 0) {
			return;
		}

        uint256 [] memory amounts = ICakePools(params.swapRouter).getAmountsOut(amountIn, params.path);
		uint256 amountOutMin = amounts[amounts.length-1].mul(params.multiplier).div(100);

		IERC20(ICakePools(stakedPoolAddr).rewardToken()).approve(params.swapRouter,amountIn);
		ICakePools(params.swapRouter).swapExactTokensForTokens(amountIn, amountOutMin, params.path, address(this), params.deadline);
	}

	function doHardWork(DoHardWorkParams calldata params) external onlyOwner {

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

		if (amount == 0) {
			amount = IERC20(token).balanceOf(address(this));
		}

		IERC20(token).safeTransfer(owner, amount);
	}

}
