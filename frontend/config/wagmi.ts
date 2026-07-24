import { http, createConfig, createStorage, cookieStorage } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { supraEvmDevnet } from './chains';

export const config = createConfig({
  chains: [supraEvmDevnet],
  connectors: [
    injected(), // Auto-detects StarKey's injected EVM provider and MetaMask
  ],
  transports: {
    // Always pass an explicit URL to http() - calling it with no argument does not reliably
    // resolve a custom chain's RPC URL.
    [supraEvmDevnet.id]: http(
      process.env.NEXT_PUBLIC_SUPRA_EVM_RPC_URL || 'https://rpc-multivm.supra.com'
    ),
  },
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
