import { defineChain } from 'viem';
import { sepolia } from 'viem/chains';

// Chain ID / RPC URL are read from env vars, since this app targets whichever network is
// configured there (Supra EVM Devnet by default, Sepolia during testing). Everything downstream
// (wagmi config, wallet UI) derives its network name/id from this export rather than hardcoding one.
const configuredChainId = Number(process.env.NEXT_PUBLIC_SUPRA_EVM_CHAIN_ID) || 222;

const rpcUrl = process.env.NEXT_PUBLIC_SUPRA_EVM_RPC_URL;

// Supra EVM is not in viem's built-in chain list, so it's defined manually here.
const supraEvmDevnetChain = defineChain({
  id: configuredChainId,
  name: 'Supra EVM Devnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [rpcUrl || 'https://rpc-multivm.supra.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'SupraScan MultiVM',
      url: 'https://multivm.suprascan.io',
    },
  },
});

export const supraEvmDevnet =
  configuredChainId === sepolia.id
    ? defineChain({ ...sepolia, rpcUrls: rpcUrl ? { default: { http: [rpcUrl] } } : sepolia.rpcUrls })
    : supraEvmDevnetChain;
