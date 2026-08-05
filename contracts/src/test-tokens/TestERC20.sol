// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/// @title Mintable ERC20 for local/testnet swap testing against Supra V3
/// @notice Not part of the protocol itself - a convenience token for exercising pools/router/UI.
contract TestERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 initialSupply)
        ERC20(name_, symbol_)
    {
        _setupDecimals(decimals_);
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
