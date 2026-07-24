// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Script.sol';
import {TestERC20} from '../src/test-tokens/TestERC20.sol';

/// @notice Deploys two mintable test tokens for exercising pools/router/UI on a devnet or
/// testnet. Not part of the protocol - convenience only. NOT invoked automatically.
contract DeployTestTokens is Script {
    function run() external returns (TestERC20 tokenA, TestERC20 tokenB) {
        vm.startBroadcast();

        tokenA = new TestERC20('Supra Test USD', 'tUSD', 6, 1_000_000 * 1e6);
        console.log('tUSD deployed to:', address(tokenA));

        tokenB = new TestERC20('Supra Test ETH', 'tETH', 18, 1_000 ether);
        console.log('tETH deployed to:', address(tokenB));

        vm.stopBroadcast();
    }
}
