import type { Cents } from '@/domain/units';
import type { WeeklyPlan } from '@/domain/optimization/types';
import type { IngredientCategory } from '@/domain/ingredients/types';
import type { BaseUnit } from '@/domain/units';
import { CATEGORY_ORDER } from '@/lib/format';

export interface ShoppingLine {
  /** Stable key so a tick survives a re-price of the same week. */
  readonly key: string;
  readonly ingredientId: string;
  readonly ingredientName: string;
  readonly productName: string;
  readonly chainId: string;
  readonly units: number;
  readonly packageAmount: number;
  readonly unit: BaseUnit;
  readonly totalAmount: number;
  readonly requiredAmount: number;
  readonly leftoverAmount: number;
  readonly priceCents: Cents;
  readonly promotionLabel?: string;
  readonly savingsCents: Cents;
  readonly checked: boolean;
}

export interface ShoppingGroup {
  readonly category: IngredientCategory;
  readonly lines: readonly ShoppingLine[];
  readonly subtotalCents: number;
}

export interface ShoppingList {
  readonly groups: readonly ShoppingGroup[];
  readonly byChain: ReadonlyMap<string, readonly ShoppingGroup[]>;
  readonly totalCents: number;
  readonly checkedCount: number;
  readonly lineCount: number;
  /** Long-life items (herbs, oil, spices) you may well already have at home. */
  readonly pantrySubtotalCents: number;
  readonly unavailable: readonly { ingredientId: string; name: string }[];
}

const PANTRY_CATEGORY: IngredientCategory = 'kruiden-specerijen';

/**
 * Turn the priced week into the list you actually walk around with.
 *
 * One line per product-and-pack-size, grouped the way a Dutch supermarket is
 * laid out, with the promotion and the leftover shown so nothing about the
 * price is hidden.
 */
export function buildShoppingList(
  plan: WeeklyPlan,
  checkedKeys: readonly string[],
): ShoppingList {
  const checked = new Set(checkedKeys);
  const lines: ShoppingLine[] = [];

  for (const assignment of plan.recommendedOption.assignments) {
    for (const line of assignment.packaging.lines) {
      lines.push({
        key: `${assignment.ingredientId}:${line.offer.productId}`,
        ingredientId: assignment.ingredientId,
        ingredientName: assignment.name,
        productName: line.offer.name,
        chainId: assignment.chainId,
        units: line.units,
        packageAmount: line.offer.packageAmount.amount,
        unit: line.offer.packageAmount.unit,
        totalAmount: line.units * line.offer.packageAmount.amount,
        requiredAmount: assignment.packaging.requiredAmount,
        leftoverAmount: assignment.packaging.leftoverAmount,
        priceCents: line.lineTotalCents,
        ...(line.promotionApplied && line.offer.promotion
          ? { promotionLabel: line.offer.promotion.label }
          : {}),
        savingsCents: line.savingsCents,
        checked: checked.has(`${assignment.ingredientId}:${line.offer.productId}`),
      });
    }
  }

  const categoryOf = new Map(
    plan.recommendedOption.assignments.map((a) => [a.ingredientId, a.category]),
  );

  const group = (subset: readonly ShoppingLine[]): ShoppingGroup[] =>
    CATEGORY_ORDER.map((category) => {
      const groupLines = subset
        .filter((line) => (categoryOf.get(line.ingredientId) ?? 'overig') === category)
        .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName, 'nl'));
      return {
        category,
        lines: groupLines,
        subtotalCents: groupLines.reduce((sum, line) => sum + line.priceCents, 0),
      };
    }).filter((entry) => entry.lines.length > 0);

  const byChain = new Map<string, ShoppingGroup[]>();
  for (const chainId of plan.recommendedOption.chainIds) {
    byChain.set(chainId, group(lines.filter((line) => line.chainId === chainId)));
  }

  return {
    groups: group(lines),
    byChain,
    totalCents: lines.reduce((sum, line) => sum + line.priceCents, 0),
    checkedCount: lines.filter((line) => line.checked).length,
    lineCount: lines.length,
    pantrySubtotalCents: lines
      .filter((line) => (categoryOf.get(line.ingredientId) ?? 'overig') === PANTRY_CATEGORY)
      .reduce((sum, line) => sum + line.priceCents, 0),
    unavailable: plan.recommendedOption.unavailable.map((item) => ({
      ingredientId: item.ingredientId,
      name: item.name,
    })),
  };
}
