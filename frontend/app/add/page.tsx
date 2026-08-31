'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits, type Abi, type Address } from 'viem';
import {
  CONTRACTS_CONFIGURED,
  FACTORY_ADDRESS,
  POSITION_MANAGER_ADDRESS,
  POSITION_MANAGER_CONFIGURED,
  TOKEN_LIST,
  type TokenInfo,
} from '@/lib/contracts';
import {
  FEE_TIERS,
  MAX_TICK,
  MIN_TICK,
  nearestUsableTick,
  priceToTick,
  sqrtPriceX96ToPrice,
  suggestAmount0FromAmount1,
  suggestAmount1FromAmount0,
  tickToPrice,
  tickSpacingForFee,
} from '@/lib/univ3Math';
import factoryAbiJson from '@/lib/abi/SupraV3Factory.json';
import poolAbiJson from '@/lib/abi/SupraV3Pool.json';
import positionManagerAbiJson from '@/lib/abi/SupraV3PositionManager.json';
import erc20AbiJson from '@/lib/abi/TestERC20.json';
import { PriceRangeChart } from '@/components/PriceRangeChart';

const factoryAbi = factoryAbiJson as Abi;
const poolAbi = poolAbiJson as Abi;
const positionManagerAbi = positionManagerAbiJson as Abi;
const erc20Abi = erc20AbiJson as Abi;

const DEFAULT_SLIPPAGE_BPS = 50n; // 0.5%
const DEADLINE_SECONDS = 20 * 60;

function parseContractError(error: Error): string {
  const msg = error.message ?? String(error);
  if (msg.includes('User rejected')) return 'Transaction rejected.';
  return msg.length > 220 ? msg.slice(0, 220) + '...' : msg;
}

function AddLiquidityForm() {
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();

  const [tokenASymbol, setTokenASymbol] = useState(
    TOKEN_LIST.find((t) => t.address.toLowerCase() === searchParams.get('token0')?.toLowerCase())
      ?.symbol ?? TOKEN_LIST[0]?.symbol
  );
  const [tokenBSymbol, setTokenBSymbol] = useState(
    TOKEN_LIST.find((t) => t.address.toLowerCase() === searchParams.get('token1')?.toLowerCase())
      ?.symbol ?? TOKEN_LIST[1]?.symbol
  );
  const [fee, setFee] = useState(Number(searchParams.get('fee')) || FEE_TIERS[1].fee);

  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [amount0Input, setAmount0Input] = useState('');
  const [amount1Input, setAmount1Input] = useState('');
  const [lastEdited, setLastEdited] = useState<'amount0' | 'amount1'>('amount0');
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);

  const tokenA = TOKEN_LIST.find((t) => t.symbol === tokenASymbol);
  const tokenB = TOKEN_LIST.find((t) => t.symbol === tokenBSymbol);

  // Pool storage is keyed by sorted address order; the mint call must use that same order.
  const sorted: [TokenInfo, TokenInfo] | undefined =
    tokenA && tokenB && tokenA.address.toLowerCase() !== tokenB.address.toLowerCase()
      ? tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
        ? [tokenA, tokenB]
        : [tokenB, tokenA]
      : undefined;
  const [token0, token1] = sorted ?? [undefined, undefined];

  const tickSpacing = tickSpacingForFee(fee);

  const { data: poolAddress } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'getPool',
    args: token0 && token1 ? [token0.address, token1.address, fee] : undefined,
    query: { enabled: Boolean(CONTRACTS_CONFIGURED && token0 && token1) },
  });

  const poolExists = Boolean(poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000');

  const { data: slot0, refetch: refetchSlot0 } = useReadContract({
    address: poolAddress as Address | undefined,
    abi: poolAbi,
    functionName: 'slot0',
    query: { enabled: poolExists },
  });

  const slot0Data = slot0 as [bigint, number, number, number, number, number, boolean] | undefined;
  const initialized = Boolean(slot0Data && slot0Data[0] > 0n);

  const currentPrice =
    token0 && token1 && slot0Data && initialized
      ? sqrtPriceX96ToPrice(slot0Data[0], token0.decimals, token1.decimals)
      : undefined;

  // Range inputs default to roughly ±20% around the current price until the user edits them -
  // derived on render rather than seeded via effect, so there's no state to keep in sync.
  const defaultMinPrice = currentPrice !== undefined ? currentPrice * 0.8 : undefined;
  const defaultMaxPrice = currentPrice !== undefined ? currentPrice * 1.2 : undefined;
  const effectiveMinPriceInput = minPriceInput || (defaultMinPrice !== undefined ? defaultMinPrice.toPrecision(6) : '');
  const effectiveMaxPriceInput = maxPriceInput || (defaultMaxPrice !== undefined ? defaultMaxPrice.toPrecision(6) : '');

  const minPrice = parseFloat(effectiveMinPriceInput);
  const maxPrice = parseFloat(effectiveMaxPriceInput);
  const rangeValid = Number.isFinite(minPrice) && Number.isFinite(maxPrice) && minPrice > 0 && minPrice < maxPrice;

  const tickLower =
    rangeValid && token0 && token1
      ? nearestUsableTick(priceToTick(minPrice, token0.decimals, token1.decimals), tickSpacing)
      : undefined;
  const tickUpper =
    rangeValid && token0 && token1
      ? nearestUsableTick(priceToTick(maxPrice, token0.decimals, token1.decimals), tickSpacing)
      : undefined;

  // Suggests the paired amount to roughly match the current price and range. Called directly from
  // the range/amount change handlers (with the just-typed value threaded through explicitly, since
  // state from the same event hasn't committed yet) rather than from an effect.
  function suggestFromAmount0(amount0Str: string, min: number, max: number) {
    if (currentPrice === undefined || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || min >= max)
      return;
    const amt0 = parseFloat(amount0Str);
    if (!Number.isFinite(amt0) || amt0 <= 0) return;
    const suggested = suggestAmount1FromAmount0(amt0, currentPrice, min, max);
    if (Number.isFinite(suggested)) setAmount1Input(suggested.toPrecision(6));
  }

  function suggestFromAmount1(amount1Str: string, min: number, max: number) {
    if (currentPrice === undefined || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || min >= max)
      return;
    const amt1 = parseFloat(amount1Str);
    if (!Number.isFinite(amt1) || amt1 <= 0) return;
    const suggested = suggestAmount0FromAmount1(amt1, currentPrice, min, max);
    if (Number.isFinite(suggested)) setAmount0Input(suggested.toPrecision(6));
  }

  function resyncPairedAmount(min: number, max: number) {
    if (lastEdited === 'amount0') suggestFromAmount0(amount0Input, min, max);
    else suggestFromAmount1(amount1Input, min, max);
  }

  function handleMinPriceChange(value: string) {
    setMinPriceInput(value);
    const min = parseFloat(value || (defaultMinPrice !== undefined ? defaultMinPrice.toPrecision(6) : ''));
    resyncPairedAmount(min, maxPrice);
  }

  function handleMaxPriceChange(value: string) {
    setMaxPriceInput(value);
    const max = parseFloat(value || (defaultMaxPrice !== undefined ? defaultMaxPrice.toPrecision(6) : ''));
    resyncPairedAmount(minPrice, max);
  }

  function handleAmount0Change(value: string) {
    setLastEdited('amount0');
    setAmount0Input(value);
    suggestFromAmount0(value, minPrice, maxPrice);
  }

  function handleAmount1Change(value: string) {
    setLastEdited('amount1');
    setAmount1Input(value);
    suggestFromAmount1(value, minPrice, maxPrice);
  }

  function setFullRange() {
    if (!token0 || !token1) return;
    const min = tickToPrice(MIN_TICK, token0.decimals, token1.decimals);
    const max = tickToPrice(MAX_TICK, token0.decimals, token1.decimals);
    setMinPriceInput(min.toPrecision(6));
    setMaxPriceInput(max.toPrecision(6));
    resyncPairedAmount(min, max);
  }

  const parsedAmount0 = useMemo(() => {
    if (!token0 || !amount0Input) return undefined;
    try {
      return parseUnits(amount0Input, token0.decimals);
    } catch {
      return undefined;
    }
  }, [amount0Input, token0]);

  const parsedAmount1 = useMemo(() => {
    if (!token1 || !amount1Input) return undefined;
    try {
      return parseUnits(amount1Input, token1.decimals);
    } catch {
      return undefined;
    }
  }, [amount1Input, token1]);

  const { data: allowances, refetch: refetchAllowances } = useReadContracts({
    contracts: [
      {
        address: token0?.address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address && token0 ? [address, POSITION_MANAGER_ADDRESS] : undefined,
      },
      {
        address: token1?.address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address && token1 ? [address, POSITION_MANAGER_ADDRESS] : undefined,
      },
    ],
    query: { enabled: Boolean(address && token0 && token1 && POSITION_MANAGER_CONFIGURED) },
  });

  const allowance0 = allowances?.[0]?.result as bigint | undefined;
  const allowance1 = allowances?.[1]?.result as bigint | undefined;

  const needsApproval0 = Boolean(parsedAmount0 && (allowance0 === undefined || allowance0 < parsedAmount0));
  const needsApproval1 = Boolean(parsedAmount1 && (allowance1 === undefined || allowance1 < parsedAmount1));

  const approve0 = useWriteContract();
  const approve0Receipt = useWaitForTransactionReceipt({ hash: approve0.data });
  const approve1 = useWriteContract();
  const approve1Receipt = useWaitForTransactionReceipt({ hash: approve1.data });

  useEffect(() => {
    if (approve0Receipt.isSuccess || approve1Receipt.isSuccess) refetchAllowances();
  }, [approve0Receipt.isSuccess, approve1Receipt.isSuccess, refetchAllowances]);

  const mint = useWriteContract();
  const mintReceipt = useWaitForTransactionReceipt({ hash: mint.data });

  useEffect(() => {
    if (mintReceipt.isSuccess) refetchSlot0();
  }, [mintReceipt.isSuccess, refetchSlot0]);

  function handleApprove(token: TokenInfo, amount: bigint) {
    (token === token0 ? approve0 : approve1).mutate({
      address: token.address,
      abi: erc20Abi,
      functionName: 'approve',
      args: [POSITION_MANAGER_ADDRESS, amount],
    });
  }

  function handleMint() {
    if (
      !token0 ||
      !token1 ||
      !address ||
      tickLower === undefined ||
      tickUpper === undefined ||
      parsedAmount0 === undefined ||
      parsedAmount1 === undefined
    )
      return;

    mint.reset();
    const amount0Min = (parsedAmount0 * (10_000n - slippageBps)) / 10_000n;
    const amount1Min = (parsedAmount1 * (10_000n - slippageBps)) / 10_000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

    mint.mutate({
      address: POSITION_MANAGER_ADDRESS,
      abi: positionManagerAbi,
      functionName: 'mint',
      args: [
        {
          token0: token0.address,
          token1: token1.address,
          fee,
          tickLower,
          tickUpper,
          amount0Desired: parsedAmount0,
          amount1Desired: parsedAmount1,
          amount0Min,
          amount1Min,
          recipient: address,
          deadline,
        },
      ],
    });
  }

  const errorMessage = mint.error
    ? parseContractError(mint.error)
    : approve0.error
    ? parseContractError(approve0.error)
    : approve1.error
    ? parseContractError(approve1.error)
    : null;

  if (!CONTRACTS_CONFIGURED || !POSITION_MANAGER_CONFIGURED || TOKEN_LIST.length < 2) {
    return (
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-sm text-gray-500">
        Contracts haven&apos;t been fully configured yet. Make sure{' '}
        <code>NEXT_PUBLIC_POSITION_MANAGER_ADDRESS</code> and <code>NEXT_PUBLIC_TOKEN_LIST</code> are set
        in <code>frontend/.env.local</code>.
      </div>
    );
  }

  const canMint =
    isConnected &&
    poolExists &&
    initialized &&
    !needsApproval0 &&
    !needsApproval1 &&
    parsedAmount0 !== undefined &&
    parsedAmount1 !== undefined &&
    parsedAmount0 > 0n &&
    parsedAmount1 > 0n &&
    tickLower !== undefined &&
    tickUpper !== undefined &&
    tickLower < tickUpper;

  return (
    <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-800 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Add Liquidity</h1>
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

      <div className="grid grid-cols-2 gap-2">
        <select
          className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 font-medium"
          value={tokenASymbol}
          onChange={(e) => setTokenASymbol(e.target.value)}
        >
          {TOKEN_LIST.map((t) => (
            <option key={t.symbol} value={t.symbol}>
              {t.symbol}
            </option>
          ))}
        </select>
        <select
          className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 font-medium"
          value={tokenBSymbol}
          onChange={(e) => setTokenBSymbol(e.target.value)}
        >
          {TOKEN_LIST.map((t) => (
            <option key={t.symbol} value={t.symbol}>
              {t.symbol}
            </option>
          ))}
        </select>
      </div>

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

      {!sorted ? (
        <div className="text-sm text-gray-500">Choose two different tokens.</div>
      ) : !poolExists ? (
        <div className="text-sm text-gray-500 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
          This pool doesn&apos;t exist yet.{' '}
          <Link href={`/create?tokenA=${token0?.address}&tokenB=${token1?.address}&fee=${fee}`} className="text-blue-600 dark:text-blue-400 hover:underline">
            Create it first
          </Link>
          .
        </div>
      ) : !initialized ? (
        <div className="text-sm text-gray-500 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
          This pool exists but hasn&apos;t been initialized with a starting price yet.{' '}
          <Link href={`/create?tokenA=${token0?.address}&tokenB=${token1?.address}&fee=${fee}`} className="text-blue-600 dark:text-blue-400 hover:underline">
            Initialize it
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Price range</span>
              <button onClick={setFullRange} className="text-blue-600 dark:text-blue-400 hover:underline">
                Full range
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-2">
                <div className="text-xs text-gray-500">Min price</div>
                <input
                  className="w-full bg-transparent outline-none"
                  inputMode="decimal"
                  value={effectiveMinPriceInput}
                  onChange={(e) => handleMinPriceChange(e.target.value)}
                />
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-2">
                <div className="text-xs text-gray-500">Max price</div>
                <input
                  className="w-full bg-transparent outline-none"
                  inputMode="decimal"
                  value={effectiveMaxPriceInput}
                  onChange={(e) => handleMaxPriceChange(e.target.value)}
                />
              </div>
            </div>
            {currentPrice !== undefined && token0 && token1 && (
              <PriceRangeChart
                currentPrice={currentPrice}
                minPrice={minPrice}
                maxPrice={maxPrice}
                baseSymbol={token0.symbol}
                quoteSymbol={token1.symbol}
              />
            )}
            {!rangeValid && (effectiveMinPriceInput || effectiveMaxPriceInput) && (
              <div className="text-xs text-red-500">Min price must be positive and less than max price.</div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-xs text-gray-500 mb-1">{token0?.symbol} amount</div>
            <input
              className="w-full bg-transparent text-xl outline-none"
              placeholder="0.0"
              inputMode="decimal"
              value={amount0Input}
              onChange={(e) => handleAmount0Change(e.target.value)}
            />
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-xs text-gray-500 mb-1">{token1?.symbol} amount</div>
            <input
              className="w-full bg-transparent text-xl outline-none"
              placeholder="0.0"
              inputMode="decimal"
              value={amount1Input}
              onChange={(e) => handleAmount1Change(e.target.value)}
            />
          </div>

          {!isConnected ? (
            <button disabled className="w-full py-3 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-500">
              Connect wallet
            </button>
          ) : needsApproval0 ? (
            <button
              onClick={() => token0 && parsedAmount0 && handleApprove(token0, parsedAmount0)}
              disabled={approve0.isPending || approve0Receipt.isLoading}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
            >
              {approve0.isPending || approve0Receipt.isLoading ? 'Approving...' : `Approve ${token0?.symbol}`}
            </button>
          ) : needsApproval1 ? (
            <button
              onClick={() => token1 && parsedAmount1 && handleApprove(token1, parsedAmount1)}
              disabled={approve1.isPending || approve1Receipt.isLoading}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
            >
              {approve1.isPending || approve1Receipt.isLoading ? 'Approving...' : `Approve ${token1?.symbol}`}
            </button>
          ) : (
            <button
              onClick={handleMint}
              disabled={!canMint || mint.isPending || mintReceipt.isLoading}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
            >
              {mint.isPending || mintReceipt.isLoading ? 'Adding liquidity...' : 'Add Liquidity'}
            </button>
          )}

          {mintReceipt.isSuccess && (
            <div className="text-sm text-green-600">
              Position minted:{' '}
              <a
                className="underline"
                href={`https://sepolia.etherscan.io/tx/${mint.data}`}
                target="_blank"
                rel="noreferrer"
              >
                {mint.data?.slice(0, 10)}...
              </a>{' '}
              — view it on the <Link href="/remove" className="underline">Remove Liquidity</Link> page.
            </div>
          )}
          {errorMessage && <div className="text-sm text-red-500">{errorMessage}</div>}
        </>
      )}
    </div>
  );
}

export default function AddLiquidityPage() {
  return (
    <Suspense fallback={null}>
      <AddLiquidityForm />
    </Suspense>
  );
}
