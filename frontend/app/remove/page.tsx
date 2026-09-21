'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useAccount,
  useReadContract,
  useReadContracts,
  
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useWriteContractWithGas } from '@/hooks/useWriteContractWithGas';
import { formatUnits, zeroAddress, type Abi, type Address } from 'viem';
import {
  CONTRACTS_CONFIGURED,
  FACTORY_ADDRESS,
  POSITION_MANAGER_ADDRESS,
  POSITION_MANAGER_CONFIGURED,
} from '@/lib/contracts';
import { FEE_TIERS, getAmountsForLiquidity, tickToPrice } from '@/lib/univ3Math';
import { useTokenMetadata, type TokenMeta } from '@/hooks/useTokenMetadata';
import factoryAbiJson from '@/lib/abi/SupraV3Factory.json';
import poolAbiJson from '@/lib/abi/SupraV3Pool.json';
import positionManagerAbiJson from '@/lib/abi/SupraV3PositionManager.json';

const factoryAbi = factoryAbiJson as Abi;
const poolAbi = poolAbiJson as Abi;
const positionManagerAbi = positionManagerAbiJson as Abi;

const DEADLINE_SECONDS = 20 * 60;
const MAX_UINT128 = 2n ** 128n - 1n;
const PERCENT_OPTIONS = [25, 50, 75, 100];
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

interface Position {
  tokenId: bigint;
  token0: Address;
  token1: Address;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

function feeLabel(fee: number): string {
  return FEE_TIERS.find((f) => f.fee === fee)?.label ?? `${fee / 10_000}%`;
}

function formatAmount(value: bigint, decimals: number): string {
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function parseContractError(error: Error): string {
  const msg = error.message ?? String(error);
  if (msg.includes('User rejected')) return 'Transaction rejected.';
  return msg.length > 220 ? msg.slice(0, 220) + '...' : msg;
}

function PositionRow({
  position,
  token0Meta,
  token1Meta,
  onChanged,
}: {
  position: Position;
  token0Meta?: TokenMeta;
  token1Meta?: TokenMeta;
  onChanged: () => void;
}) {
  const { address } = useAccount();
  const [pct, setPct] = useState(100);

  const { data: poolAddress } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'getPool',
    args: [position.token0, position.token1, position.fee],
  });
  const poolExists = Boolean(poolAddress && poolAddress !== zeroAddress);

  const { data: slot0 } = useReadContract({
    address: poolAddress as Address | undefined,
    abi: poolAbi,
    functionName: 'slot0',
    query: { enabled: poolExists },
  });
  const sqrtPriceX96 = (slot0 as [bigint, number, ...unknown[]] | undefined)?.[0];
  const currentTick = (slot0 as [bigint, number, ...unknown[]] | undefined)?.[1];
  const inRange =
    currentTick !== undefined && currentTick >= position.tickLower && currentTick < position.tickUpper;

  const decrease = useWriteContractWithGas();
  const decreaseReceipt = useWaitForTransactionReceipt({ hash: decrease.data });
  const collect = useWriteContractWithGas();
  const collectReceipt = useWaitForTransactionReceipt({ hash: collect.data });

  useEffect(() => {
    if (decreaseReceipt.isSuccess && address) {
      collect.reset();
      collect.mutate({
        address: POSITION_MANAGER_ADDRESS,
        abi: positionManagerAbi,
        functionName: 'collect',
        args: [
          {
            tokenId: position.tokenId,
            recipient: address,
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128,
          },
        ],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decreaseReceipt.isSuccess]);

  useEffect(() => {
    if (collectReceipt.isSuccess) onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectReceipt.isSuccess]);

  const liquidityToRemove = (position.liquidity * BigInt(pct)) / 100n;

  function handleRemove() {
    if (!address || liquidityToRemove === 0n || sqrtPriceX96 === undefined) return;
    decrease.reset();
    const { amount0, amount1 } = getAmountsForLiquidity(
      sqrtPriceX96,
      position.tickLower,
      position.tickUpper,
      liquidityToRemove
    );
    const amount0Min = BigInt(Math.floor(amount0 * (1 - DEFAULT_SLIPPAGE_BPS / 10_000)));
    const amount1Min = BigInt(Math.floor(amount1 * (1 - DEFAULT_SLIPPAGE_BPS / 10_000)));
    decrease.mutate({
      address: POSITION_MANAGER_ADDRESS,
      abi: positionManagerAbi,
      functionName: 'decreaseLiquidity',
      args: [
        {
          tokenId: position.tokenId,
          liquidity: liquidityToRemove,
          amount0Min,
          amount1Min,
          deadline: BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS),
        },
      ],
    });
  }

  function handleCollectFeesOnly() {
    if (!address) return;
    collect.reset();
    collect.mutate({
      address: POSITION_MANAGER_ADDRESS,
      abi: positionManagerAbi,
      functionName: 'collect',
      args: [
        {
          tokenId: position.tokenId,
          recipient: address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        },
      ],
    });
  }

  const busy = decrease.isPending || decreaseReceipt.isLoading || collect.isPending || collectReceipt.isLoading;
  const errorMessage = decrease.error
    ? parseContractError(decrease.error)
    : collect.error
    ? parseContractError(collect.error)
    : null;

  const minPrice =
    token0Meta && token1Meta ? tickToPrice(position.tickLower, token0Meta.decimals, token1Meta.decimals) : undefined;
  const maxPrice =
    token0Meta && token1Meta ? tickToPrice(position.tickUpper, token0Meta.decimals, token1Meta.decimals) : undefined;

  const hasFees = position.tokensOwed0 > 0n || position.tokensOwed1 > 0n;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">
          {token0Meta?.symbol ?? position.token0.slice(0, 6)} / {token1Meta?.symbol ?? position.token1.slice(0, 6)}
          <span className="ml-2 text-xs text-gray-500">{feeLabel(position.fee)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">#{position.tokenId.toString()}</span>
          {poolExists && (
            <span
              className={`px-2 py-0.5 rounded-full ${
                inRange
                  ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400'
                  : 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400'
              }`}
            >
              {inRange ? 'In range' : 'Out of range'}
            </span>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Range: {minPrice !== undefined ? minPrice.toPrecision(6) : '…'} –{' '}
        {maxPrice !== undefined ? maxPrice.toPrecision(6) : '…'} {token1Meta?.symbol}/{token0Meta?.symbol}
      </div>

      {hasFees && token0Meta && token1Meta && (
        <div className="text-xs text-gray-500">
          Fees earned: {formatAmount(position.tokensOwed0, token0Meta.decimals)} {token0Meta.symbol} +{' '}
          {formatAmount(position.tokensOwed1, token1Meta.decimals)} {token1Meta.symbol}
        </div>
      )}

      {position.liquidity > 0n ? (
        <>
          <div className="flex items-center gap-2">
            {PERCENT_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPct(p)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium border ${
                  pct === p
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                    : 'border-gray-200 dark:border-gray-800 text-gray-500'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
          <button
            onClick={handleRemove}
            disabled={busy || liquidityToRemove === 0n || sqrtPriceX96 === undefined}
            className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
          >
            {busy ? 'Processing...' : `Remove ${pct}% & Collect`}
          </button>
        </>
      ) : (
        <div className="text-xs text-gray-500">All liquidity withdrawn.</div>
      )}

      {hasFees && position.liquidity > 0n && (
        <button
          onClick={handleCollectFeesOnly}
          disabled={busy}
          className="w-full py-2 rounded-xl border border-gray-200 dark:border-gray-800 text-sm font-medium disabled:opacity-50"
        >
          Collect fees only
        </button>
      )}
      {hasFees && position.liquidity === 0n && (
        <button
          onClick={handleCollectFeesOnly}
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
        >
          {busy ? 'Processing...' : 'Collect'}
        </button>
      )}

      {errorMessage && <div className="text-xs text-red-500">{errorMessage}</div>}
    </div>
  );
}

export default function RemoveLiquidityPage() {
  const { address, isConnected } = useAccount();

  const { data: balance } = useReadContract({
    address: POSITION_MANAGER_ADDRESS,
    abi: positionManagerAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && POSITION_MANAGER_CONFIGURED) },
  });

  const count = Number(balance ?? 0n);

  const { data: tokenIdResults } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: POSITION_MANAGER_ADDRESS,
      abi: positionManagerAbi,
      functionName: 'tokenOfOwnerByIndex',
      args: [address as Address, BigInt(i)],
    })),
    query: { enabled: count > 0 && Boolean(address) },
  });

  const tokenIds = useMemo(
    () =>
      (tokenIdResults ?? [])
        .map((r) => r.result as bigint | undefined)
        .filter((x): x is bigint => x !== undefined),
    [tokenIdResults]
  );

  const {
    data: positionResults,
    refetch: refetchPositions,
  } = useReadContracts({
    contracts: tokenIds.map((tokenId) => ({
      address: POSITION_MANAGER_ADDRESS,
      abi: positionManagerAbi,
      functionName: 'positions',
      args: [tokenId],
    })),
    query: { enabled: tokenIds.length > 0 },
  });

  const positions = useMemo(() => {
    return tokenIds
      .map((tokenId, i) => {
        const r = positionResults?.[i]?.result as unknown[] | undefined;
        if (!r) return undefined;
        const position: Position = {
          tokenId,
          token0: r[2] as Address,
          token1: r[3] as Address,
          fee: r[4] as number,
          tickLower: r[5] as number,
          tickUpper: r[6] as number,
          liquidity: r[7] as bigint,
          tokensOwed0: r[10] as bigint,
          tokensOwed1: r[11] as bigint,
        };
        return position;
      })
      .filter((p): p is Position => p !== undefined);
  }, [tokenIds, positionResults]);

  const tokenAddresses = useMemo(() => positions.flatMap((p) => [p.token0, p.token1]), [positions]);
  const { data: tokenMeta } = useTokenMetadata(tokenAddresses);

  if (!CONTRACTS_CONFIGURED || !POSITION_MANAGER_CONFIGURED) {
    return (
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-sm text-gray-500">
        Contracts haven&apos;t been fully configured yet. Make sure{' '}
        <code>NEXT_PUBLIC_POSITION_MANAGER_ADDRESS</code> is set in <code>frontend/.env.local</code>.
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Your Positions</h1>

      {!isConnected ? (
        <div className="text-sm text-gray-500 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          Connect your wallet to view your liquidity positions.
        </div>
      ) : count === 0 ? (
        <div className="text-sm text-gray-500 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          You don&apos;t have any positions yet.{' '}
          <Link href="/add" className="text-blue-600 dark:text-blue-400 hover:underline">
            Add liquidity
          </Link>
          .
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {positions.map((p) => (
            <PositionRow
              key={p.tokenId.toString()}
              position={p}
              token0Meta={tokenMeta[p.token0.toLowerCase()]}
              token1Meta={tokenMeta[p.token1.toLowerCase()]}
              onChanged={() => refetchPositions()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
