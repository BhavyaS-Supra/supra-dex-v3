'use client';

import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatEther } from 'viem';

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  if (isConnected) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-mono text-sm">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </div>
          {balance && (
            <div className="text-xs text-gray-500">
              {parseFloat(formatEther(balance.value)).toFixed(4)} {balance.symbol}
            </div>
          )}
        </div>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const hasStarKey = typeof window !== 'undefined' && !!window.starkey?.ethereum;

  return (
    <div className="flex gap-2">
      {hasStarKey && (
        <button
          onClick={() =>
            connect({
              connector: injected({
                target: {
                  id: 'starkey',
                  name: 'StarKey',
                  provider: () => (typeof window !== 'undefined' ? window.starkey?.ethereum : undefined),
                },
              }),
            })
          }
          className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
        >
          Connect StarKey
        </button>
      )}
      <button
        onClick={() => connect({ connector: injected() })}
        className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
      >
        {hasStarKey ? 'Connect MetaMask' : 'Connect Wallet'}
      </button>
    </div>
  );
}
