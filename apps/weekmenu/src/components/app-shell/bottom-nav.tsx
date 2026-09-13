'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ShoppingBasket, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/week', label: 'Week', icon: CalendarDays },
  { href: '/boodschappen', label: 'Boodschappen', icon: ShoppingBasket },
  { href: '/gezin', label: 'Gezin', icon: Users },
  { href: '/instellingen', label: 'Instellingen', icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:top-0 md:bottom-auto md:border-t-0 md:border-b"
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)] md:justify-start md:gap-1 md:px-4">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors md:flex-row md:gap-2 md:py-3 md:text-sm',
                  active ? 'text-brand' : 'text-ink-faint hover:text-ink-soft',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
