// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Script.sol';
import '../src/core/SupraV3Pool.sol';

/// @notice Hashes SupraV3Pool's creation bytecode so PoolAddress.POOL_INIT_CODE_HASH can be
/// kept in sync after any change to SupraV3Pool.sol (renaming/forking changes bytecode, which
/// changes this hash from Uniswap's original value).
contract ComputeInitCodeHash is Script {
    function run() external pure {
        bytes32 hash = keccak256(type(SupraV3Pool).creationCode);
        console.log('POOL_INIT_CODE_HASH:');
        console.logBytes32(hash);
    }
}
