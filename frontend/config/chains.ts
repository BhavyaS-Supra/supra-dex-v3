import { defineChain } from 'viem';

// Supra EVM is not in viem's built-in chain list, so it's defined manually here.
// Chain ID / RPC URL are read from env vars - placeholders until you deploy and configure them.
export const supraEvmDevnet = defineChain({
  id: Number(process.env.NEXT_PUBLIC_SUPRA_EVM_CHAIN_ID) || 34448,
  name: 'Supra EVM Devnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_SUPRA_EVM_RPC_URL || 'https://rpc-multivm.supra.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'SupraScan MultiVM',
      url: 'https://multivm.suprascan.io',
    },
  },
});
