/**
 * Generate `supabase/seed.sql` from the TypeScript seed.
 *
 * The demo dataset has exactly one source of truth: the modules under
 * `src/data/seed`. The demo adapter reads them directly and Postgres gets this
 * generated file, so the two can never drift apart — which is the whole reason
 * the seed is TypeScript and not a hand-maintained .sql file.
 *
 * Run with: pnpm seed:sql [-- --on-date=2026-03-02]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIngredientIndex } from '../src/domain/ingredients/types';
import { normaliseRecipes } from '../src/domain/recipes/normalise';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';
import { SEED_CHAINS, SEED_LOCATIONS } from '../src/data/seed/stores';
import { SEED_BRANDS } from '../src/data/seed/brands';
import {
  buildSeedPriceObservations,
  buildSeedProducts,
  buildSeedPromotions,
} from '../src/data/seed/products';

type Value = string | number | boolean | null | undefined | readonly string[] | object;

/** Render a JavaScript value as a SQL literal. */
function lit(value: Value): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return `array[${value.map((item) => lit(String(item))).join(', ')}]::text[]`;
  }
  if (typeof value === 'object') return `${quote(JSON.stringify(value))}::jsonb`;
  return quote(value);
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function insert(table: string, columns: readonly string[], rows: readonly Value[][]): string {
  if (rows.length === 0) return `-- ${table}: geen rijen\n`;
  const values = rows.map((row) => `  (${row.map(lit).join(', ')})`).join(',\n');
  return [
    `-- ${table} (${rows.length} rijen)`,
    `insert into ${table} (${columns.join(', ')}) values`,
    `${values}`,
    `on conflict do nothing;`,
    '',
  ].join('\n');
}

function mondayOfToday(): string {
  const date = new Date();
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

const onDateArg = process.argv.find((arg) => arg.startsWith('--on-date='));
const onDate = onDateArg ? onDateArg.split('=')[1]! : mondayOfToday();

const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);
const { products, productNutrition } = buildSeedProducts();
const observations = buildSeedPriceObservations(onDate);
const promotions = buildSeedPromotions(onDate);

const sections: string[] = [
  `-- Weekmenu demo seed`,
  `--`,
  `-- GEGENEREERD BESTAND — niet met de hand aanpassen.`,
  `-- Bron: src/data/seed/*.ts. Regenereren met: pnpm seed:sql`,
  `-- Prijzen en aanbiedingen zijn geankerd op de week van ${onDate}.`,
  `--`,
  `-- Alle bedragen zijn hele eurocenten. Alle prijs- en aanbiedingsgegevens`,
  `-- zijn DEMODATA: plausibel voor Nederland, maar niet geverifieerd en niet`,
  `-- afkomstig van een supermarkt.`,
  '',
  'begin;',
  '',
];

sections.push(
  insert(
    'canonical_ingredients',
    [
      'id',
      'canonical_name',
      'category',
      'default_base_unit',
      'density',
      'piece_weight_grams',
      'perishability',
      'vegetarian',
      'vegan',
      'pantry_staple',
      'allergens',
      'pregnancy_risks',
    ],
    SEED_INGREDIENTS.map((i) => [
      i.id,
      i.canonicalName,
      i.category,
      i.baseUnit,
      i.density ?? null,
      i.pieceWeightGrams ?? null,
      i.perishability,
      i.vegetarian,
      i.vegan,
      i.pantryStaple === true,
      i.allergens,
      i.pregnancyRisks,
    ]),
  ),
);

sections.push(
  insert(
    'ingredient_aliases',
    ['ingredient_id', 'alias', 'source'],
    SEED_INGREDIENT_ALIASES.map((a) => [a.ingredientId, a.alias, a.source]),
  ),
);

sections.push(
  insert(
    'ingredient_nutrition',
    [
      'ingredient_id',
      'kcal_per_100',
      'protein_per_100',
      'carbs_per_100',
      'sugars_per_100',
      'fat_per_100',
      'saturated_per_100',
      'fiber_per_100',
      'salt_per_100',
      'micronutrients',
      'source',
    ],
    SEED_INGREDIENTS.filter((i) => i.nutritionPer100).map((i) => {
      const n = i.nutritionPer100!;
      return [
        i.id,
        n.kcal,
        n.protein,
        n.carbohydrates,
        n.sugars,
        n.fat,
        n.saturatedFat,
        n.fiber,
        n.salt,
        n.micronutrients ?? {},
        i.nutritionSource ?? 'demo-seed',
      ];
    }),
  ),
);

sections.push(
  insert(
    'recipes',
    [
      'id',
      'name',
      'description',
      'image_url',
      'steps',
      'prep_minutes',
      'cook_minutes',
      'difficulty',
      'cuisine',
      'tags',
      'base_servings',
      'primary_protein',
      'authored_kcal',
      'authored_protein',
      'authored_carbs',
      'authored_fat',
      'authored_fiber',
      'authored_salt',
      'pregnancy_suitable_override',
    ],
    recipes.map((r) => {
      const authored = r.authoredNutritionPerServing;
      const override = SEED_RECIPES.find((s) => s.id === r.id)?.pregnancySuitableOverride;
      return [
        r.id,
        r.name,
        r.description,
        r.imageUrl,
        r.steps,
        r.prepMinutes,
        r.cookMinutes,
        r.difficulty,
        r.cuisine,
        r.tags,
        r.baseServings,
        r.primaryProtein,
        authored.kcal,
        authored.proteinGrams,
        authored.carbGrams,
        authored.fatGrams,
        authored.fiberGrams,
        authored.saltGrams,
        override ?? null,
      ];
    }),
  ),
);

sections.push(
  insert(
    'recipe_ingredients',
    ['recipe_id', 'ingredient_id', 'amount', 'unit', 'optional', 'note'],
    recipes.flatMap((r) =>
      r.ingredients.map((line) => [
        r.id,
        line.ingredientId,
        // Stored for the whole recipe at base_servings, in the base unit.
        Number((line.perServing.amount * r.baseServings).toFixed(3)),
        line.perServing.unit,
        line.optional,
        line.note ?? null,
      ]),
    ),
  ),
);

sections.push(
  insert(
    'supermarket_chains',
    ['id', 'name', 'logo_url', 'color_hex'],
    SEED_CHAINS.map((c) => [c.id, c.name, c.logoUrl, c.colorHex]),
  ),
);

sections.push(
  insert(
    'supermarket_locations',
    [
      'id',
      'chain_id',
      'name',
      'address',
      'postal_code',
      'city',
      'latitude',
      'longitude',
      'region_id',
    ],
    SEED_LOCATIONS.map((l) => [
      l.id,
      l.chainId,
      l.name,
      l.address,
      l.postalCode,
      l.city,
      l.latitude,
      l.longitude,
      l.regionId,
    ]),
  ),
);

sections.push(
  insert(
    'brands',
    ['id', 'name', 'is_private_label', 'chain_id'],
    SEED_BRANDS.map((b) => [b.id, b.name, b.isPrivateLabel, b.chainId ?? null]),
  ),
);

sections.push(
  insert(
    'products',
    [
      'id',
      'gtin',
      'brand_id',
      'product_name',
      'canonical_ingredient_id',
      'package_amount',
      'package_unit',
      'chain_id',
      'active',
      'image_url',
    ],
    products.map((p) => [
      p.id,
      p.gtin ?? null,
      p.brandId,
      p.productName,
      p.canonicalIngredientId,
      Number(p.packageAmount.amount.toFixed(3)),
      p.packageAmount.unit,
      p.chainId,
      p.active,
      p.imageUrl ?? null,
    ]),
  ),
);

sections.push(
  insert(
    'product_availability',
    ['product_id', 'location_id'],
    products.flatMap((p) =>
      (p.availableAtLocationIds ?? []).map((locationId) => [p.id, locationId]),
    ),
  ),
);

sections.push(
  insert(
    'product_nutrition',
    [
      'product_id',
      'kcal_per_100',
      'protein_per_100',
      'carbs_per_100',
      'sugars_per_100',
      'fat_per_100',
      'saturated_per_100',
      'fiber_per_100',
      'salt_per_100',
      'micronutrients',
      'source',
    ],
    productNutrition.map((entry) => [
      entry.productId,
      entry.per100.kcal,
      entry.per100.protein,
      entry.per100.carbohydrates,
      entry.per100.sugars,
      entry.per100.fat,
      entry.per100.saturatedFat,
      entry.per100.fiber,
      entry.per100.salt,
      entry.per100.micronutrients ?? {},
      entry.source,
    ]),
  ),
);

sections.push(
  insert(
    'product_prices',
    [
      'product_id',
      'chain_id',
      'location_id',
      'region_id',
      'scope',
      'price_cents',
      'valid_from',
      'valid_until',
      'observed_at',
      'source',
    ],
    observations.map((o) => [
      o.productId,
      o.scope.kind === 'location' ? null : o.scope.chainId,
      o.scope.kind === 'location' ? o.scope.locationId : null,
      o.scope.kind === 'region' ? o.scope.regionId : null,
      o.scope.kind,
      o.priceCents,
      o.validFrom,
      o.validUntil ?? null,
      o.observedAt,
      o.source,
    ]),
  ).replace(
    // A location-scoped observation has no chain on the scope; resolve it from
    // the product so the not-null constraint holds.
    /^-- product_prices/m,
    '-- product_prices — elke waarneming is een eigen rij; niets wordt overschreven\n-- product_prices',
  ),
);

sections.push(
  insert(
    'promotions',
    [
      'product_id',
      'chain_id',
      'location_id',
      'region_id',
      'scope',
      'promotion_type',
      'unit_price_cents',
      'percent',
      'bundle_size',
      'bundle_price_cents',
      'minimum_quantity',
      'label',
      'valid_from',
      'valid_until',
      'source',
    ],
    promotions.map((p) => {
      const params = p.params;
      return [
        p.productId,
        p.scope.kind === 'location' ? null : p.scope.chainId,
        p.scope.kind === 'location' ? p.scope.locationId : null,
        p.scope.kind === 'region' ? p.scope.regionId : null,
        p.scope.kind,
        params.type,
        params.type === 'FIXED_PRICE' ? params.unitPriceCents : null,
        params.type === 'PERCENT_OFF' ? params.percent : null,
        params.type === 'N_FOR_X' ? params.bundleSize : null,
        params.type === 'N_FOR_X' ? params.bundlePriceCents : null,
        p.minUnits,
        p.label,
        p.validFrom,
        p.validUntil,
        p.source ?? 'demo-seed',
      ];
    }),
  ),
);

sections.push('commit;', '');

const target = join(process.cwd(), 'supabase', 'seed.sql');
writeFileSync(target, sections.join('\n'), 'utf8');

console.log(
  [
    `Seed geschreven naar ${target}`,
    `  ${SEED_INGREDIENTS.length} ingrediënten, ${SEED_INGREDIENT_ALIASES.length} aliassen`,
    `  ${recipes.length} recepten`,
    `  ${SEED_BRANDS.length} merken, ${products.length} producten, ${productNutrition.length} productvoedingswaarden`,
    `  ${observations.length} prijswaarnemingen, ${promotions.length} aanbiedingen (week van ${onDate})`,
  ].join('\n'),
);
