// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Test.sol';
import '../../src/core/SupraV3Factory.sol';
import '../../src/core/interfaces/ISupraV3Pool.sol';

contract SupraV3FactoryTest is Test {
    SupraV3Factory factory;
    address tokenA = address(0x1000);
    address tokenB = address(0x2000);

    function setUp() public {
        factory = new SupraV3Factory();
    }

    function test_DefaultFeeTiers() public {
        assertEq(int256(factory.feeAmountTickSpacing(500)), int256(10));
        assertEq(int256(factory.feeAmountTickSpacing(3000)), int256(60));
        assertEq(int256(factory.feeAmountTickSpacing(10000)), int256(200));
    }

    function test_OwnerIsDeployer() public {
        assertEq(factory.owner(), address(this));
    }

    function test_CreatePool() public {
        address pool = factory.createPool(tokenA, tokenB, 3000);
        assertTrue(pool != address(0));

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        assertEq(factory.getPool(token0, token1, 3000), pool);
        assertEq(factory.getPool(token1, token0, 3000), pool);

        ISupraV3Pool p = ISupraV3Pool(pool);
        assertEq(p.token0(), token0);
        assertEq(p.token1(), token1);
        assertEq(uint256(p.fee()), uint256(3000));
        assertEq(int256(p.tickSpacing()), int256(60));
        assertEq(p.factory(), address(factory));
    }

    function test_RevertWhen_CreatePoolSameToken() public {
        vm.expectRevert();
        factory.createPool(tokenA, tokenA, 3000);
    }

    function test_RevertWhen_CreatePoolInvalidFee() public {
        vm.expectRevert();
        factory.createPool(tokenA, tokenB, 1234);
    }

    function test_RevertWhen_CreatePoolAlreadyExists() public {
        factory.createPool(tokenA, tokenB, 3000);
        vm.expectRevert();
        factory.createPool(tokenA, tokenB, 3000);
    }

    function test_EnableFeeAmount() public {
        factory.enableFeeAmount(100, 1);
        assertEq(int256(factory.feeAmountTickSpacing(100)), int256(1));
    }

    function test_RevertWhen_EnableFeeAmountNotOwner() public {
        vm.prank(address(0xdead));
        vm.expectRevert();
        factory.enableFeeAmount(100, 1);
    }

    function test_SetOwner() public {
        factory.setOwner(address(0xbeef));
        assertEq(factory.owner(), address(0xbeef));
    }

    function test_RevertWhen_SetOwnerNotOwner() public {
        vm.prank(address(0xdead));
        vm.expectRevert();
        factory.setOwner(address(0xbeef));
    }
}
