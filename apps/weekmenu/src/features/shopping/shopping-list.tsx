'use client';

import { useState, useTransition } from 'react';
import { RotateCcw, TrendingDown } from 'lucide-react';
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

/**
 * Ticking things off.
 *
 * The state is held locally and written through to the server in the
 * background: a checklist has to respond the instant you tap it, and there is
 * nothing to re-render on the server in between. The parent remounts this
 * component when the plan changes, so a freshly generated week starts unticked.
 */
export function ShoppingListView({
  list,
  chains,
}: {
  list: ShoppingList;
  chains: readonly ChainTab[];
}) {
  const [tab, setTab] = useState<string>('alles');
  const [, startTransition] = useTransition();
  const [checkedKeys, setCheckedKeys] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        list.groups.flatMap((group) => group.lines.filter((l) => l.checked).map((l) => l.key)),
      ),
  );

  const toggle = (key: string, checked: boolean) => {
    setCheckedKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    startTransition(async () => {
      await toggleShoppingItemAction(key, checked);
    });
  };

  const reset = () => {
    setCheckedKeys(new Set());
    startTransition(async () => {
      await clearShoppingListAction();
    });
  };

  const groups: readonly ShoppingGroup[] =
    tab === 'alles' ? list.groups : (list.byChain.get(tab) ?? []);
  const visibleTotal = groups.reduce((sum, group) => sum + group.subtotalCents, 0);
  const done = checkedKeys.size;

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
            <p className="text-ink-soft text-sm tabular-nums">
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
                  : 'border-line-strong text-ink-soft hover:bg-surface-muted border',
              )}
            >
              {chain.name}
            </button>
          ))}
        </div>
      ) : null}

      {tab !== 'alles' ? (
        <p className="text-ink-soft text-sm">
          Subtotaal bij {chains.find((c) => c.id === tab)?.name}:{' '}
          <span className="font-semibold">{formatEuro(visibleTotal)}</span>
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.category}>
          <h2 className="text-ink-soft mb-2 flex items-baseline justify-between text-sm font-semibold">
            <span>{CATEGORY_LABELS[group.category] ?? group.category}</span>
            <span className="tabular-nums">{formatEuro(group.subtotalCents)}</span>
          </h2>
          <ul className="divide-line border-line bg-surface divide-y rounded-[var(--radius-card)] border">
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
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className={cn('font-medium', isChecked && 'line-through')}>
                          {line.units}× {line.ingredientName}
                        </span>
                        {line.promotionLabel ? (
                          // Marked so an end-to-end test can prove that a real
                          // folder offer reached the screen, rather than
                          // matching on styling that is free to change.
                          <Badge variant="promo" data-promotion={line.promotionLabel}>
                            {line.promotionLabel}
                          </Badge>
                        ) : null}
                        {line.isLowestInWindow ? (
                          <Badge variant="brand">
                            <TrendingDown className="size-3" aria-hidden />
                            laagste prijs in {line.historyWeeks} weken
                          </Badge>
                        ) : line.dealScore !== undefined ? (
                          <Badge variant="brand">onder de normale prijs</Badge>
                        ) : null}
                      </span>
                      <span className="text-ink-faint mt-0.5 block text-xs">
                        {line.productName}
                        {line.isPrivateLabel ? ' (huismerk)' : ''} ·{' '}
                        {formatQuantity(line.packageAmount, line.unit)} per verpakking · samen{' '}
                        {formatQuantity(line.totalAmount, line.unit)}
                      </span>
                      {line.leftoverAmount > 0 ? (
                        <span className="text-ink-faint mt-0.5 block text-xs">
                          Je hebt {formatQuantity(line.requiredAmount, line.unit)} nodig, dus{' '}
                          {/* Derive the leftover from the two numbers we actually
                              show, so "15 g nodig van 30 g" never reads "16 g over". */}
                          {formatQuantity(
                            Math.max(0, line.totalAmount - Math.round(line.requiredAmount)),
                            line.unit,
                          )}{' '}
                          houd je over.
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">
                        {formatEuro(line.priceCents)}
                      </span>
                      {line.savingsCents > 0 ? (
                        <span className="text-promo block text-xs tabular-nums">
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
        <p className="bg-surface-muted text-ink-soft rounded-xl px-4 py-3 text-sm">
          Kruiden, olie en andere voorraadartikelen zijn goed voor{' '}
          <span className="font-semibold">{formatEuro(list.pantrySubtotalCents)}</span> van dit
          bedrag. Heb je die al in huis, dan valt je week zoveel lager uit.
        </p>
      ) : null}

      {list.unavailable.length > 0 ? (
        <p className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">
          Niet verkrijgbaar bij de gekozen supermarkten:{' '}
          {list.unavailable.map((item) => item.name).join(', ')}. Voeg een winkel toe of vervang het
          bijbehorende gerecht.
        </p>
      ) : null}
    </div>
  );
}
