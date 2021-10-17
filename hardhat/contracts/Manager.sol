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
// remove support to manual cake?
// malicious on bot + manipulate pancake to add new rug pool: can steal rewards only
// increase security by using additional server and separate deposit/withdraw/harvest from bot control (transfers)

// ---------------------------------
// others:
// ---------------------------------
// review potential hacks
// move userInfo struct from interface?
// events
// change tests
// test emergency
// generatePath any better way to copy path?
// separate contracts from bot
// send email with list of open issues


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

	        require(ISmartChef(pool).SMART_CHEF_FACTORY() == smartChefFactory, "VPL0");
	        require(ISmartChef(pool).rewardToken() != cake, "VPL1"); //
	        require(ISmartChef(pool).stakedToken() == cake, "VPL2");
	        require(ISmartChef(pool).bonusEndBlock() > block.number, "VPL3");

			bytes32 smartChefCodeHash = 0xdff6e8f6a4233f835d067b2c6fa427aa17c0fd39a43960a75e25e35af1445587;
			bytes32 codeHash;
			assembly { codeHash := extcodehash(pool) }

			require(codeHash == smartChefCodeHash, "VPL4");

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

		address [] memory fullPath = new address [] (path[pathId].length + 1);
		fullPath[0] = rewardToken;

		for (uint16 i=0; i< path[pathId].length; i++) {
			fullPath[i+1] = path[pathId][i];
		}

		return fullPath;
	}

    /* ---------------------------------------------------------------------------------------------
     * helpers
     * --------------------------------------------------------------------------------------------- */

	function safeSwap(address worker, address [] memory fullPath, address rewardToken) private {
		// cake balance is expected to grow
		uint256 cakeBalance;
		uint256 newCakeBalance;
		uint256 amountIn;

		amountIn = IERC20(rewardToken).balanceOf(worker);

		if (amountIn == 0) {
			return;
		}

		cakeBalance = IERC20(cake).balanceOf(worker);
		Worker(worker).swap(rewardToken, fullPath, amountIn);
		newCakeBalance = IERC20(cake).balanceOf(worker);
		require (newCakeBalance > cakeBalance, "CKB"); // cake balance is expected to grow
	}

    /* ---------------------------------------------------------------------------------------------
     * restricted
     * --------------------------------------------------------------------------------------------- */

	function deposit(uint16 startIndex, uint16 endIndex, address poolAddr) external restricted validatePool(poolAddr) {

		require ((endIndex <= workers.length) && (startIndex < endIndex), "IDX");

		uint256 amount;

		if (poolAddr == masterChefAddress) {
			for (uint16 i=startIndex; i < endIndex; i++) {
				amount = IERC20(cake).balanceOf(workers[i]);
				if (amount != 0) {
					Worker(workers[i]).depositMasterChef(amount);
				}
			}
		}
		else {
			for (uint16 i=startIndex; i < endIndex; i++) {
				amount = IERC20(cake).balanceOf(workers[i]);
				if (amount != 0) {
					Worker(workers[i]).depositSmartChef(poolAddr, amount);
				}
			}
		}

//		emit Deposit(startIndex, endIndex, poolAddr);
	}

	function withdraw(uint16 startIndex, uint16 endIndex, address poolAddr, uint16 pathId) external restricted validatePool(poolAddr) {

		require (pathId < path.length, "PTH");
		require ((endIndex <= workers.length) && (startIndex < endIndex), "IDX");

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
				safeSwap(workers[i], fullPath, rewardToken);
			}
		}

//		emit Withdraw(startIndex, endIndex, poolAddr);
	}

	function harvest(uint16 startIndex, uint16 endIndex, address poolAddr, uint16 pathId) external restricted validatePool(poolAddr) {

		require (pathId < path.length, "PTH");
		require ((endIndex <= workers.length) && (startIndex < endIndex), "IDX");

		uint256 amount;

		if (poolAddr == masterChefAddress) {
			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				Worker(workers[i]).withdrawMasterChef(0);
				// deposit
				amount = IERC20(cake).balanceOf(workers[i]);
				if (amount != 0) {
					Worker(workers[i]).depositMasterChef(amount);
				}
			}
		}
		else {
			address rewardToken = ISmartChef(poolAddr).rewardToken();
			address [] memory fullPath = generatePath(pathId, rewardToken);

			for (uint16 i=startIndex; i < endIndex; i++) {
				// withdraw
				Worker(workers[i]).withdrawSmartChef(poolAddr, 0);
				// swap
				safeSwap(workers[i], fullPath, rewardToken);
				// deposit
				amount = IERC20(cake).balanceOf(workers[i]);
				if (amount != 0) {
					Worker(workers[i]).depositSmartChef(poolAddr, amount);
				}
			}
		}

		// TODO: event
//		emit Harvest(startIndex, endIndex, poolAddr);
	}

	function transferToWorkers(uint16 startIndex, uint16 endIndex, uint256 amount) external restricted {

		uint256 transferAmount = amount;
		uint256 balance = IERC20(cake).balanceOf(address(this));

		require((endIndex > startIndex) && (workers.length >= endIndex - startIndex), "IDX0");
		require(amount * (endIndex - startIndex) <= balance, "IDX1");

		for (uint16 i=startIndex; i< endIndex; i++) {

			transferAmount -= IERC20(cake).balanceOf(workers[i]);
			require(transferAmount <= amount, "WRK");

			IERC20(cake).safeTransfer(workers[i], transferAmount);
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
	}

    function addPath(address[] calldata newPath) external onlyOwner {
        path.push(newPath);
    }

    function setAdmin(address newAdmin) external onlyOwner {
        admin = newAdmin;
    }

	// TODO: test
	function emergencyFunctionCall(address target, bytes memory data) external onlyOwner {
        Address.functionCall(target, data);
    }

    function emergencyFunctionDelegateCall(address target, bytes memory data) external onlyOwner {
        Address.functionDelegateCall(target, data);
    }

}
