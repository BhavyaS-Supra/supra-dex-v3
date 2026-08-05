import { http, createConfig, createStorage, cookieStorage } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { supraEvmDevnet } from './chains';

// Registered as a named connector (rather than constructed inline at click time) so wagmi
// can track and reconnect it like any other connector.
const starkeyConnector = injected({
  target: {
    id: 'starkey',
    name: 'StarKey',
    provider: () => (typeof window !== 'undefined' ? window.starkey?.ethereum : undefined),
  },
});

export const config = createConfig({
  chains: [supraEvmDevnet],
  connectors: [
    starkeyConnector,
    injected(), // Falls back to any other injected provider (e.g. MetaMask)
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
