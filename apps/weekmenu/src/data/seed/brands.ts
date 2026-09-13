import type { AuthoringUnit } from '@/domain/units';
import type { Brand } from '@/domain/stores/types';
import type { NutritionPer100 } from '@/domain/nutrition/facts';

/**
 * Brands.
 *
 * Four private labels — each owned by exactly one chain — plus the A-brands a
 * Dutch shopper actually recognises. Having this as its own table is what makes
 * "same ingredient, three brands, three prices, three nutrition labels"
 * expressible at all.
 */
export const SEED_BRANDS: readonly Brand[] = [
  { id: 'brand-ah', name: 'AH', isPrivateLabel: true, chainId: 'ah' },
  { id: 'brand-jumbo', name: 'Jumbo', isPrivateLabel: true, chainId: 'jumbo' },
  { id: 'brand-lidl', name: 'Lidl', isPrivateLabel: true, chainId: 'lidl' },
  { id: 'brand-plus', name: 'PLUS', isPrivateLabel: true, chainId: 'plus' },

  { id: 'brand-campina', name: 'Campina', isPrivateLabel: false },
  { id: 'brand-arla', name: 'Arla', isPrivateLabel: false },
  { id: 'brand-milner', name: 'Milner', isPrivateLabel: false },
  { id: 'brand-galbani', name: 'Galbani', isPrivateLabel: false },
  { id: 'brand-zanetti', name: 'Zanetti', isPrivateLabel: false },
  { id: 'brand-granditalia', name: "Grand'Italia", isPrivateLabel: false },
  { id: 'brand-dececco', name: 'De Cecco', isPrivateLabel: false },
  { id: 'brand-lassie', name: 'Lassie', isPrivateLabel: false },
  { id: 'brand-conimex', name: 'Conimex', isPrivateLabel: false },
  { id: 'brand-hak', name: 'HAK', isPrivateLabel: false },
  { id: 'brand-bonduelle', name: 'Bonduelle', isPrivateLabel: false },
  { id: 'brand-heinz', name: 'Heinz', isPrivateLabel: false },
  { id: 'brand-johnwest', name: 'John West', isPrivateLabel: false },
  { id: 'brand-bertolli', name: 'Bertolli', isPrivateLabel: false },
  { id: 'brand-knorr', name: 'Knorr', isPrivateLabel: false },
  { id: 'brand-calve', name: 'Calvé', isPrivateLabel: false },
  { id: 'brand-verstegen', name: 'Verstegen', isPrivateLabel: false },
  { id: 'brand-silvo', name: 'Silvo', isPrivateLabel: false },
  { id: 'brand-honig', name: 'Honig', isPrivateLabel: false },
  { id: 'brand-vivera', name: 'Vivera', isPrivateLabel: false },
  { id: 'brand-alpro', name: 'Alpro', isPrivateLabel: false },
  { id: 'brand-detraay', name: 'De Traay', isPrivateLabel: false },
  { id: 'brand-santamaria', name: 'Santa Maria', isPrivateLabel: false },
];

export const PRIVATE_LABEL_BY_CHAIN: Readonly<Record<string, string>> = {
  ah: 'brand-ah',
  jumbo: 'brand-jumbo',
  lidl: 'brand-lidl',
  plus: 'brand-plus',
};

function nut(
  kcal: number,
  protein: number,
  carbohydrates: number,
  sugars: number,
  fat: number,
  saturatedFat: number,
  fiber: number,
  salt: number,
): NutritionPer100 {
  return { kcal, protein, carbohydrates, sugars, fat, saturatedFat, fiber, salt };
}

export interface ABrandProductSpec {
  readonly brandId: string;
  readonly productName: string;
  readonly amount: number;
  readonly unit: AuthoringUnit;
  /** Multiplier on the reference price; A-brands sit above the private label. */
  readonly priceMultiplier: number;
  readonly chains?: readonly string[];
  /**
   * Declared nutrition where it genuinely differs from the generic ingredient
   * value. Left out on purpose for most articles, so the fallback to the
   * canonical ingredient is exercised by the demo data itself.
   */
  readonly nutritionPer100?: NutritionPer100;
}

/**
 * A-brand alternatives per canonical ingredient.
 *
 * The point of these is not variety for its own sake: they give the optimizer a
 * genuine choice between a cheap private label and a pricier branded article
 * with different nutrition, which is exactly the trade-off
 * `ProductSelectionWeights` exists to arbitrate.
 */
export const A_BRAND_PRODUCTS: Readonly<Record<string, readonly ABrandProductSpec[]>> = {
  // ---- Zuivel: waar merkverschillen nutritioneel echt bestaan --------------
  melk: [
    { brandId: 'brand-campina', productName: 'Halfvolle melk', amount: 1, unit: 'l', priceMultiplier: 1.35, nutritionPer100: nut(47, 3.6, 4.7, 4.7, 1.5, 1.0, 0, 0.12) },
  ],
  yoghurt: [
    { brandId: 'brand-campina', productName: 'Volle yoghurt', amount: 1, unit: 'l', priceMultiplier: 1.32, nutritionPer100: nut(66, 3.6, 4.6, 4.6, 3.6, 2.4, 0, 0.13) },
  ],
  'griekse-yoghurt': [
    { brandId: 'brand-arla', productName: 'Griekse stijl yoghurt', amount: 500, unit: 'g', priceMultiplier: 1.4, nutritionPer100: nut(123, 5.6, 4.0, 4.0, 9.5, 6.4, 0, 0.13) },
  ],
  kookroom: [
    { brandId: 'brand-campina', productName: 'Kookroom', amount: 250, unit: 'ml', priceMultiplier: 1.3, nutritionPer100: nut(204, 2.5, 3.3, 3.3, 20, 14, 0, 0.11) },
  ],
  'creme-fraiche': [
    { brandId: 'brand-campina', productName: 'Crème fraîche', amount: 125, unit: 'g', priceMultiplier: 1.28 },
  ],
  'geraspte-kaas': [
    { brandId: 'brand-milner', productName: 'Geraspte kaas 30+', amount: 200, unit: 'g', priceMultiplier: 1.35, nutritionPer100: nut(302, 30, 0.5, 0.5, 20, 13, 0, 1.9) },
  ],
  parmezaan: [
    { brandId: 'brand-zanetti', productName: 'Parmigiano Reggiano', amount: 100, unit: 'g', priceMultiplier: 1.3 },
  ],
  mozzarella: [
    { brandId: 'brand-galbani', productName: 'Mozzarella', amount: 125, unit: 'g', priceMultiplier: 1.45 },
  ],
  roomboter: [
    { brandId: 'brand-campina', productName: 'Roomboter gezouten', amount: 250, unit: 'g', priceMultiplier: 1.3 },
  ],
  kwark: [
    { brandId: 'brand-arla', productName: 'Magere kwark', amount: 500, unit: 'g', priceMultiplier: 1.35, nutritionPer100: nut(57, 10.5, 3.8, 3.8, 0.2, 0.1, 0, 0.09) },
  ],

  // ---- Pasta, rijst en granen ---------------------------------------------
  spaghetti: [
    { brandId: 'brand-granditalia', productName: 'Spaghetti', amount: 500, unit: 'g', priceMultiplier: 1.55 },
    { brandId: 'brand-dececco', productName: 'Spaghetti n.12', amount: 500, unit: 'g', priceMultiplier: 2.1, chains: ['ah', 'jumbo'], nutritionPer100: nut(353, 13.5, 70, 3.2, 1.4, 0.3, 3.5, 0.01) },
  ],
  penne: [
    { brandId: 'brand-granditalia', productName: 'Penne rigate', amount: 500, unit: 'g', priceMultiplier: 1.55 },
  ],
  macaroni: [
    { brandId: 'brand-granditalia', productName: 'Macaroni', amount: 500, unit: 'g', priceMultiplier: 1.5 },
  ],
  lasagnebladen: [
    { brandId: 'brand-granditalia', productName: 'Lasagne', amount: 250, unit: 'g', priceMultiplier: 1.4 },
  ],
  'witte-rijst': [
    { brandId: 'brand-lassie', productName: 'Witte rijst', amount: 400, unit: 'g', priceMultiplier: 1.6 },
  ],
  basmatirijst: [
    { brandId: 'brand-lassie', productName: 'Basmatirijst', amount: 1, unit: 'kg', priceMultiplier: 1.35 },
  ],
  mie: [
    { brandId: 'brand-conimex', productName: 'Mie', amount: 250, unit: 'g', priceMultiplier: 1.7, nutritionPer100: nut(361, 10.5, 71, 2.4, 3.1, 1.2, 2.8, 0.9) },
  ],
  wraps: [
    { brandId: 'brand-santamaria', productName: 'Tortilla wraps', amount: 8, unit: 'piece', priceMultiplier: 1.5, nutritionPer100: nut(311, 8.4, 49, 3.1, 8.2, 3.6, 2.9, 1.35) },
  ],
  bloem: [
    { brandId: 'brand-honig', productName: 'Tarwebloem', amount: 1, unit: 'kg', priceMultiplier: 1.5 },
  ],

  // ---- Conserven -----------------------------------------------------------
  tomatenblokjes: [
    { brandId: 'brand-granditalia', productName: 'Tomatenblokjes', amount: 400, unit: 'g', priceMultiplier: 1.6, nutritionPer100: nut(24, 1.3, 3.6, 3.2, 0.2, 0.03, 1.3, 0.02) },
  ],
  passata: [
    { brandId: 'brand-granditalia', productName: 'Passata', amount: 700, unit: 'ml', priceMultiplier: 1.5 },
  ],
  tomatenpuree: [
    { brandId: 'brand-heinz', productName: 'Tomatenpuree', amount: 140, unit: 'g', priceMultiplier: 1.5 },
  ],
  kokosmelk: [
    { brandId: 'brand-conimex', productName: 'Kokosmelk', amount: 400, unit: 'ml', priceMultiplier: 1.5, nutritionPer100: nut(160, 1.4, 2.6, 2.2, 15.5, 13.8, 0.4, 0.04) },
  ],
  kikkererwten: [
    { brandId: 'brand-hak', productName: 'Kikkererwten', amount: 400, unit: 'g', priceMultiplier: 1.75, nutritionPer100: nut(115, 6.8, 14, 0.7, 2.3, 0.3, 6.0, 0.05) },
  ],
  kidneybonen: [
    { brandId: 'brand-hak', productName: 'Kidneybonen', amount: 400, unit: 'g', priceMultiplier: 1.75, nutritionPer100: nut(102, 7.2, 13.5, 0.5, 0.5, 0.1, 7.0, 0.05) },
  ],
  'bruine-bonen': [
    { brandId: 'brand-hak', productName: 'Bruine bonen', amount: 400, unit: 'g', priceMultiplier: 1.7 },
  ],
  mais: [
    { brandId: 'brand-bonduelle', productName: 'Maïs', amount: 300, unit: 'g', priceMultiplier: 1.65, nutritionPer100: nut(82, 2.9, 15, 4.0, 1.1, 0.2, 2.8, 0.02) },
  ],
  doperwten: [
    { brandId: 'brand-bonduelle', productName: 'Doperwten fijn', amount: 750, unit: 'g', priceMultiplier: 1.5 },
  ],
  'tonijn-blik': [
    { brandId: 'brand-johnwest', productName: 'Tonijnstukken in water', amount: 145, unit: 'g', priceMultiplier: 1.4, nutritionPer100: nut(103, 24, 0, 0, 0.8, 0.2, 0, 0.8) },
  ],
  olijven: [
    { brandId: 'brand-bertolli', productName: 'Groene olijven', amount: 200, unit: 'g', priceMultiplier: 1.5 },
  ],

  // ---- Kruiden, olie en voorraad ------------------------------------------
  olijfolie: [
    { brandId: 'brand-bertolli', productName: 'Olijfolie extra vierge', amount: 500, unit: 'ml', priceMultiplier: 1.55 },
  ],
  sojasaus: [
    { brandId: 'brand-conimex', productName: 'Sojasaus', amount: 250, unit: 'ml', priceMultiplier: 1.5, nutritionPer100: nut(57, 5.5, 5.2, 1.5, 0.1, 0.01, 0.7, 15.2) },
  ],
  ketjap: [
    { brandId: 'brand-conimex', productName: 'Ketjap manis', amount: 500, unit: 'ml', priceMultiplier: 1.55 },
  ],
  sambal: [
    { brandId: 'brand-conimex', productName: 'Sambal oelek', amount: 200, unit: 'g', priceMultiplier: 1.5 },
  ],
  'rode-currypasta': [
    { brandId: 'brand-conimex', productName: 'Rode currypasta', amount: 195, unit: 'g', priceMultiplier: 1.4 },
  ],
  groentebouillon: [
    { brandId: 'brand-knorr', productName: 'Groentebouillonblokjes', amount: 66, unit: 'g', priceMultiplier: 1.6, nutritionPer100: nut(196, 9.0, 20, 7.0, 8.5, 4.2, 1.0, 44) },
  ],
  pindakaas: [
    { brandId: 'brand-calve', productName: 'Pindakaas', amount: 350, unit: 'g', priceMultiplier: 1.45, nutritionPer100: nut(619, 24, 13, 5.5, 52, 9.6, 6.5, 0.9) },
  ],
  honing: [
    { brandId: 'brand-detraay', productName: 'Bloemenhoning', amount: 350, unit: 'g', priceMultiplier: 1.7 },
  ],
  paprikapoeder: [
    { brandId: 'brand-verstegen', productName: 'Paprikapoeder', amount: 50, unit: 'g', priceMultiplier: 1.8 },
  ],
  komijn: [
    { brandId: 'brand-verstegen', productName: 'Komijnpoeder', amount: 40, unit: 'g', priceMultiplier: 1.8 },
  ],
  kerriepoeder: [
    { brandId: 'brand-verstegen', productName: 'Kerriepoeder', amount: 50, unit: 'g', priceMultiplier: 1.8 },
  ],
  'italiaanse-kruiden': [
    { brandId: 'brand-silvo', productName: 'Italiaanse kruiden', amount: 20, unit: 'g', priceMultiplier: 1.7 },
  ],
  oregano: [
    { brandId: 'brand-silvo', productName: 'Oregano', amount: 15, unit: 'g', priceMultiplier: 1.7 },
  ],

  // ---- Vleesvervangers -----------------------------------------------------
  'vega-gehakt': [
    { brandId: 'brand-vivera', productName: 'Plantaardig gehakt', amount: 200, unit: 'g', priceMultiplier: 1.5, nutritionPer100: nut(178, 18.5, 5.2, 0.9, 8.9, 0.9, 4.1, 1.0) },
  ],
  tofu: [
    { brandId: 'brand-alpro', productName: 'Tofu naturel', amount: 400, unit: 'g', priceMultiplier: 1.45, nutritionPer100: nut(127, 13.5, 1.2, 0.5, 7.4, 1.1, 1.2, 0.02) },
  ],
};
