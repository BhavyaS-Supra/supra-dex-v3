'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACTS_CONFIGURED, QUOTER_ADDRESS, SWAP_ROUTER_ADDRESS, TOKEN_LIST } from '@/lib/contracts';
import swapRouterAbi from '@/lib/abi/SupraV3SwapRouter.json';
import quoterAbi from '@/lib/abi/QuoterV2.json';
import erc20Abi from '@/lib/abi/TestERC20.json';

const FEE_TIER = 3000; // 0.3% - matches the default fee tier enabled by SupraV3Factory
const DEFAULT_SLIPPAGE_BPS = 50n; // 0.5%
const DEADLINE_SECONDS = 20 * 60; // 20 minutes

function parseContractError(error: Error): string {
  const msg = error.message ?? String(error);
  if (msg.includes('User rejected')) return 'Transaction rejected.';
  return msg.length > 200 ? msg.slice(0, 200) + '...' : msg;
}

function getDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
}

export function SwapCard() {
  const { address, isConnected } = useAccount();

  const [tokenInSymbol, setTokenInSymbol] = useState(TOKEN_LIST[0]?.symbol);
  const [tokenOutSymbol, setTokenOutSymbol] = useState(TOKEN_LIST[1]?.symbol);
  const [amountIn, setAmountIn] = useState('');
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);

  const tokenIn = TOKEN_LIST.find((t) => t.symbol === tokenInSymbol);
  const tokenOut = TOKEN_LIST.find((t) => t.symbol === tokenOutSymbol);

  const parsedAmountIn = useMemo(() => {
    if (!tokenIn || !amountIn) return undefined;
    try {
      return parseUnits(amountIn, tokenIn.decimals);
    } catch {
      return undefined;
    }
  }, [amountIn, tokenIn]);

  const quoteEnabled = Boolean(
    CONTRACTS_CONFIGURED && tokenIn && tokenOut && tokenIn.address !== tokenOut.address && parsedAmountIn
  );

  const {
    data: quoteData,
    isFetching: isQuoting,
    error: quoteError,
  } = useReadContract({
    address: QUOTER_ADDRESS,
    abi: quoterAbi,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn: tokenIn?.address,
        tokenOut: tokenOut?.address,
        amountIn: parsedAmountIn ?? 0n,
        fee: FEE_TIER,
        sqrtPriceLimitX96: 0n,
      },
    ],
    query: { enabled: quoteEnabled },
  });

  const amountOut = (quoteData as [bigint, bigint, number, bigint] | undefined)?.[0];

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenIn?.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && tokenIn ? [address, SWAP_ROUTER_ADDRESS] : undefined,
    query: { enabled: Boolean(address && tokenIn && CONTRACTS_CONFIGURED) },
  });

  const needsApproval = Boolean(
    parsedAmountIn && (allowance === undefined || (allowance as bigint) < parsedAmountIn)
  );

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      refetchAllowance();
    }
  }, [approveReceipt.isSuccess, refetchAllowance]);

  const swap = useWriteContract();
  const swapReceipt = useWaitForTransactionReceipt({ hash: swap.data });

  const errorMessage = swap.error
    ? parseContractError(swap.error)
    : approve.error
    ? parseContractError(approve.error)
    : quoteError
    ? `Failed to fetch quote: ${parseContractError(quoteError)}`
    : null;

  function handleApprove() {
    if (!tokenIn) return;
    approve.reset();
    approve.mutate({
      address: tokenIn.address,
      abi: erc20Abi,
      functionName: 'approve',
      args: [SWAP_ROUTER_ADDRESS, parsedAmountIn ?? 0n],
    });
  }

  function handleSwap() {
    if (!tokenIn || !tokenOut || !address || !parsedAmountIn || amountOut === undefined) return;
    swap.reset();

    const amountOutMinimum = (amountOut * (10_000n - slippageBps)) / 10_000n;
    const deadline = getDeadline();

    swap.mutate({
      address: SWAP_ROUTER_ADDRESS,
      abi: swapRouterAbi,
      functionName: 'exactInputSingle',
      args: [
        {
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          fee: FEE_TIER,
          recipient: address,
          deadline,
          amountIn: parsedAmountIn,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
  }

  if (!CONTRACTS_CONFIGURED || TOKEN_LIST.length < 2) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-sm text-gray-500">
        Contracts haven&apos;t been deployed yet. Run the scripts in <code>contracts/script</code>,
        then fill in <code>frontend/.env.local</code> (factory/router/quoter addresses and
        <code> NEXT_PUBLIC_TOKEN_LIST</code>) to enable the swap UI.
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Swap</h2>
        <label className="text-xs text-gray-500 flex items-center gap-1">
          Slippage
          <select
            className="bg-transparent border border-gray-300 dark:border-gray-700 rounded px-1 py-0.5"
            value={slippageBps.toString()}
            onChange={(e) => setSlippageBps(BigInt(e.target.value))}
          >
            <option value="10">0.1%</option>
            <option value="50">0.5%</option>
            <option value="100">1%</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>You pay</span>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-transparent text-2xl outline-none"
            placeholder="0.0"
            inputMode="decimal"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
          />
          <select
            className="bg-gray-100 dark:bg-gray-800 rounded-lg px-2 font-medium"
            value={tokenInSymbol}
            onChange={(e) => setTokenInSymbol(e.target.value)}
          >
            {TOKEN_LIST.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>You receive (estimated)</span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1 text-2xl">
            {isQuoting
              ? '...'
              : quoteError
              ? '—'
              : amountOut !== undefined && tokenOut
              ? formatUnits(amountOut, tokenOut.decimals)
              : '0.0'}
          </div>
          <select
            className="bg-gray-100 dark:bg-gray-800 rounded-lg px-2 font-medium"
            value={tokenOutSymbol}
            onChange={(e) => setTokenOutSymbol(e.target.value)}
          >
            {TOKEN_LIST.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isConnected ? (
        <button disabled className="w-full py-3 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-500">
          Connect wallet to swap
        </button>
      ) : needsApproval ? (
        <button
          onClick={handleApprove}
          disabled={approve.isPending || approveReceipt.isLoading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
        >
          {approve.isPending || approveReceipt.isLoading ? 'Approving...' : `Approve ${tokenIn?.symbol}`}
        </button>
      ) : (
        <button
          onClick={handleSwap}
          disabled={!parsedAmountIn || amountOut === undefined || swap.isPending || swapReceipt.isLoading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
        >
          {swap.isPending || swapReceipt.isLoading ? 'Swapping...' : 'Swap'}
        </button>
      )}

      {swapReceipt.isSuccess && (
        <div className="text-sm text-green-600">Swap confirmed: {swap.data}</div>
      )}
      {errorMessage && <div className="text-sm text-red-500">{errorMessage}</div>}
    </div>
  );
}
