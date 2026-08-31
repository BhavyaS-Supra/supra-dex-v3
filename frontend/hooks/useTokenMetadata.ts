'use client';

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import type { Abi, Address } from 'viem';
import erc20AbiJson from '@/lib/abi/TestERC20.json';
import { findToken } from '@/lib/contracts';

const erc20Abi = erc20AbiJson as Abi;

export interface TokenMeta {
  address: Address;
  symbol: string;
  decimals: number;
}

/// Resolves symbol/decimals for a set of token addresses. Addresses already in NEXT_PUBLIC_TOKEN_LIST
/// are answered from that config; anything else (e.g. a pool discovered on-chain, or an address typed
/// into the Create Pair form) is looked up via ERC20 reads.
export function useTokenMetadata(addresses: (Address | undefined)[]): {
  data: Record<string, TokenMeta>;
  isLoading: boolean;
} {
  const unique = useMemo(() => {
    const set = new Set<string>();
    for (const a of addresses) if (a) set.add(a.toLowerCase());
    return Array.from(set) as Address[];
  }, [addresses]);

  const toFetch = useMemo(() => unique.filter((a) => !findToken(a)), [unique]);

  const { data, isLoading } = useReadContracts({
    contracts: toFetch.flatMap((address) => [
      { address, abi: erc20Abi, functionName: 'symbol' },
      { address, abi: erc20Abi, functionName: 'decimals' },
    ]),
    query: { enabled: toFetch.length > 0 },
  });

  const result = useMemo(() => {
    const map: Record<string, TokenMeta> = {};
    for (const a of unique) {
      const known = findToken(a);
      if (known) {
        map[a] = { address: known.address, symbol: known.symbol, decimals: known.decimals };
      }
    }
    toFetch.forEach((address, i) => {
      const symbolResult = data?.[i * 2];
      const decimalsResult = data?.[i * 2 + 1];
      if (symbolResult?.status === 'success' && decimalsResult?.status === 'success') {
        map[address] = {
          address,
          symbol: symbolResult.result as string,
          decimals: Number(decimalsResult.result),
        };
      }
    });
    return map;
  }, [unique, toFetch, data]);

  return { data: result, isLoading: isLoading && toFetch.length > 0 };
}
