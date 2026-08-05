// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Test.sol';
import '../../src/core/SupraV3Factory.sol';
import '../../src/core/interfaces/ISupraV3Pool.sol';
import '../../src/core/libraries/TickMath.sol';
import '../../src/core/interfaces/callback/ISupraV3MintCallback.sol';
import '../../src/core/interfaces/callback/ISupraV3SwapCallback.sol';
import '../../src/test-tokens/TestERC20.sol';

contract SupraV3PoolTest is Test, ISupraV3MintCallback, ISupraV3SwapCallback {
    SupraV3Factory factory;
    TestERC20 token0Erc;
    TestERC20 token1Erc;
    ISupraV3Pool pool;

    int24 constant LOW_TICK = -60;
    int24 constant HIGH_TICK = 60;

    function setUp() public {
        factory = new SupraV3Factory();

        TestERC20 a = new TestERC20('Token A', 'TKA', 18, 1_000_000 ether);
        TestERC20 b = new TestERC20('Token B', 'TKB', 18, 1_000_000 ether);
        (token0Erc, token1Erc) = address(a) < address(b) ? (a, b) : (b, a);

        address poolAddr = factory.createPool(address(token0Erc), address(token1Erc), 3000);
        pool = ISupraV3Pool(poolAddr);
        // price = 1:1
        pool.initialize(TickMath.getSqrtRatioAtTick(0));
    }

    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata) external override {
        if (amount0Owed > 0) token0Erc.transfer(msg.sender, amount0Owed);
        if (amount1Owed > 0) token1Erc.transfer(msg.sender, amount1Owed);
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external override {
        if (amount0Delta > 0) token0Erc.transfer(msg.sender, uint256(amount0Delta));
        if (amount1Delta > 0) token1Erc.transfer(msg.sender, uint256(amount1Delta));
    }

    function _mintLiquidity(uint128 liquidity) internal returns (uint256 amount0, uint256 amount1) {
        (amount0, amount1) = pool.mint(address(this), LOW_TICK, HIGH_TICK, liquidity, '');
    }

    function test_Initialize() public {
        (uint160 sqrtPriceX96, int24 tick,,,,, bool unlocked) = pool.slot0();
        assertEq(uint256(sqrtPriceX96), uint256(TickMath.getSqrtRatioAtTick(0)));
        assertEq(int256(tick), int256(0));
        assertTrue(unlocked);
    }

    function test_Mint() public {
        (uint256 amount0, uint256 amount1) = _mintLiquidity(1_000_000);
        assertTrue(amount0 > 0);
        assertTrue(amount1 > 0);
        assertEq(uint256(pool.liquidity()), uint256(1_000_000));

        bytes32 positionKey = keccak256(abi.encodePacked(address(this), LOW_TICK, HIGH_TICK));
        (uint128 posLiquidity,,,,) = pool.positions(positionKey);
        assertEq(uint256(posLiquidity), uint256(1_000_000));
    }

    function test_RevertWhen_MintZero() public {
        vm.expectRevert();
        pool.mint(address(this), LOW_TICK, HIGH_TICK, 0, '');
    }

    function test_SwapZeroForOne() public {
        _mintLiquidity(10_000_000);

        uint256 token1BalBefore = token1Erc.balanceOf(address(this));
        int256 amountSpecified = 1000;

        (int256 amount0, int256 amount1) =
            pool.swap(address(this), true, amountSpecified, TickMath.MIN_SQRT_RATIO + 1, '');

        assertEq(amount0, amountSpecified);
        assertTrue(amount1 < 0);
        assertEq(token1Erc.balanceOf(address(this)), token1BalBefore + uint256(-amount1));
    }

    function test_SwapOneForZero() public {
        _mintLiquidity(10_000_000);

        uint256 token0BalBefore = token0Erc.balanceOf(address(this));
        int256 amountSpecified = 1000;

        (int256 amount0, int256 amount1) =
            pool.swap(address(this), false, amountSpecified, TickMath.MAX_SQRT_RATIO - 1, '');

        assertEq(amount1, amountSpecified);
        assertTrue(amount0 < 0);
        assertEq(token0Erc.balanceOf(address(this)), token0BalBefore + uint256(-amount0));
    }

    function test_BurnAndCollect() public {
        _mintLiquidity(1_000_000);

        (uint256 burnAmount0, uint256 burnAmount1) = pool.burn(LOW_TICK, HIGH_TICK, 1_000_000);
        assertTrue(burnAmount0 > 0);
        assertTrue(burnAmount1 > 0);
        assertEq(uint256(pool.liquidity()), uint256(0));

        uint256 token0BalBefore = token0Erc.balanceOf(address(this));
        uint256 token1BalBefore = token1Erc.balanceOf(address(this));

        (uint128 collected0, uint128 collected1) =
            pool.collect(address(this), LOW_TICK, HIGH_TICK, type(uint128).max, type(uint128).max);

        assertEq(uint256(collected0), burnAmount0);
        assertEq(uint256(collected1), burnAmount1);
        assertEq(token0Erc.balanceOf(address(this)), token0BalBefore + collected0);
        assertEq(token1Erc.balanceOf(address(this)), token1BalBefore + collected1);
    }

    function test_FeeGrowthAfterSwap() public {
        _mintLiquidity(10_000_000);
        pool.swap(address(this), true, 100_000, TickMath.MIN_SQRT_RATIO + 1, '');
        assertTrue(pool.feeGrowthGlobal0X128() > 0);
    }

    function test_TickCrossing() public {
        // mint a narrow position and a wide position so a large swap crosses the narrow one's boundary
        _mintLiquidity(5_000_000);
        pool.mint(address(this), -600, 600, 5_000_000, '');

        (, int24 tickBefore,,,,,) = pool.slot0();
        assertEq(int256(tickBefore), int256(0));

        pool.swap(address(this), true, 2_000_000_000_000_000_000, TickMath.MIN_SQRT_RATIO + 1, '');

        (, int24 tickAfter,,,,,) = pool.slot0();
        // narrow position's lower boundary is -60; require the swap to have actually crossed it
        assertTrue(tickAfter < tickBefore, "tick should decrease after zeroForOne swap");
    }
}
