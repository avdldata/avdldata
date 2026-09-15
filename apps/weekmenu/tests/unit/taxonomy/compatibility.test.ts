import { describe, expect, it } from 'vitest';
import {
  buildVariantIndex,
  checkCompatibility,
  assertNutritionIsSound,
  type IngredientOffering,
  type IngredientRequirement,
} from '@/domain/ingredients/taxonomy';
import { SEED_INGREDIENT_VARIANTS } from '@/data/seed/ingredient-taxonomy';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';

/**
 * The nine cases the brief names, plus the asymmetry that makes them work.
 *
 * Symmetric aliasing would pass about half of this file and fail the half that
 * costs money: it would let a risotto recipe be served long-grain rice, and let
 * a salad be built from frozen spinach. Compatibility is directional precisely
 * so those two stay refused.
 */
const variants = buildVariantIndex(SEED_INGREDIENT_VARIANTS);

const ask = (ingredientId: string, extra: Partial<IngredientRequirement> = {}) => ({
  ingredientId,
  ...extra,
});
const offer = (ingredientId: string, extra: Partial<IngredientOffering> = {}) => ({
  ingredientId,
  ...extra,
});

describe('generic accepts specific', () => {
  it('serves fusilli to a recipe that asked for pasta', () => {
    const result = checkCompatibility(
      ask('pasta'),
      offer('pasta', { variantId: 'fusilli' }),
      variants,
    );
    expect(result.compatible).toBe(true);
    expect(result.verdict).toBe('VARIANT_OF_GENERIC');
  });

  it('serves pandan rice to a recipe that asked for rice', () => {
    const result = checkCompatibility(
      ask('rijst'),
      offer('rijst', { variantId: 'pandanrijst' }),
      variants,
    );
    expect(result.compatible).toBe(true);
  });
});

describe('specific does not accept generic', () => {
  it('refuses plain rice where the recipe asked for risotto rice', () => {
    const result = checkCompatibility(
      ask('rijst', { variantId: 'risottorijst' }),
      offer('rijst'),
      variants,
    );
    expect(result.compatible).toBe(false);
    expect(result.verdict).toBe('TOO_GENERIC');
  });

  it('refuses a sibling variant', () => {
    const result = checkCompatibility(
      ask('pasta', { variantId: 'orzo' }),
      offer('pasta', { variantId: 'fusilli' }),
      variants,
    );
    expect(result.compatible).toBe(false);
    expect(result.verdict).toBe('WRONG_VARIANT');
  });

  /**
   * The expensive one. Arborio costs roughly twice what long-grain does, so a
   * generic rice line served risotto rice is a silent overspend as well as a
   * sticky dinner.
   */
  it('refuses risotto rice for a generic rice line, because it is marked not substitutable', () => {
    const result = checkCompatibility(
      ask('rijst'),
      offer('rijst', { variantId: 'risottorijst' }),
      variants,
    );
    expect(result.compatible).toBe(false);
    expect(result.verdict).toBe('WRONG_VARIANT');
  });
});

describe('forms are gated by the recipe, not by the shelf', () => {
  it('refuses frozen spinach unless the recipe accepts frozen', () => {
    const refused = checkCompatibility(
      ask('spinazie'),
      offer('spinazie', { variantId: 'spinazie-diepvries' }),
      variants,
    );
    expect(refused.compatible).toBe(false);
    expect(refused.verdict).toBe('FORM_NOT_ACCEPTED');

    const allowed = checkCompatibility(
      ask('spinazie', { acceptsForms: ['fresh', 'ambient', 'frozen'] }),
      offer('spinazie', { variantId: 'spinazie-diepvries' }),
      variants,
    );
    expect(allowed.compatible).toBe(true);
    expect(allowed.verdict).toBe('ACCEPTED_FORM');
  });

  it('treats baby potatoes the same way', () => {
    expect(
      checkCompatibility(ask('aardappel'), offer('aardappel', { variantId: 'krieltjes' }), variants)
        .verdict,
    ).toBe('FORM_NOT_ACCEPTED');
    expect(
      checkCompatibility(
        ask('aardappel', { acceptsForms: ['fresh', 'ambient', 'baby'] }),
        offer('aardappel', { variantId: 'krieltjes' }),
        variants,
      ).compatible,
    ).toBe(true);
  });
});

describe('different ingredients stay different', () => {
  it.each([
    ['geraspte-kaas', 'geitenkaas', 'kaas versus geitenkaas'],
    ['kikkererwten', 'hummus', 'kikkererwten versus hummus'],
    ['verse-basilicum', 'pesto', 'basilicum versus pesto'],
    ['tomaat', 'pastasaus', 'tomaat versus pastasaus'],
    ['pindakaas', 'satesaus', 'pinda versus satésaus'],
    ['wraps', 'maistortilla', 'tarwewrap versus maïstortilla'],
    ['sambal', 'sriracha', 'sambal versus sriracha'],
  ])('%s is not %s (%s)', (requirement, offering) => {
    const result = checkCompatibility(ask(requirement), offer(offering), variants);
    expect(result.compatible).toBe(false);
    expect(result.verdict).toBe('DIFFERENT_INGREDIENT');
  });
});

describe('unknown data fails closed', () => {
  it('refuses a variant id the taxonomy does not know', () => {
    const result = checkCompatibility(
      ask('pasta'),
      offer('pasta', { variantId: 'verzonnen' }),
      variants,
    );
    expect(result.compatible).toBe(false);
    expect(result.verdict).toBe('WRONG_VARIANT');
  });
});

describe('no double counting', () => {
  it('counts a fusilli offering against pasta, once', () => {
    const result = checkCompatibility(
      ask('pasta'),
      offer('pasta', { variantId: 'fusilli' }),
      variants,
    );
    expect(result.resolvesTo).toBe('pasta');
  });
});

describe('composites carry their own nutrition', () => {
  const COMPOSITES = [
    'hummus',
    'pesto',
    'pastasaus',
    'satesaus',
    'sriracha',
    'taco-kruidenmix',
    'roerbakgroentemix',
  ];

  it('never inherits from a main constituent', () => {
    const rows = COMPOSITES.map((id) => SEED_INGREDIENTS.find((i) => i.id === id)!);
    expect(rows.every(Boolean)).toBe(true);
    expect(() => assertNutritionIsSound(rows)).not.toThrow();

    // Pesto and basil are the case that makes the rule concrete.
    const pesto = SEED_INGREDIENTS.find((i) => i.id === 'pesto')!.nutritionPer100!;
    const basil = SEED_INGREDIENTS.find((i) => i.id === 'verse-basilicum')!.nutritionPer100!;
    expect(pesto.kcal).toBeGreaterThan(basil.kcal * 5);

    const hummus = SEED_INGREDIENTS.find((i) => i.id === 'hummus')!.nutritionPer100!;
    const chickpeas = SEED_INGREDIENTS.find((i) => i.id === 'kikkererwten')!.nutritionPer100!;
    expect(hummus.fat).toBeGreaterThan(chickpeas.fat * 3);
  });

  it('refuses a composite without its own values', () => {
    expect(() => assertNutritionIsSound([{ id: 'verzonnen-saus' }])).toThrow(
      /eigen voedingswaarden/,
    );
  });
});

describe('every variant points at a real ingredient', () => {
  it('has no orphans', () => {
    const ids = new Set(SEED_INGREDIENTS.map((i) => i.id));
    for (const variant of SEED_INGREDIENT_VARIANTS) {
      expect(ids, variant.id).toContain(variant.parentId);
    }
  });

  it('inherits parent nutrition only where the variant is the same food', () => {
    // A shape of pasta is pasta. Anything that is not simply the parent in
    // another outline carries its own values or is not a variant at all.
    for (const variant of SEED_INGREDIENT_VARIANTS) {
      if (variant.nutritionPer100 !== undefined) continue;
      const parent = SEED_INGREDIENTS.find((i) => i.id === variant.parentId)!;
      expect(parent.nutritionPer100, `${variant.id} erft van ${parent.id}`).toBeDefined();
    }
  });
});
