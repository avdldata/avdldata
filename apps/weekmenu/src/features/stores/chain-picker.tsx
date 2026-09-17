'use client';

import { Check } from 'lucide-react';
import { Hint } from '@/components/ui/input';
import { cn } from '@/lib/cn';

export interface ChainOption {
  readonly chainId: string;
  readonly chainName: string;
}

/**
 * Which supermarkets may we use?
 *
 * A chain at a time, not a branch. The prices we have are per chain, so that is
 * the honest granularity — and it means the question can be answered by anyone,
 * anywhere, without us pretending to know where the branches are.
 */
export function ChainPicker({
  chains,
  selected,
  onToggle,
}: {
  chains: readonly ChainOption[];
  selected: readonly string[];
  onToggle: (chainId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <ul className="divide-line border-line bg-surface divide-y rounded-xl border">
        {chains.map((chain) => {
          const checked = selected.includes(chain.chainId);
          return (
            <li key={chain.chainId}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(chain.chainId)}
                  data-chain-id={chain.chainId}
                  className="size-5 shrink-0 accent-[var(--color-brand)]"
                />
                <span className={cn('flex-1 font-medium', !checked && 'text-ink-soft')}>
                  {chain.chainName}
                </span>
                {checked ? <Check className="text-brand size-4 shrink-0" aria-hidden /> : null}
              </label>
            </li>
          );
        })}
      </ul>
      <Hint>
        We vergelijken je boodschappen alleen bij de supermarkten die je kiest. Reisafstand wordt
        momenteel nog niet meegenomen: we weten niet waar de filialen staan, dus we doen ook niet
        alsof.
      </Hint>
    </div>
  );
}
