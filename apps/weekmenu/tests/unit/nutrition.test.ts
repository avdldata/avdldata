import { describe, expect, it } from 'vitest';
import {
  calculateMemberNutrition,
  mifflinStJeor,
  resolvePregnancyTrimester,
} from '@/domain/nutrition/calculate';
import { DEFAULT_NUTRITION_CONFIG } from '@/domain/nutrition/config';
import { makeMember } from '../support/builders';

const TODAY = new Date('2026-03-02T00:00:00Z');

describe('Mifflin-St Jeor', () => {
  it('matches the published formula for men and women', () => {
    // 10*87 + 6.25*175 - 5*38 + 5 = 1778.75
    expect(mifflinStJeor({ sex: 'man', weightKg: 87, heightCm: 175, ageYears: 38 })).toBeCloseTo(
      1778.75,
      2,
    );
    // 10*74 + 6.25*182 - 5*34 - 161 = 1546.5
    expect(mifflinStJeor({ sex: 'vrouw', weightKg: 74, heightCm: 182, ageYears: 34 })).toBeCloseTo(
      1546.5,
      2,
    );
  });
});

describe('member nutrition', () => {
  it('applies the activity factor and the dinner share', () => {
    const result = calculateMemberNutrition(
      makeMember({ sex: 'man', heightCm: 175, weightKg: 87, ageYears: 38, activityLevel: 'licht-actief' }),
      TODAY,
    );
    expect(result.bmrKcal).toBe(1779);
    expect(result.tdeeKcal).toBe(Math.round(1778.75 * 1.375));
    expect(result.dinnerEnergyKcal).toBe(Math.round(result.targetEnergyKcal * 0.3));
    expect(result.estimateQuality).toBe('high');
  });

  it('subtracts energy when the goal is to lose weight', () => {
    const maintain = calculateMemberNutrition(
      makeMember({ heightCm: 180, weightKg: 90, ageYears: 40, goal: 'behouden' }),
      TODAY,
    );
    const lose = calculateMemberNutrition(
      makeMember({ heightCm: 180, weightKg: 90, ageYears: 40, goal: 'afvallen' }),
      TODAY,
    );
    expect(maintain.targetEnergyKcal - lose.targetEnergyKcal).toBe(400);
  });

  it('never advises below the safety floor', () => {
    const result = calculateMemberNutrition(
      makeMember({
        sex: 'vrouw',
        heightCm: 150,
        weightKg: 45,
        ageYears: 70,
        activityLevel: 'zittend',
        goal: 'afvallen',
      }),
      TODAY,
    );
    expect(result.targetEnergyKcal).toBe(DEFAULT_NUTRITION_CONFIG.minimumDailyKcal.vrouw);
    expect(result.assumptions.join(' ')).toContain('ondergrens');
  });

  it('adds energy and protein during the second and third trimester', () => {
    const base = calculateMemberNutrition(
      makeMember({ sex: 'vrouw', heightCm: 182, weightKg: 74, ageYears: 34 }),
      TODAY,
    );
    const second = calculateMemberNutrition(
      makeMember({
        sex: 'vrouw',
        heightCm: 182,
        weightKg: 74,
        ageYears: 34,
        pregnancy: { pregnant: true, trimester: 2 },
      }),
      TODAY,
    );
    expect(second.targetEnergyKcal - base.targetEnergyKcal).toBe(340);
    expect(second.proteinGuidelineGrams - base.proteinGuidelineGrams).toBe(25);
  });

  it('degrades gracefully when weight is missing rather than crashing', () => {
    const result = calculateMemberNutrition(makeMember({ heightCm: 180, ageYears: 40 }), TODAY);
    expect(result.estimateQuality).toBe('low');
    expect(result.targetEnergyKcal).toBeGreaterThan(0);
    expect(result.assumptions.join(' ')).toContain('Gewicht onbekend');
  });

  it('derives the trimester from a due date', () => {
    const member = makeMember({ pregnancy: { pregnant: true, dueDate: '2026-06-01' } });
    // ~13 weeks to go on 2 March 2026 => gestational week ~27 => second trimester.
    expect(resolvePregnancyTrimester(member, TODAY)).toBe(2);
  });

  it('reports no trimester when the due date is nonsense', () => {
    const member = makeMember({ pregnancy: { pregnant: true, dueDate: 'geen datum' } });
    expect(resolvePregnancyTrimester(member, TODAY)).toBeUndefined();
  });
});
