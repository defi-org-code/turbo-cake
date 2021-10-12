//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Worker.sol";
import "../interfaces/IWorker.sol";
import "../interfaces/ICakePools.sol";


contract Manager is ReentrancyGuard, IWorker {

	using SafeERC20 for IERC20;
    using SafeMath for uint256;

	address cake = address(0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);
	address masterChefAddress = address(0x73feaa1eE314F8c655E354234017bE2193C9E24E);
	address smartChefFactory = address (0x927158Be21Fe3D4da7E96931bb27Fd5059A8CbC2);

    address public immutable owner;
    address public admin;
	address [] public workers;

	// TODO: improve events params
	event SetAdmin(address newAdmin);
	event WorkersAdded(uint256 nWorkers);
	event DoHardWork(uint16 startIndex, uint16 endIndex, address indexed stakedPoolAddr, address indexed newPoolAddr);
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
			return;
		}

        require(ICakePools(pool).SMART_CHEF_FACTORY() == smartChefFactory, "invalid smartchef factory");

		bytes32 smartChefCodeHash = 0xdff6e8f6a4233f835d067b2c6fa427aa17c0fd39a43960a75e25e35af1445587;
		bytes32 codeHash;
		assembly { codeHash := extcodehash(pool) }

		require(codeHash == smartChefCodeHash, "invalid pool code hash");

        _;
    }

    constructor(address _owner, address _admin) {
        owner = _owner;
        admin = _admin;
    }

    /* ---------------------------------------------------------------------------------------------
     * restricted
     * --------------------------------------------------------------------------------------------- */

	// control by trezor
	function addWorkers(uint16 numWorkersToAdd) external onlyOwner {

		uint256 n = workers.length + numWorkersToAdd;

		for (uint256 i=workers.length; i < n; i++) {
			Worker worker = new Worker();
			workers.push(address(worker));
		}

		emit WorkersAdded(workers.length);
	}

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

	function deposit(address poolAddr, uint256 amount, uint16 startIndex, uint16 endIndex) external restricted validatePool(poolAddr) {

		require ((endIndex <= workers.length) && (startIndex < endIndex), "Invalid start or end index");

		for (uint16 i=startIndex; i < endIndex; i++) {
			Worker(workers[i]).deposit(poolAddr, amount);
		}

		// TODO: event
//		emit DoHardWork(startIndex, endIndex, params.stakedPoolAddr, params.newPoolAddr);
	}

	function withdraw(address poolAddr, uint256 amount, uint16 startIndex, uint16 endIndex) external restricted validatePool(poolAddr) {

		require ((endIndex <= workers.length) && (startIndex < endIndex), "Invalid start or end index");

		for (uint16 i=startIndex; i < endIndex; i++) {
			Worker(workers[i]).withdraw(poolAddr, amount);
		}

		// TODO: event
//		emit DoHardWork(startIndex, endIndex, params.stakedPoolAddr, params.newPoolAddr);
	}

	function harvest(address poolAddr, uint16 startIndex, uint16 endIndex) external restricted validatePool(poolAddr) {

		require ((endIndex <= workers.length) && (startIndex < endIndex), "Invalid start or end index");

		for (uint16 i=startIndex; i < endIndex; i++) {
			Worker(workers[i]).withdraw(poolAddr, 0);
			Worker(workers[i]).swap(poolAddr, 0/*TODO swap params*/);
		}

		// TODO: event
//		emit DoHardWork(startIndex, endIndex, params.stakedPoolAddr, params.newPoolAddr);
	}

	function transferToWorkers(uint256 amount, uint16 startIndex, uint16 endIndex) external restricted {

		uint256 amount;
		uint256 balance = IERC20(cake).balanceOf(address(this));

		require(workers.length >= endIndex - startIndex, "invalid workers indices");
		require(params.amount * (endIndex - startIndex) <= balance, "Insufficient funds for all workers");

		for (uint16 i=startIndex; i< endIndex; i++) {

			amount = params.amount.sub(IERC20(cake).balanceOf(workers[i]));
			require(amount <= params.amount, "unexpected worker amount");

			IERC20(cake).safeTransfer(workers[i], amount);
		}

		emit TransferToWorkers(startIndex, endIndex, params.amount);
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
