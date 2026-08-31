'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress, zeroAddress, type Abi, type Address } from 'viem';
import { CONTRACTS_CONFIGURED, FACTORY_ADDRESS } from '@/lib/contracts';
import { FEE_TIERS, priceToSqrtPriceX96 } from '@/lib/univ3Math';
import { rememberPool } from '@/hooks/usePoolList';
import factoryAbiJson from '@/lib/abi/SupraV3Factory.json';
import poolAbiJson from '@/lib/abi/SupraV3Pool.json';
import erc20AbiJson from '@/lib/abi/TestERC20.json';

const factoryAbi = factoryAbiJson as Abi;
const poolAbi = poolAbiJson as Abi;
const erc20Abi = erc20AbiJson as Abi;

function parseContractError(error: Error): string {
  const msg = error.message ?? String(error);
  if (msg.includes('User rejected')) return 'Transaction rejected.';
  return msg.length > 220 ? msg.slice(0, 220) + '...' : msg;
}

function CreatePairForm() {
  const searchParams = useSearchParams();
  const [tokenAAddr, setTokenAAddr] = useState(searchParams.get('tokenA') ?? '');
  const [tokenBAddr, setTokenBAddr] = useState(searchParams.get('tokenB') ?? '');
  const [fee, setFee] = useState(Number(searchParams.get('fee')) || FEE_TIERS[1].fee);
  const [priceInput, setPriceInput] = useState('');

  const tokenAValid = isAddress(tokenAAddr);
  const tokenBValid = isAddress(tokenBAddr);
  const bothValid = tokenAValid && tokenBValid && tokenAAddr.toLowerCase() !== tokenBAddr.toLowerCase();

  const sorted =
    bothValid && (tokenAAddr as Address).toLowerCase() < (tokenBAddr as Address).toLowerCase()
      ? { token0: tokenAAddr as Address, token1: tokenBAddr as Address, aIsToken0: true }
      : bothValid
      ? { token0: tokenBAddr as Address, token1: tokenAAddr as Address, aIsToken0: false }
      : undefined;

  const { data: tokenMetaResults } = useReadContracts({
    contracts: sorted
      ? [
          { address: sorted.token0, abi: erc20Abi, functionName: 'symbol' },
          { address: sorted.token0, abi: erc20Abi, functionName: 'decimals' },
          { address: sorted.token1, abi: erc20Abi, functionName: 'symbol' },
          { address: sorted.token1, abi: erc20Abi, functionName: 'decimals' },
        ]
      : [],
    query: { enabled: Boolean(sorted) },
  });

  const token0Symbol = tokenMetaResults?.[0]?.result as string | undefined;
  const token0Decimals = tokenMetaResults?.[1]?.result as number | undefined;
  const token1Symbol = tokenMetaResults?.[2]?.result as string | undefined;
  const token1Decimals = tokenMetaResults?.[3]?.result as number | undefined;
  const tokensResolved = Boolean(token0Symbol && token1Symbol && token0Decimals !== undefined && token1Decimals !== undefined);

  const { data: poolAddress, refetch: refetchPool } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'getPool',
    args: sorted ? [sorted.token0, sorted.token1, fee] : undefined,
    query: { enabled: Boolean(CONTRACTS_CONFIGURED && sorted) },
  });

  const poolExists = Boolean(poolAddress && poolAddress !== zeroAddress);

  const { data: slot0, refetch: refetchSlot0 } = useReadContract({
    address: poolAddress as Address | undefined,
    abi: poolAbi,
    functionName: 'slot0',
    query: { enabled: poolExists },
  });
  const slot0Data = slot0 as [bigint, ...unknown[]] | undefined;
  const initialized = Boolean(slot0Data && slot0Data[0] > 0n);

  const createPool = useWriteContract();
  const createPoolReceipt = useWaitForTransactionReceipt({ hash: createPool.data });
  useEffect(() => {
    if (createPoolReceipt.isSuccess) refetchPool();
  }, [createPoolReceipt.isSuccess, refetchPool]);

  const initialize = useWriteContract();
  const initializeReceipt = useWaitForTransactionReceipt({ hash: initialize.data });
  useEffect(() => {
    if (initializeReceipt.isSuccess) refetchSlot0();
    if (initializeReceipt.isSuccess && sorted && poolAddress) {
      rememberPool({ pool: poolAddress as Address, token0: sorted.token0, token1: sorted.token1, fee });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializeReceipt.isSuccess, refetchSlot0]);

  function handleCreatePool() {
    if (!sorted) return;
    createPool.reset();
    createPool.mutate({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: 'createPool',
      args: [sorted.token0, sorted.token1, fee],
    });
  }

  const price = parseFloat(priceInput);
  const priceValid = Number.isFinite(price) && price > 0;

  function handleInitialize() {
    if (!poolAddress || !priceValid || token0Decimals === undefined || token1Decimals === undefined || !sorted) return;
    // priceInput is entered as "Token B per Token A"; convert to token1-per-token0 terms depending on
    // which side ended up as token0 after address sort.
    const priceToken1PerToken0 = sorted.aIsToken0 ? price : 1 / price;
    const sqrtPriceX96 = priceToSqrtPriceX96(priceToken1PerToken0, token0Decimals, token1Decimals);

    initialize.reset();
    initialize.mutate({
      address: poolAddress as Address,
      abi: poolAbi,
      functionName: 'initialize',
      args: [sqrtPriceX96],
    });
  }

  const errorMessage = createPool.error
    ? parseContractError(createPool.error)
    : initialize.error
    ? parseContractError(initialize.error)
    : null;

  if (!CONTRACTS_CONFIGURED) {
    return (
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-sm text-gray-500">
        Contracts haven&apos;t been deployed yet. Fill in <code>frontend/.env.local</code> to enable this
        page.
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-800 p-6 flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Create Pair</h1>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-gray-500">Token A address</label>
        <input
          className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 font-mono text-sm outline-none"
          placeholder="0x..."
          value={tokenAAddr}
          onChange={(e) => setTokenAAddr(e.target.value.trim())}
        />
        {tokenAAddr && !tokenAValid && <div className="text-xs text-red-500">Not a valid address.</div>}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-gray-500">Token B address</label>
        <input
          className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 font-mono text-sm outline-none"
          placeholder="0x..."
          value={tokenBAddr}
          onChange={(e) => setTokenBAddr(e.target.value.trim())}
        />
        {tokenBAddr && !tokenBValid && <div className="text-xs text-red-500">Not a valid address.</div>}
        {tokenAValid && tokenBValid && !bothValid && (
          <div className="text-xs text-red-500">Token A and Token B must be different.</div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-gray-500">Fee tier</label>
        <div className="flex gap-1">
          {FEE_TIERS.map((f) => (
            <button
              key={f.fee}
              onClick={() => setFee(f.fee)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium border ${
                fee === f.fee
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-800 text-gray-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {bothValid && tokensResolved && (
        <div className="text-xs text-gray-500">
          Sorted order: token0 = {token0Symbol} ({sorted!.token0.slice(0, 8)}…), token1 = {token1Symbol} (
          {sorted!.token1.slice(0, 8)}…)
        </div>
      )}
      {bothValid && !tokensResolved && (
        <div className="text-xs text-gray-500">Looking up token symbols/decimals...</div>
      )}

      {bothValid && poolExists && initialized && (
        <div className="text-sm text-gray-500 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
          This pool already exists and is initialized.{' '}
          <Link href={`/add?token0=${sorted?.token0}&token1=${sorted?.token1}&fee=${fee}`} className="text-blue-600 dark:text-blue-400 hover:underline">
            Add liquidity
          </Link>
          .
        </div>
      )}

      {bothValid && tokensResolved && !(poolExists && initialized) && (
        <>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">
              Initial price ({token1Symbol} per {token0Symbol})
              {sorted?.aIsToken0 === false && ` — i.e. ${token0Symbol} per ${token1Symbol} inverted`}
            </label>
            <input
              className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 outline-none"
              placeholder="e.g. 1600"
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
            />
          </div>

          {!poolExists ? (
            <button
              onClick={handleCreatePool}
              disabled={createPool.isPending || createPoolReceipt.isLoading}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
            >
              {createPool.isPending || createPoolReceipt.isLoading ? 'Creating pool...' : 'Create Pool'}
            </button>
          ) : (
            <button
              onClick={handleInitialize}
              disabled={!priceValid || initialize.isPending || initializeReceipt.isLoading}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
            >
              {initialize.isPending || initializeReceipt.isLoading ? 'Initializing...' : 'Initialize Price'}
            </button>
          )}
        </>
      )}

      {initializeReceipt.isSuccess && (
        <div className="text-sm text-green-600">
          Pool initialized.{' '}
          <Link href={`/add?token0=${sorted?.token0}&token1=${sorted?.token1}&fee=${fee}`} className="underline">
            Add liquidity
          </Link>
        </div>
      )}
      {errorMessage && <div className="text-sm text-red-500">{errorMessage}</div>}
    </div>
  );
}

export default function CreatePairPage() {
  return (
    <Suspense fallback={null}>
      <CreatePairForm />
    </Suspense>
  );
}
