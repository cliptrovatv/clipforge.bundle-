'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/streamers', label: 'Streamers' },
  { href: '/recordings', label: 'Recordings' },
];

export function Tabs() {
  const path = usePathname();
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'active' : ''}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
