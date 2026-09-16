import { describe, expect, it } from 'vitest';
import { fastestOf } from '../support/timing';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { findReplacements } from '@/domain/optimization/replace';
import { euros } from '@/domain/units';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_DATE,
  TEST_TODAY,
} from '../support/fixtures';

function baseInput() {
  return {
    household: demoHousehold,
    recipes,
    ingredients: ingredientIndex,
    stores: storeCandidates(),
    maxStores: 2,
    conveniencePreference: 'gebalanceerd' as const,
    budget: {},
    startDate: TEST_DATE,
    today: TEST_TODAY,
  };
}

describe('end-to-end weekly plan for the demo household', () => {
  const result = optimiseWeek(baseInput());

  it('produces a plan', () => {
    expect(result.status).toBe('OK');
  });

  it('plans exactly seven dinners', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.days).toHaveLength(7);
    const ids = result.plan.days.map((d) => d.recipe.id);
    expect(new Set(ids).size).toBe(7);
  });

  it('gives every member their own portion size', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    const day = result.plan.days[0]!;
    expect(day.portions.perMember).toHaveLength(2);
    const factors = day.portions.perMember.map((p) => p.factor);
    expect(factors.every((f) => f >= 0.6 && f <= 2)).toBe(true);
  });

  it('never proposes a dish that is unsuitable during pregnancy', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.days.every((d) => d.recipe.pregnancySuitable)).toBe(true);
  });

  it('respects the maximum number of stores', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.recommendedOption.locationIds.length).toBeLessThanOrEqual(2);
    for (const option of result.plan.alternativeOptions) {
      expect(option.locationIds.length).toBeLessThanOrEqual(2);
    }
  });

  it('produces a costed shopping list built from real packages', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    const assignments = result.plan.recommendedOption.assignments;
    expect(assignments.length).toBeGreaterThan(15);
    for (const assignment of assignments) {
      expect(assignment.packaging.purchasedAmount).toBeGreaterThanOrEqual(
        assignment.packaging.requiredAmount - 1e-6,
      );
      expect(assignment.packaging.lines.length).toBeGreaterThan(0);
      expect(assignment.packaging.totalCents).toBeGreaterThan(0);
    }
    expect(result.plan.totals.groceryCents).toBeGreaterThan(2000);
  });

  it('reuses leftovers across days', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    const reused = result.plan.leftovers.filter((l) => l.days.length > 1);
    expect(reused.length).toBeGreaterThan(0);
  });

  it('explains itself with structured reason codes', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.reasons.length).toBeGreaterThan(3);
    expect(result.plan.reasons.map((r) => r.code)).toContain('PREGNANCY_SAFE');
  });

  it('allocates day costs that add up to the grocery total', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    const sum = result.plan.days.reduce((total, d) => total + d.allocatedCostCents, 0);
    expect(sum).toBe(result.plan.totals.groceryCents);
  });

  it('is deterministic', () => {
    const again = optimiseWeek(baseInput());
    if (result.status !== 'OK' || again.status !== 'OK') throw new Error('expected two plans');
    expect(again.plan.days.map((d) => d.recipe.id)).toEqual(
      result.plan.days.map((d) => d.recipe.id),
    );
    expect(again.plan.totals.groceryCents).toBe(result.plan.totals.groceryCents);
  });

  it('generates a week within the performance budget', () => {
    expect(fastestOf(3, () => void optimiseWeek(baseInput()))).toBeLessThan(2000);
  }, 30_000);

  it('can replace one dish and re-cost the whole week', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    const alternatives = findReplacements({
      ...baseInput(),
      currentPlan: result.plan,
      dayIndex: 2,
    });
    expect(alternatives.length).toBeGreaterThan(0);
    for (const alternative of alternatives) {
      expect(alternative.plan.days).toHaveLength(7);
      expect(alternative.plan.days[2]!.recipe.id).toBe(alternative.recipe.id);
      expect(alternative.deltaCents).toBe(
        alternative.plan.totals.groceryCents - result.plan.totals.groceryCents,
      );
    }
  });

  it('reports honestly when a hard budget cannot be met', () => {
    const impossible = optimiseWeek({ ...baseInput(), budget: { hardMaxCents: euros(15) } });
    if (impossible.status !== 'OK') throw new Error(impossible.message);
    expect(impossible.plan.budget.met).toBe(false);
    expect(impossible.plan.budget.shortfallCents).toBeGreaterThan(0);
    expect(impossible.plan.days.every((d) => d.recipe.pregnancySuitable)).toBe(true);
  });
});
