// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Script.sol';
import {WETH9} from '../src/periphery/WETH9.sol';
import {SupraV3PositionDescriptor} from '../src/periphery/SupraV3PositionDescriptor.sol';
import {SupraV3SwapRouter} from '../src/periphery/SupraV3SwapRouter.sol';
import {SupraV3PositionManager} from '../src/periphery/SupraV3PositionManager.sol';
import {QuoterV2} from '../src/periphery/lens/QuoterV2.sol';
import {TickLens} from '../src/periphery/lens/TickLens.sol';

/// @notice Deploys the periphery contracts against an already-deployed SupraV3Factory.
/// Run `DeployCore.s.sol` first and pass its address via the FACTORY_ADDRESS env var, e.g.
///
///   FACTORY_ADDRESS=0x... forge script script/DeployPeriphery.s.sol \
///     --rpc-url <network> --broadcast --private-key <key>
///
/// This script is NOT invoked automatically by anything in this repo - deployment is left to you.
contract DeployPeriphery is Script {
    function run()
        external
        returns (
            WETH9 weth,
            SupraV3PositionDescriptor descriptor,
            SupraV3SwapRouter router,
            SupraV3PositionManager positionManager,
            QuoterV2 quoter,
            TickLens tickLens
        )
    {
        address factory = vm.envAddress('FACTORY_ADDRESS');

        vm.startBroadcast();

        weth = new WETH9();
        console.log('WETH9 deployed to:', address(weth));

        descriptor = new SupraV3PositionDescriptor();
        console.log('SupraV3PositionDescriptor deployed to:', address(descriptor));

        router = new SupraV3SwapRouter(factory, address(weth));
        console.log('SupraV3SwapRouter deployed to:', address(router));

        positionManager = new SupraV3PositionManager(factory, address(weth), address(descriptor));
        console.log('SupraV3PositionManager deployed to:', address(positionManager));

        quoter = new QuoterV2(factory, address(weth));
        console.log('QuoterV2 deployed to:', address(quoter));

        tickLens = new TickLens();
        console.log('TickLens deployed to:', address(tickLens));

        vm.stopBroadcast();
    }
}
