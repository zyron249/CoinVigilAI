// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CoinVigilERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    uint256 public immutable maxSupply;
    bool public immutable mintable;
    bool public immutable burnable;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error InvalidSupply();
    error InsufficientBalance();
    error InsufficientAllowance();
    error MintingDisabled();
    error BurningDisabled();
    error SupplyCapExceeded();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        uint256 maxSupply_,
        bool mintable_,
        bool burnable_,
        address owner_
    ) {
        if (owner_ == address(0)) revert ZeroAddress();
        if (bytes(name_).length == 0 || bytes(symbol_).length == 0) revert InvalidSupply();
        if (initialSupply_ == 0 || maxSupply_ < initialSupply_) revert InvalidSupply();

        name = name_;
        symbol = symbol_;
        maxSupply = maxSupply_;
        mintable = mintable_;
        burnable = burnable_;
        owner = owner_;

        emit OwnershipTransferred(address(0), owner_);
        _mint(owner_, initialSupply_);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < amount) revert InsufficientAllowance();

        if (currentAllowance != type(uint256).max) {
            unchecked {
                allowance[from][msg.sender] = currentAllowance - amount;
            }
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }

        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyOwner returns (bool) {
        if (!mintable) revert MintingDisabled();
        _mint(to, amount);
        return true;
    }

    function burn(uint256 amount) external returns (bool) {
        if (!burnable) revert BurningDisabled();
        _burn(msg.sender, amount);
        return true;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function renounceOwnership() external onlyOwner {
        address previousOwner = owner;
        owner = address(0);
        emit OwnershipTransferred(previousOwner, address(0));
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();

        unchecked {
            balanceOf[from] = fromBalance - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 newSupply = totalSupply + amount;
        if (newSupply > maxSupply) revert SupplyCapExceeded();
        totalSupply = newSupply;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = fromBalance - amount;
            totalSupply -= amount;
        }
        emit Transfer(from, address(0), amount);
    }
}

contract CoinVigilTokenFactory {
    event TokenCreated(
        address indexed creator,
        address indexed token,
        string name,
        string symbol,
        uint256 initialSupply,
        uint256 maxSupply,
        bool mintable,
        bool burnable
    );

    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 initialSupply,
        uint256 maxSupply,
        bool mintable,
        bool burnable
    ) external returns (address token) {
        CoinVigilERC20 created = new CoinVigilERC20(
            name,
            symbol,
            initialSupply,
            maxSupply,
            mintable,
            burnable,
            msg.sender
        );
        token = address(created);
        emit TokenCreated(msg.sender, token, name, symbol, initialSupply, maxSupply, mintable, burnable);
    }
}
