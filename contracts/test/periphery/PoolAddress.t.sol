// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Test.sol';
import '../../src/core/SupraV3Pool.sol';
import '../../src/periphery/libraries/PoolAddress.sol';

contract PoolAddressTest is Test {
    /// @notice PoolAddress.POOL_INIT_CODE_HASH must match SupraV3Pool's actual creation code hash.
    /// Any change to SupraV3Pool.sol (or compiler/optimizer settings) changes this hash, and a stale
    /// constant silently breaks CREATE2 pool address derivation used across the periphery contracts.
    function test_PoolInitCodeHashMatchesCreationCode() public pure {
        assertEq(keccak256(type(SupraV3Pool).creationCode), PoolAddress.POOL_INIT_CODE_HASH);
    }
}
