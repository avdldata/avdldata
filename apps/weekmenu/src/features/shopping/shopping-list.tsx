'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CATEGORY_LABELS, formatEuro, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/cn';
import { clearShoppingListAction, toggleShoppingItemAction } from '@/features/planner/actions';
import type { ShoppingGroup, ShoppingList } from './build-list';

export interface ChainTab {
  readonly id: string;
  readonly name: string;
}

export function ShoppingListView({
  list,
  chains,
}: {
  list: ShoppingList;
  chains: readonly ChainTab[];
}) {
  const [tab, setTab] = useState<string>('alles');
  const [, startTransition] = useTransition();
  const [checkedKeys, setCheckedKeys] = useOptimistic(
    new Set(
      list.groups.flatMap((group) => group.lines.filter((l) => l.checked).map((l) => l.key)),
    ),
    (current: Set<string>, update: { key: string; checked: boolean }) => {
      const next = new Set(current);
      if (update.checked) next.add(update.key);
      else next.delete(update.key);
      return next;
    },
  );

  const toggle = (key: string, checked: boolean) => {
    startTransition(async () => {
      setCheckedKeys({ key, checked });
      await toggleShoppingItemAction(key, checked);
    });
  };

  const reset = () => {
    startTransition(async () => {
      await clearShoppingListAction();
    });
  };

  const groups: readonly ShoppingGroup[] =
    tab === 'alles' ? list.groups : (list.byChain.get(tab) ?? []);
  const visibleTotal = groups.reduce((sum, group) => sum + group.subtotalCents, 0);
  const done = [...checkedKeys].length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div>
            <p className="stat-label">Totaal boodschappen</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatEuro(list.totalCents)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-ink-soft tabular-nums">
              {done} van {list.lineCount} afgevinkt
            </p>
            {done > 0 ? (
              <Button variant="ghost" size="sm" className="mt-1" onClick={reset}>
                <RotateCcw className="size-4" aria-hidden />
                Alles wissen
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {chains.length > 1 ? (
        <div role="tablist" aria-label="Filter op winkel" className="flex flex-wrap gap-2">
          {[{ id: 'alles', name: 'Alles' }, ...chains].map((chain) => (
            <button
              key={chain.id}
              role="tab"
              aria-selected={tab === chain.id}
              onClick={() => setTab(chain.id)}
              className={cn(
                'rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium transition-colors',
                tab === chain.id
                  ? 'bg-brand text-brand-ink'
                  : 'border border-line-strong text-ink-soft hover:bg-surface-muted',
              )}
            >
              {chain.name}
            </button>
          ))}
        </div>
      ) : null}

      {tab !== 'alles' ? (
        <p className="text-sm text-ink-soft">
          Subtotaal bij {chains.find((c) => c.id === tab)?.name}:{' '}
          <span className="font-semibold">{formatEuro(visibleTotal)}</span>
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.category}>
          <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-ink-soft">
            <span>{CATEGORY_LABELS[group.category] ?? group.category}</span>
            <span className="tabular-nums">{formatEuro(group.subtotalCents)}</span>
          </h2>
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
            {group.lines.map((line) => {
              const isChecked = checkedKeys.has(line.key);
              return (
                <li key={line.key}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => toggle(line.key, event.target.checked)}
                      className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]"
                      aria-label={`${line.ingredientName} afvinken`}
                    />
                    <span className={cn('min-w-0 flex-1', isChecked && 'opacity-50')}>
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className={cn('font-medium', isChecked && 'line-through')}>
                          {line.units}× {line.ingredientName}
                        </span>
                        {line.promotionLabel ? (
                          <Badge variant="promo">{line.promotionLabel}</Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-faint">
                        {line.productName} · {formatQuantity(line.packageAmount, line.unit)} per
                        verpakking · samen {formatQuantity(line.totalAmount, line.unit)}
                      </span>
                      {line.leftoverAmount > 0 ? (
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          Je hebt {formatQuantity(line.requiredAmount, line.unit)} nodig, dus{' '}
                          {formatQuantity(line.leftoverAmount, line.unit)} houd je over.
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">
                        {formatEuro(line.priceCents)}
                      </span>
                      {line.savingsCents > 0 ? (
                        <span className="block text-xs text-promo tabular-nums">
                          −{formatEuro(line.savingsCents)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {list.pantrySubtotalCents > 0 ? (
        <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Kruiden, olie en andere voorraadartikelen zijn goed voor{' '}
          <span className="font-semibold">{formatEuro(list.pantrySubtotalCents)}</span> van dit
          bedrag. Heb je die al in huis, dan valt je week zoveel lager uit.
        </p>
      ) : null}

      {list.unavailable.length > 0 ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Niet verkrijgbaar bij de gekozen supermarkten:{' '}
          {list.unavailable.map((item) => item.name).join(', ')}. Voeg een winkel toe of vervang het
          bijbehorende gerecht.
        </p>
      ) : null}
    </div>
  );
}
