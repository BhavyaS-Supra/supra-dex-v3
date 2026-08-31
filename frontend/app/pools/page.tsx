'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useReadContracts } from 'wagmi';
import { formatUnits, type Abi, type Address } from 'viem';
import { usePoolList } from '@/hooks/usePoolList';
import { useTokenMetadata } from '@/hooks/useTokenMetadata';
import { CONTRACTS_CONFIGURED } from '@/lib/contracts';
import { sqrtPriceX96ToPrice, FEE_TIERS } from '@/lib/univ3Math';
import poolAbiJson from '@/lib/abi/SupraV3Pool.json';
import erc20AbiJson from '@/lib/abi/TestERC20.json';

const poolAbi = poolAbiJson as Abi;
const erc20Abi = erc20AbiJson as Abi;

function feeLabel(fee: number): string {
  return FEE_TIERS.find((f) => f.fee === fee)?.label ?? `${fee / 10_000}%`;
}

function formatAmount(value: bigint, decimals: number): string {
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function PoolsPage() {
  const { pools, isLoading: poolsLoading } = usePoolList();

  const poolStateContracts = useMemo(
    () =>
      pools.flatMap((p) => [
        { address: p.pool, abi: poolAbi, functionName: 'slot0' } as const,
        { address: p.token0, abi: erc20Abi, functionName: 'balanceOf', args: [p.pool] } as const,
        { address: p.token1, abi: erc20Abi, functionName: 'balanceOf', args: [p.pool] } as const,
      ]),
    [pools]
  );

  const { data: poolState, isLoading: stateLoading } = useReadContracts({
    contracts: poolStateContracts,
    query: { enabled: pools.length > 0 },
  });

  const tokenAddresses = useMemo(() => pools.flatMap((p) => [p.token0, p.token1]), [pools]);
  const { data: tokenMeta } = useTokenMetadata(tokenAddresses);

  if (!CONTRACTS_CONFIGURED) {
    return (
      <div className="w-full max-w-4xl rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-sm text-gray-500">
        Contracts haven&apos;t been deployed yet. Fill in <code>frontend/.env.local</code> to enable this
        page.
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pools</h1>
        <Link
          href="/create"
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Create Pair
        </Link>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Pair</th>
              <th className="px-4 py-3 font-medium">Fee</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Reserves (TVL)</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(poolsLoading || stateLoading) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Loading pools...
                </td>
              </tr>
            )}
            {!poolsLoading && pools.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No pools found among the configured tokens yet.
                </td>
              </tr>
            )}
            {pools.map((p, i) => {
              const slot0 = poolState?.[i * 3]?.result as
                | [bigint, number, number, number, number, number, boolean]
                | undefined;
              const balance0 = poolState?.[i * 3 + 1]?.result as bigint | undefined;
              const balance1 = poolState?.[i * 3 + 2]?.result as bigint | undefined;
              const token0Meta = tokenMeta[p.token0.toLowerCase()];
              const token1Meta = tokenMeta[p.token1.toLowerCase()];

              const initialized = slot0 !== undefined && slot0[0] > 0n;
              const price =
                initialized && slot0 && token0Meta && token1Meta
                  ? sqrtPriceX96ToPrice(slot0[0], token0Meta.decimals, token1Meta.decimals)
                  : undefined;

              return (
                <tr key={p.pool} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="px-4 py-3 font-medium">
                    {token0Meta?.symbol ?? `${p.token0.slice(0, 6)}…`} /{' '}
                    {token1Meta?.symbol ?? `${p.token1.slice(0, 6)}…`}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{feeLabel(p.fee)}</td>
                  <td className="px-4 py-3">
                    {!initialized
                      ? 'Not initialized'
                      : price !== undefined
                      ? `${price.toPrecision(6)} ${token1Meta?.symbol}/${token0Meta?.symbol}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {balance0 !== undefined && token0Meta
                      ? `${formatAmount(balance0, token0Meta.decimals)} ${token0Meta.symbol}`
                      : '—'}
                    {' + '}
                    {balance1 !== undefined && token1Meta
                      ? `${formatAmount(balance1, token1Meta.decimals)} ${token1Meta.symbol}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/add?token0=${p.token0 as Address}&token1=${p.token1 as Address}&fee=${p.fee}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Add liquidity
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
