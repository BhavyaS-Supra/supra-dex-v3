'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useReadContracts } from 'wagmi';
import type { Abi, Address } from 'viem';
import { CONTRACTS_CONFIGURED, FACTORY_ADDRESS, TOKEN_LIST } from '@/lib/contracts';
import { FEE_TIERS } from '@/lib/univ3Math';
import factoryAbiJson from '@/lib/abi/SupraV3Factory.json';

const factoryAbi = factoryAbiJson as Abi;

export interface PoolListEntry {
  pool: Address;
  token0: Address;
  token1: Address;
  fee: number;
}

const STORAGE_KEY = 'supra-dex-known-pools';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// localStorage is an external store from React's perspective, so it's read via
// useSyncExternalStore (with an empty-array server snapshot) rather than useState+effect - that
// avoids both a hydration mismatch and a setState-in-effect render cascade.
const EMPTY_POOLS: PoolListEntry[] = [];
const storeListeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSnapshot: PoolListEntry[] = EMPTY_POOLS;

function readStoredPools(): PoolListEntry[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  try {
    cachedSnapshot = raw ? (JSON.parse(raw) as PoolListEntry[]) : EMPTY_POOLS;
  } catch {
    cachedSnapshot = EMPTY_POOLS;
  }
  return cachedSnapshot;
}

function getSnapshot(): PoolListEntry[] {
  return typeof window === 'undefined' ? EMPTY_POOLS : readStoredPools();
}

// Must return the same reference every call - a fresh array here would make
// useSyncExternalStore think the snapshot changes on every render and loop forever.
function getServerSnapshot(): PoolListEntry[] {
  return EMPTY_POOLS;
}

function subscribe(callback: () => void): () => void {
  storeListeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    storeListeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

/// Records a pool this browser created via /create, so it shows up on the Pools page even if it
/// involves a token outside NEXT_PUBLIC_TOKEN_LIST. Safe to call from an effect or event handler.
export function rememberPool(entry: PoolListEntry) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readStoredPools();
    if (existing.some((p) => p.pool.toLowerCase() === entry.pool.toLowerCase())) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, entry]));
    storeListeners.forEach((cb) => cb());
  } catch {
    // Ignore storage errors (private browsing, quota, etc.) - this is a convenience cache only.
  }
}

/// Lists known pools. SupraV3Factory has no on-chain enumeration (only getPool(tokenA, tokenB, fee)
/// for a specific pair), and scanning PoolCreated logs from the deployment block isn't reliable here -
/// free-tier RPC providers (e.g. Alchemy's free plan) cap eth_getLogs to a ~10 block range, so a scan
/// over tens of thousands of blocks just silently fails. Instead this checks getPool for every
/// NEXT_PUBLIC_TOKEN_LIST pair across all fee tiers (cheap eth_call reads, no range limits), merged
/// with any pool this browser has created via /create (cached in localStorage since it may involve
/// tokens outside the list).
export function usePoolList(): { pools: PoolListEntry[]; isLoading: boolean } {
  const storedPools = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const candidatePairs = useMemo(() => {
    const pairs: { token0: Address; token1: Address }[] = [];
    for (let i = 0; i < TOKEN_LIST.length; i++) {
      for (let j = i + 1; j < TOKEN_LIST.length; j++) {
        const a = TOKEN_LIST[i].address;
        const b = TOKEN_LIST[j].address;
        pairs.push(a.toLowerCase() < b.toLowerCase() ? { token0: a, token1: b } : { token0: b, token1: a });
      }
    }
    return pairs;
  }, []);

  const contracts = useMemo(
    () =>
      candidatePairs.flatMap((pair) =>
        FEE_TIERS.map((f) => ({
          address: FACTORY_ADDRESS,
          abi: factoryAbi,
          functionName: 'getPool',
          args: [pair.token0, pair.token1, f.fee],
        }))
      ),
    [candidatePairs]
  );

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: CONTRACTS_CONFIGURED && contracts.length > 0 },
  });

  const discovered = useMemo(() => {
    const results: PoolListEntry[] = [];
    candidatePairs.forEach((pair, i) => {
      FEE_TIERS.forEach((f, j) => {
        const result = data?.[i * FEE_TIERS.length + j]?.result as Address | undefined;
        if (result && result !== ZERO_ADDRESS) {
          results.push({ pool: result, token0: pair.token0, token1: pair.token1, fee: f.fee });
        }
      });
    });
    return results;
  }, [candidatePairs, data]);

  const pools = useMemo(() => {
    const map = new Map<string, PoolListEntry>();
    for (const p of [...discovered, ...storedPools]) map.set(p.pool.toLowerCase(), p);
    return Array.from(map.values());
  }, [discovered, storedPools]);

  return { pools, isLoading: isLoading && contracts.length > 0 };
}
