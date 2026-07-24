// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Script.sol';
import {SupraV3Factory} from '../src/core/SupraV3Factory.sol';

/// @notice Deploys the SupraV3Factory. Run with `--rpc-url <network> --broadcast --private-key <key>`
/// when you're ready to go live - this script is NOT invoked automatically by anything in this repo.
contract DeployCore is Script {
    function run() external returns (SupraV3Factory factory) {
        vm.startBroadcast();

        factory = new SupraV3Factory();
        console.log('SupraV3Factory deployed to:', address(factory));

        vm.stopBroadcast();
    }
}
