'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWallet } from '@/components/ConnectWallet';

const LINKS = [
  { href: '/', label: 'Swap' },
  { href: '/pools', label: 'Pools' },
  { href: '/add', label: 'Add Liquidity' },
  { href: '/remove', label: 'Remove Liquidity' },
  { href: '/create', label: 'Create Pair' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="w-full flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-6">
        <span className="font-semibold whitespace-nowrap">Supra V3</span>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-100 dark:bg-gray-800 text-foreground'
                    : 'text-gray-500 hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <ConnectWallet />
    </header>
  );
}
