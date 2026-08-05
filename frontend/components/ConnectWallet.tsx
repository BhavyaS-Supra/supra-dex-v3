'use client';

import { useAccount, useConnect, useDisconnect, useBalance, useSwitchChain } from 'wagmi';
import { formatEther } from 'viem';
import { supraEvmDevnet } from '@/config/chains';

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: balance } = useBalance({ address });

  const wrongNetwork = isConnected && chainId !== supraEvmDevnet.id;

  if (isConnected && wrongNetwork) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-red-500">Wrong network</span>
        <button
          onClick={() => switchChain({ chainId: supraEvmDevnet.id })}
          disabled={isSwitching}
          className="px-3 py-1.5 rounded-lg bg-yellow-500 text-white text-sm hover:bg-yellow-600 transition-colors disabled:opacity-50"
        >
          {isSwitching ? 'Switching...' : `Switch to ${supraEvmDevnet.name}`}
        </button>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

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
  const starkeyConnector = connectors.find((c) => c.id === 'starkey');
  const fallbackConnector = connectors.find((c) => c.id !== 'starkey') ?? connectors[0];

  return (
    <div className="flex gap-2">
      {hasStarKey && starkeyConnector && (
        <button
          onClick={() => connect({ connector: starkeyConnector })}
          className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
        >
          Connect StarKey
        </button>
      )}
      {fallbackConnector && (
        <button
          onClick={() => connect({ connector: fallbackConnector })}
          className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          {hasStarKey ? 'Connect MetaMask' : 'Connect Wallet'}
        </button>
      )}
    </div>
  );
}
