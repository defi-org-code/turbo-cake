//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IWorker.sol";


interface ICakePools {

	function deposit(uint256) external;
	function enterStaking(uint256) external;
	function withdraw(uint256) external;
	function leaveStaking(uint256 _amount) external;
    function rewardToken() external returns (address);
    function stakedToken() external returns (address);
	function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function userInfo(address) external view returns (IWorker.UserInfo memory);
}


interface IMasterchef {

    function userInfo(uint256,address) external view returns (IWorker.UserInfo memory);
}
