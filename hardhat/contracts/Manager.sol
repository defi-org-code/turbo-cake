//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

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
// events
// change tests
// test emergency
// review hacks
// generatePath any better way to copy path?


contract Manager  {

	using SafeERC20 for IERC20;

	address cake = address (0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);
	address masterChefAddress = address (0x73feaa1eE314F8c655E354234017bE2193C9E24E);
	address smartChefFactory = address (0x927158Be21Fe3D4da7E96931bb27Fd5059A8CbC2);

	address bnb = address (0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c);
	address busd = address (0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56);
	address busdt = address (0x55d398326f99059fF775485246999027B3197955);
	address usdc = address (0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d);
	address eth = address (0x2170Ed0880ac9A755fd29B2688956BD959F933F8);

    address public immutable owner;
    address public admin;
	address [] public workers;
	address [][] public path;

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

	        require(ISmartChef(pool).SMART_CHEF_FACTORY() == smartChefFactory, "POOL0");

			bytes32 smartChefCodeHash = 0xdff6e8f6a4233f835d067b2c6fa427aa17c0fd39a43960a75e25e35af1445587;
			bytes32 codeHash;
			assembly { codeHash := extcodehash(pool) }

			require(codeHash == smartChefCodeHash, "POOL1");

	        _;
		}
    }

    constructor(address _owner, address _admin, address [][] memory _path) {
        owner = _owner;
        admin = _admin;

        for (uint16 i=0; i<_path.length; i++) {
            path.push(_path[i]);
        }
    }

    /* ---------------------------------------------------------------------------------------------
     * view
     * --------------------------------------------------------------------------------------------- */

	function getNWorkers() external view returns (uint256) {
		return workers.length;
	}

	function generatePath(uint16 pathId, address rewardToken) private view returns (address [] memory) {

		address [] memory fullPath = new address [] (path[pathId].length) ;
		fullPath[0] = rewardToken;
		for (uint16 i=1; i< path[pathId].length; i++) {
			fullPath[i] = path[pathId][i];
		}

		return fullPath;
	}

    /* ---------------------------------------------------------------------------------------------
     * restricted
     * --------------------------------------------------------------------------------------------- */

	function deposit(address poolAddr, uint16 startIndex, uint16 endIndex) external restricted validatePool(poolAddr) {

		require ((endIndex <= workers.length) && (startIndex < endIndex), "IDX");

		uint256 amount;

		if (poolAddr == masterChefAddress) {
			for (uint16 i=startIndex; i < endIndex; i++) {
				amount = IERC20(cake).balanceOf(workers[i]);
				Worker(workers[i]).depositMasterChef(amount);
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

		require (pathId < path.length, "IDX0");
		require ((endIndex <= workers.length) && (startIndex < endIndex), "IDX1");

		uint256 amountIn;

		if (poolAddr == masterChefAddress) {
			IMasterChef.UserInfo memory userInfo;
			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				userInfo = IMasterChef(poolAddr).userInfo(0, workers[i]);
				Worker(workers[i]).withdrawMasterChef(userInfo.amount);
			}
		}
		else {

			address rewardToken = ISmartChef(poolAddr).rewardToken();
			ISmartChef.UserInfo memory userInfo;
			address [] memory fullPath = generatePath(pathId, rewardToken);

			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				userInfo = ISmartChef(poolAddr).userInfo(workers[i]);
				Worker(workers[i]).withdrawSmartChef(poolAddr, userInfo.amount);
				// swap
				amountIn = IERC20(rewardToken).balanceOf(workers[i]);
				if (amountIn != 0) {
					Worker(workers[i]).swap(rewardToken, fullPath, amountIn);
				}
			}
		}

//		emit DoHardWork(startIndex, endIndex, poolAddr);
	}

	function harvest(address poolAddr, uint16 pathId, uint16 startIndex, uint16 endIndex) external restricted validatePool(poolAddr) {

		require (pathId < path.length, "PTH");
		require ((endIndex <= workers.length) && (startIndex < endIndex), "IDX");

		uint256 amount;
		uint256 amountIn;

		if (poolAddr == masterChefAddress) {
			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				Worker(workers[i]).withdrawMasterChef(0);
				// deposit
				amount = IERC20(cake).balanceOf(workers[i]);
				Worker(workers[i]).depositMasterChef(amount);
			}
		}
		else {
			address rewardToken = ISmartChef(poolAddr).rewardToken();
			address [] memory fullPath = generatePath(pathId, rewardToken);

			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				Worker(workers[i]).withdrawSmartChef(poolAddr, 0);
				// swap
				amountIn = IERC20(rewardToken).balanceOf(workers[i]);
				if (amountIn != 0) {
					Worker(workers[i]).swap(rewardToken, fullPath, amountIn);
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

		require((endIndex > startIndex) && (workers.length >= endIndex - startIndex), "IDX0");
		require(amount * (endIndex - startIndex) <= balance, "IDX1");

		for (uint16 i=startIndex; i< endIndex; i++) {

			transferAmount -= IERC20(cake).balanceOf(workers[i]);
			require(transferAmount <= amount, "WRK");

			IERC20(cake).safeTransfer(workers[i], amount);
		}

		// TODO: event
		emit TransferToWorkers(startIndex, endIndex, amount);
	}

	function transferToManager(uint16 startIndex, uint16 endIndex) external restricted {

		uint256 amount;
		for (uint16 i=startIndex; i< endIndex; i++) {
				amount = IERC20(cake).balanceOf(workers[i]);
				Worker(workers[i]).transferToManager(amount);
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

	// TODO: test
	function emergencyFunctionCall(address target, bytes memory data) external onlyOwner {
        Address.functionCall(target, data);
    }

    function emergencyFunctionDelegateCall(address target, bytes memory data) external onlyOwner {
        Address.functionDelegateCall(target, data);
    }

}
