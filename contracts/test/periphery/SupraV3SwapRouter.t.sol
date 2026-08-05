// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Test.sol';
// Named imports throughout this file: core and periphery each vendor their own
// `TransferHelper` library, so a plain `import 'X.sol';` (which transitively flattens every
// symbol reachable from X into this file's scope) would collide. Importing only the specific
// symbols we need avoids that.
import {SupraV3Factory} from '../../src/core/SupraV3Factory.sol';
import {ISupraV3Pool} from '../../src/core/interfaces/ISupraV3Pool.sol';
import {TickMath} from '../../src/core/libraries/TickMath.sol';
import {ISupraV3MintCallback} from '../../src/core/interfaces/callback/ISupraV3MintCallback.sol';
import {SupraV3SwapRouter} from '../../src/periphery/SupraV3SwapRouter.sol';
import {ISupraV3SwapRouter} from '../../src/periphery/interfaces/ISupraV3SwapRouter.sol';
import {WETH9} from '../../src/periphery/WETH9.sol';
import {TestERC20} from '../../src/test-tokens/TestERC20.sol';

contract SupraV3SwapRouterTest is Test, ISupraV3MintCallback {
    SupraV3Factory factory;
    WETH9 weth;
    SupraV3SwapRouter router;

    TestERC20 tokenA;
    TestERC20 tokenB;
    TestERC20 tokenC;

    int24 constant LOW_TICK = -60000;
    int24 constant HIGH_TICK = 60000;

    function setUp() public {
        factory = new SupraV3Factory();
        weth = new WETH9();
        router = new SupraV3SwapRouter(address(factory), address(weth));

        tokenA = new TestERC20('Token A', 'TKA', 18, 100_000_000 ether);
        tokenB = new TestERC20('Token B', 'TKB', 18, 100_000_000 ether);
        tokenC = new TestERC20('Token C', 'TKC', 18, 100_000_000 ether);

        _createAndSeedPool(tokenA, tokenB);
        _createAndSeedPool(tokenB, tokenC);

        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        tokenC.approve(address(router), type(uint256).max);
    }

    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data) external override {
        (address token0, address token1) = abi.decode(data, (address, address));
        if (amount0Owed > 0) TestERC20(token0).transfer(msg.sender, amount0Owed);
        if (amount1Owed > 0) TestERC20(token1).transfer(msg.sender, amount1Owed);
    }

    function _createAndSeedPool(TestERC20 x, TestERC20 y) internal {
        (address token0, address token1) = address(x) < address(y) ? (address(x), address(y)) : (address(y), address(x));
        address poolAddr = factory.createPool(token0, token1, 3000);
        ISupraV3Pool pool = ISupraV3Pool(poolAddr);
        pool.initialize(TickMath.getSqrtRatioAtTick(0));
        pool.mint(address(this), LOW_TICK, HIGH_TICK, 1_000_000_000_000_000_000_000_000, abi.encode(token0, token1));
    }

    function test_ExactInputSingle() public {
        uint256 balBefore = tokenB.balanceOf(address(this));

        uint256 amountOut = router.exactInputSingle(
            ISupraV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(tokenA),
                tokenOut: address(tokenB),
                fee: 3000,
                recipient: address(this),
                deadline: block.timestamp + 1,
                amountIn: 1 ether,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );

        assertTrue(amountOut > 0);
        assertEq(tokenB.balanceOf(address(this)), balBefore + amountOut);
    }

    function test_ExactInput_MultiHop() public {
        uint256 balBefore = tokenC.balanceOf(address(this));

        bytes memory path =
            abi.encodePacked(address(tokenA), uint24(3000), address(tokenB), uint24(3000), address(tokenC));

        uint256 amountOut = router.exactInput(
            ISupraV3SwapRouter.ExactInputParams({
                path: path,
                recipient: address(this),
                deadline: block.timestamp + 1,
                amountIn: 1 ether,
                amountOutMinimum: 0
            })
        );

        assertTrue(amountOut > 0);
        assertEq(tokenC.balanceOf(address(this)), balBefore + amountOut);
    }

    function test_ExactOutputSingle() public {
        uint256 balBefore = tokenB.balanceOf(address(this));
        uint256 desiredOut = 1 ether;

        uint256 amountIn = router.exactOutputSingle(
            ISupraV3SwapRouter.ExactOutputSingleParams({
                tokenIn: address(tokenA),
                tokenOut: address(tokenB),
                fee: 3000,
                recipient: address(this),
                deadline: block.timestamp + 1,
                amountOut: desiredOut,
                amountInMaximum: 2 ether,
                sqrtPriceLimitX96: 0
            })
        );

        assertTrue(amountIn > 0);
        assertEq(tokenB.balanceOf(address(this)), balBefore + desiredOut);
    }

    function test_RevertWhen_DeadlinePassed() public {
        vm.expectRevert();
        router.exactInputSingle(
            ISupraV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(tokenA),
                tokenOut: address(tokenB),
                fee: 3000,
                recipient: address(this),
                deadline: block.timestamp - 1,
                amountIn: 1 ether,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function test_RevertWhen_SlippageExceeded() public {
        vm.expectRevert();
        router.exactInputSingle(
            ISupraV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(tokenA),
                tokenOut: address(tokenB),
                fee: 3000,
                recipient: address(this),
                deadline: block.timestamp + 1,
                amountIn: 1 ether,
                amountOutMinimum: type(uint256).max,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
