// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Test.sol';
import {SupraV3Factory} from '../../src/core/SupraV3Factory.sol';
import {TickMath} from '../../src/core/libraries/TickMath.sol';
import {SupraV3PositionManager} from '../../src/periphery/SupraV3PositionManager.sol';
import {ISupraV3PositionManager} from '../../src/periphery/interfaces/ISupraV3PositionManager.sol';
import {SupraV3PositionDescriptor} from '../../src/periphery/SupraV3PositionDescriptor.sol';
import {WETH9} from '../../src/periphery/WETH9.sol';
import {TestERC20} from '../../src/test-tokens/TestERC20.sol';

contract SupraV3PositionManagerTest is Test {
    SupraV3Factory factory;
    WETH9 weth;
    SupraV3PositionDescriptor descriptor;
    SupraV3PositionManager positionManager;

    TestERC20 tokenA;
    TestERC20 tokenB;
    address token0;
    address token1;

    int24 constant LOW_TICK = -60000;
    int24 constant HIGH_TICK = 60000;

    function setUp() public {
        factory = new SupraV3Factory();
        weth = new WETH9();
        descriptor = new SupraV3PositionDescriptor();
        positionManager = new SupraV3PositionManager(address(factory), address(weth), address(descriptor));

        tokenA = new TestERC20('Token A', 'TKA', 18, 1_000_000 ether);
        tokenB = new TestERC20('Token B', 'TKB', 18, 1_000_000 ether);
        (token0, token1) = address(tokenA) < address(tokenB) ? (address(tokenA), address(tokenB)) : (address(tokenB), address(tokenA));

        positionManager.createAndInitializePoolIfNecessary(token0, token1, 3000, TickMath.getSqrtRatioAtTick(0));

        tokenA.approve(address(positionManager), type(uint256).max);
        tokenB.approve(address(positionManager), type(uint256).max);
    }

    function _mintPosition() internal returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        (tokenId, liquidity, amount0, amount1) = positionManager.mint(
            ISupraV3PositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: 3000,
                tickLower: LOW_TICK,
                tickUpper: HIGH_TICK,
                amount0Desired: 10 ether,
                amount1Desired: 10 ether,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + 1
            })
        );
    }

    function test_Mint() public {
        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = _mintPosition();

        assertEq(tokenId, 1);
        assertTrue(liquidity > 0);
        assertTrue(amount0 > 0 && amount1 > 0);
        assertEq(positionManager.ownerOf(tokenId), address(this));

        (, , address posToken0, address posToken1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 posLiquidity, , , , ) =
            positionManager.positions(tokenId);
        assertEq(posToken0, token0);
        assertEq(posToken1, token1);
        assertEq(uint256(fee), uint256(3000));
        assertEq(int256(tickLower), int256(LOW_TICK));
        assertEq(int256(tickUpper), int256(HIGH_TICK));
        assertEq(uint256(posLiquidity), uint256(liquidity));
    }

    function test_IncreaseLiquidity() public {
        (uint256 tokenId, uint128 liquidity, , ) = _mintPosition();

        // increaseLiquidity returns the liquidity *delta* added, not the new total
        (uint128 addedLiquidity, , ) = positionManager.increaseLiquidity(
            ISupraV3PositionManager.IncreaseLiquidityParams({
                tokenId: tokenId,
                amount0Desired: 1 ether,
                amount1Desired: 1 ether,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 1
            })
        );

        assertTrue(addedLiquidity > 0);

        (, , , , , , , uint128 totalLiquidity, , , , ) = positionManager.positions(tokenId);
        assertEq(uint256(totalLiquidity), uint256(liquidity) + uint256(addedLiquidity));
    }

    function test_DecreaseLiquidityAndCollect() public {
        (uint256 tokenId, uint128 liquidity, , ) = _mintPosition();

        (uint256 amount0, uint256 amount1) = positionManager.decreaseLiquidity(
            ISupraV3PositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 1
            })
        );
        assertTrue(amount0 > 0 && amount1 > 0);

        uint256 balBefore0 = tokenA.balanceOf(address(this));
        uint256 balBefore1 = tokenB.balanceOf(address(this));

        (uint256 collected0, uint256 collected1) = positionManager.collect(
            ISupraV3PositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        assertEq(collected0, amount0);
        assertEq(collected1, amount1);
        assertTrue(tokenA.balanceOf(address(this)) >= balBefore0);
        assertTrue(tokenB.balanceOf(address(this)) >= balBefore1);
    }

    function test_BurnAfterFullWithdraw() public {
        (uint256 tokenId, uint128 liquidity, , ) = _mintPosition();

        positionManager.decreaseLiquidity(
            ISupraV3PositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 1
            })
        );
        positionManager.collect(
            ISupraV3PositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        positionManager.burn(tokenId);
        vm.expectRevert();
        positionManager.ownerOf(tokenId);
    }

    function test_TokenURI() public {
        (uint256 tokenId, , , ) = _mintPosition();
        string memory uri = positionManager.tokenURI(tokenId);
        assertTrue(bytes(uri).length > 0);
    }
}
