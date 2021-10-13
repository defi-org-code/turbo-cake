//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Worker.sol";
import "../interfaces/IPancakeInterfaces.sol";

// TODO:
// ---------------------------------
// discuss with tal:
// ---------------------------------
// sandwich attack on swap
// remove support to manual cake

// ---------------------------------
// others:
// ---------------------------------
// deadline on worker


contract Manager  {

	using SafeERC20 for IERC20;

	address cake = address(0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);
	address masterChefAddress = address(0x73feaa1eE314F8c655E354234017bE2193C9E24E);
	address smartChefFactory = address(0x927158Be21Fe3D4da7E96931bb27Fd5059A8CbC2);

    address public immutable owner;
    address public admin;
	address [] public workers;
	address [][] public path = [[address(0x927158Be21Fe3D4da7E96931bb27Fd5059A8CbC2)]]; // TODO: update + move?

	// TODO: improve events params
	event SetAdmin(address newAdmin);
	event WorkersAdded(uint256 nWorkers);
	event DoHardWork(uint16 startIndex, uint16 endIndex, address indexed poolAddr);
	event TransferToWorkers(uint16 startIndex, uint16 endIndex, uint256 indexed amount);
	event TransferToManager(uint16 indexed startIndex, uint16 indexed endIndex);
	event TransferToOwner(uint256 amount);

	modifier restricted() {
        require(msg.sender == owner || msg.sender == admin, "restricted");
        _;
    }

	modifier onlyOwner() {
        require(msg.sender == owner, "onlyOwner");
        _;
    }

	modifier validatePool(address pool) {

		if (pool == masterChefAddress) {
			_;
		}
		else {

	        require(ISmartChef(pool).SMART_CHEF_FACTORY() == smartChefFactory, "invalid smartchef factory");

			bytes32 smartChefCodeHash = 0xdff6e8f6a4233f835d067b2c6fa427aa17c0fd39a43960a75e25e35af1445587;
			bytes32 codeHash;
			assembly { codeHash := extcodehash(pool) }

			require(codeHash == smartChefCodeHash, "invalid pool code hash");

	        _;
		}
    }

    constructor(address _owner, address _admin) {
        owner = _owner;
        admin = _admin;
    }

    /* ---------------------------------------------------------------------------------------------
     * view
     * --------------------------------------------------------------------------------------------- */

	function getNWorkers() external view returns (uint256) {
		return workers.length;
	}

	function getWorkers(uint16 startIndex, uint16 endIndex) external view returns (address [] memory) {
		address [] memory _workers = new address [] (endIndex-startIndex);

		for (uint16 i=0; i<endIndex-startIndex; i++) {
			_workers[i] = workers[startIndex+i];
		}

		return _workers;
	}

    /* ---------------------------------------------------------------------------------------------
     * restricted
     * --------------------------------------------------------------------------------------------- */

	function deposit(address poolAddr, uint16 startIndex, uint16 endIndex) external restricted validatePool(poolAddr) {

		require ((endIndex <= workers.length) && (startIndex < endIndex), "Invalid start or end index");

		uint256 amount;

		if (poolAddr == masterChefAddress) {
			for (uint16 i=startIndex; i < endIndex; i++) {
				amount = IERC20(cake).balanceOf(workers[i]);
				Worker(workers[i]).depositMasterChef(poolAddr, amount);
			}
		}
		else {
			for (uint16 i=startIndex; i < endIndex; i++) {
				amount = IERC20(cake).balanceOf(workers[i]);
				Worker(workers[i]).depositSmartChef(poolAddr, amount);
			}
		}

//		emit DoHardWork(startIndex, endIndex, poolAddr);
	}

	function withdraw(address poolAddr, uint16 pathId, uint16 startIndex, uint16 endIndex) external restricted validatePool(poolAddr) {

		require (pathId < path.length, "pathId exceeds path array size");
		require ((endIndex <= workers.length) && (startIndex < endIndex), "Invalid start or end index");

		uint256 amountIn;

		if (poolAddr == masterChefAddress) {
			IMasterChef.UserInfo memory userInfo;
			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				userInfo = IMasterChef(poolAddr).userInfo(0, workers[i]);
				Worker(workers[i]).withdrawMasterChef(poolAddr, userInfo.amount);
			}
		}
		else {
			address rewardToken = ISmartChef(poolAddr).rewardToken();
			ISmartChef.UserInfo memory userInfo;

			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				userInfo = ISmartChef(poolAddr).userInfo(workers[i]);
				Worker(workers[i]).withdrawSmartChef(poolAddr, userInfo.amount);
				// swap
				amountIn = IERC20(rewardToken).balanceOf(workers[i]);
				if (amountIn != 0) {
					Worker(workers[i]).swap(rewardToken, path[pathId], amountIn);
				}
			}
		}

//		emit DoHardWork(startIndex, endIndex, poolAddr);
	}

	function harvest(address poolAddr, uint16 pathId, uint16 startIndex, uint16 endIndex) external restricted validatePool(poolAddr) {

		require (pathId < path.length, "pathId exceeds path array size");
		require ((endIndex <= workers.length) && (startIndex < endIndex), "Invalid start or end index");

		uint256 amount;
		uint256 amountIn;

		if (poolAddr == masterChefAddress) {
			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				Worker(workers[i]).withdrawMasterChef(poolAddr, 0);
				// deposit
				amount = IERC20(cake).balanceOf(workers[i]);
				Worker(workers[i]).depositMasterChef(poolAddr, amount);
			}
		}
		else {
			address rewardToken = ISmartChef(poolAddr).rewardToken();

			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				Worker(workers[i]).withdrawSmartChef(poolAddr, 0);
				// swap
				amountIn = IERC20(rewardToken).balanceOf(workers[i]);
				if (amountIn != 0) {
					Worker(workers[i]).swap(rewardToken, path[pathId], amountIn);
				}
				// deposit
				amount = IERC20(cake).balanceOf(workers[i]);
				Worker(workers[i]).depositSmartChef(poolAddr, amount);
			}
		}

		// TODO: event
//		emit DoHardWork(startIndex, endIndex, params.stakedPoolAddr, params.newPoolAddr);
	}

	function transferToWorkers(uint256 amount, uint16 startIndex, uint16 endIndex) external restricted {

		uint256 transferAmount = amount;
		uint256 balance = IERC20(cake).balanceOf(address(this));

		require(endIndex > startIndex, "endIndex should be bigger than startIndex");
		require(workers.length >= endIndex - startIndex, "Insufficient workers");
		require(amount * (endIndex - startIndex) <= balance, "Insufficient funds for all workers");

		for (uint16 i=startIndex; i< endIndex; i++) {

			transferAmount -= IERC20(cake).balanceOf(workers[i]);
			require(transferAmount <= amount, "unexpected worker amount");

			IERC20(cake).safeTransfer(workers[i], amount);
		}

		// TODO: event
		emit TransferToWorkers(startIndex, endIndex, amount);
	}

	function transferToManager(uint16 startIndex, uint16 endIndex) external restricted {

		for (uint16 i=startIndex; i< endIndex; i++) {
				Worker(workers[i]).transferToManager();
		}

		// TODO: event
		emit TransferToManager(startIndex, endIndex);
	}

	function transferToOwner() external restricted {

		uint256 amount = IERC20(cake).balanceOf(address(this));

		IERC20(cake).safeTransfer(owner, amount);

		emit TransferToOwner(amount);
	}

    /* ---------------------------------------------------------------------------------------------
     * only owner
     * --------------------------------------------------------------------------------------------- */

	function addWorkers(uint16 numWorkersToAdd) external onlyOwner {

		uint256 n = workers.length + numWorkersToAdd;

		for (uint256 i=workers.length; i < n; i++) {
			Worker worker = new Worker();
			workers.push(address(worker));
		}

		emit WorkersAdded(workers.length);
	}

    function addPath(address[] calldata newPath) external onlyOwner {
        path.push(newPath);
//        emit SetAdmin(newAdmin); // TODO
    }

    function setAdmin(address newAdmin) external onlyOwner {
        admin = newAdmin;
        emit SetAdmin(newAdmin);
    }

	function emergencyFunctionCall(address target, bytes memory data) external onlyOwner {
        Address.functionCall(target, data);
    }

    function emergencyFunctionDelegateCall(address target, bytes memory data) external onlyOwner {
        Address.functionDelegateCall(target, data);
    }

}
