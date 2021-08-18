//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


interface ICakePools {

	function deposit(uint256) external;
	function enterStaking(uint256) external;
	function withdraw(uint256) external;
	function leaveStaking(uint256 _amount) external;
    function rewardToken() external returns (address);
    function stakedToken() external returns (address);

}

interface CakePairs {
	function swap(uint256) external;
}
