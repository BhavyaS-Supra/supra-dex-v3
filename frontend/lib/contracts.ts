import type { Address } from 'viem';

export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0x') as Address;
export const SWAP_ROUTER_ADDRESS = (process.env.NEXT_PUBLIC_SWAP_ROUTER_ADDRESS || '0x') as Address;
export const QUOTER_ADDRESS = (process.env.NEXT_PUBLIC_QUOTER_ADDRESS || '0x') as Address;
export const WETH9_ADDRESS = (process.env.NEXT_PUBLIC_WETH9_ADDRESS || '0x') as Address;

export const CONTRACTS_CONFIGURED =
  FACTORY_ADDRESS !== '0x' && SWAP_ROUTER_ADDRESS !== '0x' && QUOTER_ADDRESS !== '0x';

export interface TokenInfo {
  symbol: string;
  address: Address;
  decimals: number;
}

/// Parses NEXT_PUBLIC_TOKEN_LIST, a comma-separated "SYMBOL:ADDRESS:DECIMALS" list, e.g.
/// "tUSD:0xabc...:6,tETH:0xdef...:18". Nothing is deployed by default, so this is empty until
/// you fill in the env var after running the deployment scripts in ../contracts.
export const TOKEN_LIST: TokenInfo[] = (process.env.NEXT_PUBLIC_TOKEN_LIST || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [symbol, address, decimals] = entry.split(':');
    return { symbol, address: address as Address, decimals: Number(decimals || 18) };
  });
