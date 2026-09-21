const DIRECT_RPC_URL = process.env.NEXT_PUBLIC_SUPRA_EVM_RPC_URL || 'https://rpc-multivm.supra.com';

// The Supra devnet RPC is HTTP-only, so an HTTPS page can't call it from the browser (mixed
// content). In that case, browser requests go through the /api/rpc proxy route instead. Server-side
// requests (SSR) always use the direct URL, since a relative URL can't be resolved there.
export function getRpcUrl(): string {
  if (typeof window === 'undefined') return DIRECT_RPC_URL;
  const useProxy =
    window.location.protocol === 'https:' || process.env.NEXT_PUBLIC_RPC_PROXY === 'true';
  return useProxy ? '/api/rpc' : DIRECT_RPC_URL;
}
