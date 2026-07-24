import { ConnectWallet } from '@/components/ConnectWallet';
import { SwapCard } from '@/components/SwapCard';

export default function Home() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <header className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <span className="font-semibold">Supra V3 Swap</span>
        <ConnectWallet />
      </header>
      <main className="flex flex-1 w-full items-start justify-center py-16 px-4">
        <SwapCard />
      </main>
    </div>
  );
}
