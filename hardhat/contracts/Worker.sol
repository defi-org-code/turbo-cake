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
	address [] swapRouter = [0x0];
	address [] swapRouter = [0x0];

	event DoHardWork(address poolAddr);

	modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

	constructor() {
		owner = msg.sender;
	}

	function deposit(address poolAddr) external onlyOwner {

		amount = IERC20(cake).balanceOf(address(this));

		if (poolAddr == masterChefAddress) {
			IERC20(cake).approve(poolAddr,amount);
			ICakePools(poolAddr).enterStaking(amount);
		}
		else {
			IERC20(cake).approve(poolAddr,amount);
			ICakePools(poolAddr).deposit(amount);
		}
	}

	function withdraw(address poolAddr, bool withdrawRewardsOnly) external onlyOwner {

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

	function swap(address poolAddr, uint16 pathId, uint16 swapRouterId) external onlyOwner {
		// TODO: remove SwapParams
		// add validatePool modifier on poolAddr or new verifier on swapRouter
		// swap router - hardcoded and can be changed by trezor (whitelist)
		// path - whitelist
		// multiplier, deadline - hardcoded

		uint256 amountIn = IERC20(ICakePools(poolAddr).rewardToken()).balanceOf(address(this));

		if (amountIn == 0) {
			return;
		}

        uint256 [] memory amounts = ICakePools(swapRouter[swapRouterId]).getAmountsOut(amountIn, path[pathId]);
		uint256 amountOutMin = amounts[amounts.length-1].mul(params.multiplier).div(100);

		IERC20(ICakePools(poolAddr).rewardToken()).approve(params.swapRouter,amountIn);
		ICakePools(params.swapRouter).swapExactTokensForTokens(amountIn, amountOutMin, params.path, address(this), params.deadline);
	}

	function transferToManager() external onlyOwner {
		uint256 amount;

		amount = IERC20(cake).balanceOf(address(this));

		IERC20(token).safeTransfer(owner, amount);
	}

}
