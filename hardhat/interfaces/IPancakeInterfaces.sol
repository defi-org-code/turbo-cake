//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISmartChef {

	struct UserInfo { // TODO: move to another place?
	    uint256 amount;
	    uint256 rewardDebt;
	}

	function deposit(uint256) external;
	function withdraw(uint256) external;
    function rewardToken() external returns (address);
    function stakedToken() external returns (address);
    function userInfo(address) external view returns (UserInfo memory);
	function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
	function SMART_CHEF_FACTORY() external returns (address);
}

interface IMasterChef {

	struct UserInfo { // TODO: move to another place?
	    uint256 amount;
	    uint256 rewardDebt;
	}

	function enterStaking(uint256) external;
	function leaveStaking(uint256 _amount) external;
    function userInfo(uint256,address) external view returns (UserInfo memory);
}

interface ISwapRouter {

	function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}
