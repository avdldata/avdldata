import type { AuthoringUnit } from '@/domain/units';
import type { ChainId, PromotionType } from '@/domain/stores/types';

/** When a promotion is valid, relative to the week being planned. */
export type PromotionWindow = 'this-week' | 'expired' | 'future';

export interface SeedPromotionSpec {
  readonly type: PromotionType;
  /** FIXED_PRICE: the promotional unit price in cents. */
  readonly unitPriceCents?: number;
  /** PERCENT_OFF: percentage off the shelf price. */
  readonly percent?: number;
  /** N_FOR_X: bundle size and bundle price in cents. */
  readonly bundleSize?: number;
  readonly bundlePriceCents?: number;
  readonly minUnits?: number;
  readonly label: string;
  readonly window?: PromotionWindow;
}

export interface SeedPackSpec {
  readonly amount: number;
  readonly unit: AuthoringUnit;
  /** Reference price in cents; each chain applies its own multiplier. */
  readonly referencePriceCents: number;
  /** Chains that carry this pack size. Absent means all of them. */
  readonly chains?: readonly ChainId[];
  readonly suffix?: string;
}

export interface SeedCatalogueEntry {
  readonly ingredientId: string;
  readonly productName: string;
  readonly packs: readonly SeedPackSpec[];
  /** Chains that do not stock this ingredient at all. */
  readonly notAtChains?: readonly ChainId[];
}

/**
 * The product catalogue behind the demo dataset.
 *
 * One entry per canonical ingredient, with the pack sizes that are actually on
 * the shelf. Prices here are *reference* prices; `products.ts` applies a
 * per-chain, per-category multiplier so that (as in real life) one chain is
 * cheaper on produce while another is cheaper on meat. That is what makes the
 * two-store comparison meaningful instead of decorative.
 *
 * All prices are synthetic. They are shaped to be plausible for the Netherlands
 * but they are not scraped from any retailer.
 */
export const SEED_CATALOGUE: readonly SeedCatalogueEntry[] = [
  // ---- Groente & fruit ----------------------------------------------------
  { ingredientId: 'ui', productName: 'Uien', packs: [
    { amount: 1, unit: 'kg', referencePriceCents: 149 },
    { amount: 500, unit: 'g', referencePriceCents: 99, chains: ['ah', 'plus'] },
  ] },
  { ingredientId: 'rode-ui', productName: 'Rode uien', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'knoflook', productName: 'Knoflook', packs: [
    { amount: 150, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'wortel', productName: 'Winterpeen', packs: [
    { amount: 1, unit: 'kg', referencePriceCents: 129 },
    { amount: 500, unit: 'g', referencePriceCents: 89 },
  ] },
  { ingredientId: 'broccoli', productName: 'Broccoli', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 149 },
    { amount: 750, unit: 'g', referencePriceCents: 209, chains: ['jumbo', 'lidl'] },
  ] },
  { ingredientId: 'bloemkool', productName: 'Bloemkool', packs: [
    { amount: 700, unit: 'g', referencePriceCents: 179 },
  ] },
  { ingredientId: 'courgette', productName: 'Courgette', packs: [
    { amount: 300, unit: 'g', referencePriceCents: 99 },
  ] },
  { ingredientId: 'aubergine', productName: 'Aubergine', packs: [
    { amount: 280, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'paprika-rood', productName: 'Rode paprika', packs: [
    { amount: 160, unit: 'g', referencePriceCents: 89 },
    { amount: 500, unit: 'g', referencePriceCents: 229 },
  ] },
  { ingredientId: 'paprika-geel', productName: 'Gele paprika', packs: [
    { amount: 160, unit: 'g', referencePriceCents: 89 },
    { amount: 500, unit: 'g', referencePriceCents: 239 },
  ] },
  { ingredientId: 'tomaat', productName: 'Tomaten', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 179 },
  ] },
  { ingredientId: 'cherrytomaat', productName: 'Cherrytomaten', packs: [
    { amount: 250, unit: 'g', referencePriceCents: 149 },
    { amount: 500, unit: 'g', referencePriceCents: 269, chains: ['ah', 'jumbo'] },
  ] },
  { ingredientId: 'champignons', productName: 'Champignons', packs: [
    { amount: 250, unit: 'g', referencePriceCents: 129 },
    { amount: 500, unit: 'g', referencePriceCents: 219 },
  ] },
  { ingredientId: 'spinazie', productName: 'Verse spinazie', packs: [
    { amount: 300, unit: 'g', referencePriceCents: 199 },
  ] },
  { ingredientId: 'sperziebonen', productName: 'Sperziebonen', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 229 },
  ] },
  { ingredientId: 'prei', productName: 'Prei', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 149 },
  ] },
  { ingredientId: 'aardappel', productName: 'Kruimige aardappelen', packs: [
    { amount: 2.5, unit: 'kg', referencePriceCents: 299 },
    { amount: 1, unit: 'kg', referencePriceCents: 149 },
  ] },
  { ingredientId: 'zoete-aardappel', productName: 'Zoete aardappelen', packs: [
    { amount: 1, unit: 'kg', referencePriceCents: 229 },
  ] },
  { ingredientId: 'komkommer', productName: 'Komkommer', packs: [
    { amount: 350, unit: 'g', referencePriceCents: 89 },
  ] },
  { ingredientId: 'ijsbergsla', productName: 'IJsbergsla', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 119 },
  ] },
  { ingredientId: 'rucola', productName: 'Rucola', packs: [
    { amount: 75, unit: 'g', referencePriceCents: 129 },
    { amount: 150, unit: 'g', referencePriceCents: 219, chains: ['ah', 'jumbo'] },
  ] },
  { ingredientId: 'avocado', productName: 'Avocado', packs: [
    { amount: 340, unit: 'g', referencePriceCents: 249 },
  ] },
  { ingredientId: 'citroen', productName: 'Citroenen', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 199 },
    { amount: 100, unit: 'g', referencePriceCents: 55 },
  ] },
  { ingredientId: 'limoen', productName: 'Limoenen', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 149 },
  ] },
  { ingredientId: 'spitskool', productName: 'Spitskool', packs: [
    { amount: 700, unit: 'g', referencePriceCents: 149 },
  ] },
  { ingredientId: 'boerenkool', productName: 'Boerenkool gesneden', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 189 },
  ] },
  { ingredientId: 'andijvie', productName: 'Andijvie gesneden', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 179 },
  ] },
  { ingredientId: 'pompoen', productName: 'Pompoen', packs: [
    { amount: 1, unit: 'kg', referencePriceCents: 249 },
  ] },
  { ingredientId: 'doperwten', productName: 'Doperwten diepvries', packs: [
    { amount: 750, unit: 'g', referencePriceCents: 189 },
  ] },
  { ingredientId: 'bosui', productName: 'Bosui', packs: [
    { amount: 100, unit: 'g', referencePriceCents: 99 },
  ] },
  { ingredientId: 'gember', productName: 'Verse gember', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 179 },
  ] },
  { ingredientId: 'tauge', productName: 'Tauge', packs: [
    { amount: 300, unit: 'g', referencePriceCents: 129 },
  ], notAtChains: ['lidl'] },
  { ingredientId: 'snijbonen', productName: 'Snijbonen', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 199 },
  ] },
  { ingredientId: 'appel', productName: 'Elstar appels', packs: [
    { amount: 1, unit: 'kg', referencePriceCents: 219 },
  ] },
  { ingredientId: 'venkel', productName: 'Venkel', packs: [
    { amount: 300, unit: 'g', referencePriceCents: 149 },
  ], notAtChains: ['lidl'] },
  { ingredientId: 'rode-peper', productName: 'Rode peper', packs: [
    { amount: 60, unit: 'g', referencePriceCents: 129 },
  ] },

  // ---- Vlees, vis & vervangers -------------------------------------------
  { ingredientId: 'kipfilet', productName: 'Kipfilet', packs: [
    { amount: 300, unit: 'g', referencePriceCents: 379 },
    { amount: 500, unit: 'g', referencePriceCents: 579 },
    { amount: 600, unit: 'g', referencePriceCents: 679, chains: ['ah'] },
    { amount: 1, unit: 'kg', referencePriceCents: 1049, chains: ['jumbo', 'lidl'] },
  ] },
  { ingredientId: 'kipdijfilet', productName: 'Kipdijfilet', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 499 },
  ] },
  { ingredientId: 'gehakt-rund', productName: 'Rundergehakt', packs: [
    { amount: 300, unit: 'g', referencePriceCents: 349 },
    { amount: 500, unit: 'g', referencePriceCents: 549 },
  ] },
  { ingredientId: 'gehakt-half', productName: 'Half-om-half gehakt', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 449 },
  ] },
  { ingredientId: 'runderstoof', productName: 'Runderstoofvlees', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 749 },
  ] },
  { ingredientId: 'varkenshaas', productName: 'Varkenshaas', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 799 },
  ] },
  { ingredientId: 'spekblokjes', productName: 'Spekblokjes', packs: [
    { amount: 250, unit: 'g', referencePriceCents: 229 },
  ] },
  { ingredientId: 'runderlever', productName: 'Runderlever', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 449 },
  ], notAtChains: ['lidl', 'plus'] },
  { ingredientId: 'zalmfilet', productName: 'Zalmfilet', packs: [
    { amount: 250, unit: 'g', referencePriceCents: 599 },
    { amount: 500, unit: 'g', referencePriceCents: 1099 },
  ] },
  { ingredientId: 'gerookte-zalm', productName: 'Gerookte zalm', packs: [
    { amount: 150, unit: 'g', referencePriceCents: 449 },
  ] },
  { ingredientId: 'tonijnsteak', productName: 'Tonijnsteak', packs: [
    { amount: 250, unit: 'g', referencePriceCents: 699 },
  ], notAtChains: ['lidl'] },
  { ingredientId: 'kabeljauw', productName: 'Kabeljauwfilet', packs: [
    { amount: 300, unit: 'g', referencePriceCents: 599 },
  ] },
  { ingredientId: 'garnalen', productName: 'Garnalen', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 499 },
  ] },
  { ingredientId: 'ei', productName: 'Eieren vrije uitloop', packs: [
    { amount: 6, unit: 'piece', referencePriceCents: 179 },
    { amount: 10, unit: 'piece', referencePriceCents: 269 },
  ] },
  { ingredientId: 'vega-gehakt', productName: 'Vegetarisch gehakt', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 279 },
  ] },
  { ingredientId: 'tofu', productName: 'Tofu naturel', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 279 },
  ] },
  { ingredientId: 'tempeh', productName: 'Tempeh', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 249 },
  ], notAtChains: ['lidl'] },
  { ingredientId: 'falafel', productName: 'Falafel', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 299 },
  ] },

  // ---- Zuivel -------------------------------------------------------------
  { ingredientId: 'melk', productName: 'Halfvolle melk', packs: [
    { amount: 1, unit: 'l', referencePriceCents: 119 },
    { amount: 1.5, unit: 'l', referencePriceCents: 165 },
  ] },
  { ingredientId: 'yoghurt', productName: 'Volle yoghurt', packs: [
    { amount: 1, unit: 'l', referencePriceCents: 139 },
  ] },
  { ingredientId: 'griekse-yoghurt', productName: 'Griekse yoghurt', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 199 },
  ] },
  { ingredientId: 'kookroom', productName: 'Kookroom', packs: [
    { amount: 250, unit: 'ml', referencePriceCents: 119 },
  ] },
  { ingredientId: 'creme-fraiche', productName: 'Crème fraîche', packs: [
    { amount: 125, unit: 'g', referencePriceCents: 109 },
  ] },
  { ingredientId: 'geraspte-kaas', productName: 'Geraspte belegen kaas', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 279 },
    { amount: 400, unit: 'g', referencePriceCents: 499 },
  ] },
  { ingredientId: 'parmezaan', productName: 'Parmigiano Reggiano', packs: [
    { amount: 100, unit: 'g', referencePriceCents: 349 },
  ] },
  { ingredientId: 'mozzarella', productName: 'Mozzarella', packs: [
    { amount: 125, unit: 'g', referencePriceCents: 109 },
  ] },
  { ingredientId: 'feta', productName: 'Feta', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 229 },
  ] },
  { ingredientId: 'blauwe-kaas', productName: 'Blauwe kaas', packs: [
    { amount: 150, unit: 'g', referencePriceCents: 299 },
  ], notAtChains: ['lidl'] },
  { ingredientId: 'roomboter', productName: 'Roomboter', packs: [
    { amount: 250, unit: 'g', referencePriceCents: 279 },
  ] },
  { ingredientId: 'kwark', productName: 'Magere kwark', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 149 },
  ] },

  // ---- Brood & granen -----------------------------------------------------
  { ingredientId: 'spaghetti', productName: 'Spaghetti', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 109 },
    { amount: 1, unit: 'kg', referencePriceCents: 189, chains: ['jumbo', 'lidl'] },
  ] },
  { ingredientId: 'penne', productName: 'Penne', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 109 },
  ] },
  { ingredientId: 'macaroni', productName: 'Macaroni', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 109 },
  ] },
  { ingredientId: 'lasagnebladen', productName: 'Lasagnebladen', packs: [
    { amount: 250, unit: 'g', referencePriceCents: 149 },
  ] },
  { ingredientId: 'witte-rijst', productName: 'Witte rijst', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 109 },
    { amount: 1, unit: 'kg', referencePriceCents: 199 },
  ] },
  { ingredientId: 'basmatirijst', productName: 'Basmatirijst', packs: [
    { amount: 1, unit: 'kg', referencePriceCents: 279 },
    { amount: 500, unit: 'g', referencePriceCents: 169, chains: ['ah', 'plus'] },
  ] },
  { ingredientId: 'zilvervliesrijst', productName: 'Zilvervliesrijst', packs: [
    { amount: 1, unit: 'kg', referencePriceCents: 249 },
  ] },
  { ingredientId: 'couscous', productName: 'Couscous', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 179 },
  ] },
  { ingredientId: 'bulgur', productName: 'Bulgur', packs: [
    { amount: 500, unit: 'g', referencePriceCents: 189 },
  ], notAtChains: ['lidl'] },
  { ingredientId: 'quinoa', productName: 'Quinoa', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 299 },
  ] },
  { ingredientId: 'mie', productName: 'Mienoedels', packs: [
    { amount: 250, unit: 'g', referencePriceCents: 119 },
  ] },
  { ingredientId: 'wraps', productName: 'Tarwewraps', packs: [
    { amount: 8, unit: 'piece', referencePriceCents: 169 },
  ] },
  { ingredientId: 'pitabrood', productName: 'Pitabrood', packs: [
    { amount: 6, unit: 'piece', referencePriceCents: 129 },
  ] },
  { ingredientId: 'stokbrood', productName: 'Stokbrood', packs: [
    { amount: 250, unit: 'g', referencePriceCents: 99 },
  ] },
  { ingredientId: 'paneermeel', productName: 'Paneermeel', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 119 },
  ] },
  { ingredientId: 'bloem', productName: 'Tarwebloem', packs: [
    { amount: 1, unit: 'kg', referencePriceCents: 89 },
  ] },

  // ---- Conserven ----------------------------------------------------------
  { ingredientId: 'tomatenblokjes', productName: 'Tomatenblokjes', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 79 },
    { amount: 800, unit: 'g', referencePriceCents: 149, chains: ['jumbo', 'plus'] },
  ] },
  { ingredientId: 'passata', productName: 'Passata', packs: [
    { amount: 700, unit: 'ml', referencePriceCents: 129 },
  ] },
  { ingredientId: 'tomatenpuree', productName: 'Tomatenpuree', packs: [
    { amount: 140, unit: 'g', referencePriceCents: 79 },
  ] },
  { ingredientId: 'kokosmelk', productName: 'Kokosmelk', packs: [
    { amount: 400, unit: 'ml', referencePriceCents: 149 },
  ] },
  { ingredientId: 'kikkererwten', productName: 'Kikkererwten', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 89 },
    { amount: 800, unit: 'g', referencePriceCents: 159, chains: ['lidl', 'jumbo'] },
  ] },
  { ingredientId: 'kidneybonen', productName: 'Kidneybonen', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 89 },
  ] },
  { ingredientId: 'bruine-bonen', productName: 'Bruine bonen', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 89 },
  ] },
  { ingredientId: 'zwarte-bonen', productName: 'Zwarte bonen', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 99 },
  ] },
  { ingredientId: 'linzen', productName: 'Linzen', packs: [
    { amount: 400, unit: 'g', referencePriceCents: 109 },
  ] },
  { ingredientId: 'mais', productName: 'Maïs', packs: [
    { amount: 300, unit: 'g', referencePriceCents: 99 },
  ] },
  { ingredientId: 'tonijn-blik', productName: 'Tonijn in blik', packs: [
    { amount: 145, unit: 'g', referencePriceCents: 179 },
  ] },
  { ingredientId: 'olijven', productName: 'Groene olijven', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 179 },
  ] },
  { ingredientId: 'zongedroogde-tomaten', productName: 'Zongedroogde tomaten', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 249 },
  ], notAtChains: ['lidl'] },

  // ---- Kruiden & specerijen ----------------------------------------------
  { ingredientId: 'olijfolie', productName: 'Olijfolie extra vierge', packs: [
    { amount: 500, unit: 'ml', referencePriceCents: 449 },
    { amount: 1, unit: 'l', referencePriceCents: 799 },
  ] },
  { ingredientId: 'zonnebloemolie', productName: 'Zonnebloemolie', packs: [
    { amount: 1, unit: 'l', referencePriceCents: 249 },
  ] },
  { ingredientId: 'sojasaus', productName: 'Sojasaus', packs: [
    { amount: 250, unit: 'ml', referencePriceCents: 189 },
  ] },
  { ingredientId: 'ketjap', productName: 'Ketjap manis', packs: [
    { amount: 500, unit: 'ml', referencePriceCents: 229 },
  ] },
  { ingredientId: 'sambal', productName: 'Sambal oelek', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 189 },
  ] },
  { ingredientId: 'rode-currypasta', productName: 'Rode currypasta', packs: [
    { amount: 195, unit: 'g', referencePriceCents: 249 },
  ], notAtChains: ['plus'] },
  { ingredientId: 'paprikapoeder', productName: 'Paprikapoeder', packs: [
    { amount: 50, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'komijn', productName: 'Komijnpoeder', packs: [
    { amount: 40, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'kerriepoeder', productName: 'Kerriepoeder', packs: [
    { amount: 50, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'kurkuma', productName: 'Kurkuma', packs: [
    { amount: 40, unit: 'g', referencePriceCents: 139 },
  ] },
  { ingredientId: 'italiaanse-kruiden', productName: 'Italiaanse kruiden', packs: [
    { amount: 20, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'oregano', productName: 'Oregano', packs: [
    { amount: 15, unit: 'g', referencePriceCents: 119 },
  ] },
  { ingredientId: 'chilipoeder', productName: 'Chilipoeder', packs: [
    { amount: 40, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'kaneel', productName: 'Kaneel', packs: [
    { amount: 40, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'groentebouillon', productName: 'Groentebouillonblokjes', packs: [
    { amount: 66, unit: 'g', referencePriceCents: 99 },
  ] },
  { ingredientId: 'verse-peterselie', productName: 'Verse peterselie', packs: [
    { amount: 30, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'verse-basilicum', productName: 'Verse basilicum', packs: [
    { amount: 30, unit: 'g', referencePriceCents: 179 },
  ] },
  { ingredientId: 'verse-koriander', productName: 'Verse koriander', packs: [
    { amount: 30, unit: 'g', referencePriceCents: 129 },
  ] },
  { ingredientId: 'mosterd', productName: 'Mosterd', packs: [
    { amount: 235, unit: 'g', referencePriceCents: 119 },
  ] },
  { ingredientId: 'honing', productName: 'Honing', packs: [
    { amount: 350, unit: 'g', referencePriceCents: 299 },
  ] },
  { ingredientId: 'pindakaas', productName: 'Pindakaas', packs: [
    { amount: 350, unit: 'g', referencePriceCents: 229 },
    { amount: 600, unit: 'g', referencePriceCents: 349, chains: ['ah', 'jumbo'] },
  ] },
  { ingredientId: 'sesamzaad', productName: 'Sesamzaad', packs: [
    { amount: 100, unit: 'g', referencePriceCents: 149 },
  ] },
  { ingredientId: 'walnoten', productName: 'Walnoten', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 349 },
  ] },
  { ingredientId: 'cashewnoten', productName: 'Cashewnoten', packs: [
    { amount: 200, unit: 'g', referencePriceCents: 329 },
  ] },
  { ingredientId: 'azijn', productName: 'Witte wijnazijn', packs: [
    { amount: 500, unit: 'ml', referencePriceCents: 129 },
  ] },
];

/**
 * Promotions, keyed by chain + ingredient + pack size.
 *
 * Deliberately includes an expired promotion, a future one, and a "from two
 * units" offer, so the pricing engine's edge cases are exercised by the demo
 * data itself and not only by unit tests.
 */
export interface SeedPromotionEntry extends SeedPromotionSpec {
  readonly chainId: ChainId;
  readonly ingredientId: string;
  /** Pack size in the authoring unit used in SEED_CATALOGUE. */
  readonly packAmount: number;
}

export const SEED_PROMOTIONS: readonly SeedPromotionEntry[] = [
  { chainId: 'jumbo', ingredientId: 'kipfilet', packAmount: 500, type: 'ONE_PLUS_ONE', minUnits: 2, label: '1 + 1 gratis' },
  { chainId: 'ah', ingredientId: 'kipfilet', packAmount: 600, type: 'FIXED_PRICE', unitPriceCents: 599, minUnits: 1, label: 'Bonus: €5,99' },
  { chainId: 'lidl', ingredientId: 'broccoli', packAmount: 500, type: 'PERCENT_OFF', percent: 25, minUnits: 1, label: '25% korting' },
  { chainId: 'ah', ingredientId: 'broccoli', packAmount: 500, type: 'N_FOR_X', bundleSize: 2, bundlePriceCents: 250, minUnits: 2, label: '2 voor €2,50' },
  { chainId: 'jumbo', ingredientId: 'geraspte-kaas', packAmount: 400, type: 'ONE_PLUS_ONE', minUnits: 2, label: '1 + 1 gratis' },
  { chainId: 'lidl', ingredientId: 'melk', packAmount: 1.5, type: 'FIXED_PRICE', unitPriceCents: 129, minUnits: 1, label: 'Weekdeal €1,29' },
  { chainId: 'ah', ingredientId: 'spaghetti', packAmount: 500, type: 'N_FOR_X', bundleSize: 2, bundlePriceCents: 175, minUnits: 2, label: '2 voor €1,75' },
  { chainId: 'plus', ingredientId: 'penne', packAmount: 500, type: 'PERCENT_OFF', percent: 30, minUnits: 1, label: '30% korting' },
  { chainId: 'jumbo', ingredientId: 'tomatenblokjes', packAmount: 400, type: 'N_FOR_X', bundleSize: 4, bundlePriceCents: 250, minUnits: 4, label: '4 voor €2,50' },
  { chainId: 'lidl', ingredientId: 'aardappel', packAmount: 2.5, type: 'FIXED_PRICE', unitPriceCents: 199, minUnits: 1, label: 'Weekdeal €1,99' },
  { chainId: 'ah', ingredientId: 'zalmfilet', packAmount: 250, type: 'PERCENT_OFF', percent: 30, minUnits: 1, label: '30% korting' },
  { chainId: 'jumbo', ingredientId: 'gehakt-rund', packAmount: 500, type: 'FIXED_PRICE', unitPriceCents: 429, minUnits: 1, label: 'Nu €4,29' },
  { chainId: 'lidl', ingredientId: 'paprika-rood', packAmount: 500, type: 'ONE_PLUS_ONE', minUnits: 2, label: '1 + 1 gratis' },
  { chainId: 'ah', ingredientId: 'avocado', packAmount: 340, type: 'N_FOR_X', bundleSize: 2, bundlePriceCents: 300, minUnits: 2, label: '2 voor €3,00' },
  { chainId: 'plus', ingredientId: 'kipdijfilet', packAmount: 500, type: 'PERCENT_OFF', percent: 20, minUnits: 1, label: '20% korting' },
  { chainId: 'jumbo', ingredientId: 'witte-rijst', packAmount: 1, type: 'FIXED_PRICE', unitPriceCents: 159, minUnits: 1, label: 'Nu €1,59' },
  { chainId: 'lidl', ingredientId: 'griekse-yoghurt', packAmount: 500, type: 'N_FOR_X', bundleSize: 2, bundlePriceCents: 300, minUnits: 2, label: '2 voor €3,00' },
  { chainId: 'ah', ingredientId: 'roomboter', packAmount: 250, type: 'PERCENT_OFF', percent: 25, minUnits: 1, label: '25% korting' },
  { chainId: 'jumbo', ingredientId: 'champignons', packAmount: 500, type: 'FIXED_PRICE', unitPriceCents: 179, minUnits: 1, label: 'Nu €1,79' },
  { chainId: 'lidl', ingredientId: 'olijfolie', packAmount: 500, type: 'FIXED_PRICE', unitPriceCents: 349, minUnits: 1, label: 'Weekdeal €3,49' },
  { chainId: 'ah', ingredientId: 'wraps', packAmount: 8, type: 'ONE_PLUS_ONE', minUnits: 2, label: '1 + 1 gratis' },
  { chainId: 'plus', ingredientId: 'feta', packAmount: 200, type: 'PERCENT_OFF', percent: 20, minUnits: 1, label: '20% korting' },
  { chainId: 'jumbo', ingredientId: 'courgette', packAmount: 300, type: 'N_FOR_X', bundleSize: 2, bundlePriceCents: 150, minUnits: 2, label: '2 voor €1,50' },
  { chainId: 'lidl', ingredientId: 'wortel', packAmount: 1, type: 'FIXED_PRICE', unitPriceCents: 89, minUnits: 1, label: 'Weekdeal €0,89' },
  { chainId: 'ah', ingredientId: 'kokosmelk', packAmount: 400, type: 'N_FOR_X', bundleSize: 3, bundlePriceCents: 349, minUnits: 3, label: '3 voor €3,49' },
  { chainId: 'jumbo', ingredientId: 'spekblokjes', packAmount: 250, type: 'ONE_PLUS_ONE', minUnits: 2, label: '1 + 1 gratis' },
  { chainId: 'lidl', ingredientId: 'ei', packAmount: 10, type: 'FIXED_PRICE', unitPriceCents: 199, minUnits: 1, label: 'Weekdeal €1,99' },
  { chainId: 'jumbo', ingredientId: 'mie', packAmount: 250, type: 'N_FOR_X', bundleSize: 2, bundlePriceCents: 179, minUnits: 2, label: '2e halve prijs' },
  { chainId: 'plus', ingredientId: 'basmatirijst', packAmount: 500, type: 'PERCENT_OFF', percent: 15, minUnits: 1, label: '15% korting' },
  { chainId: 'ah', ingredientId: 'cherrytomaat', packAmount: 500, type: 'FIXED_PRICE', unitPriceCents: 199, minUnits: 1, label: 'Bonus €1,99' },
  // Deliberately inactive, so the expiry and start-date paths are exercised.
  { chainId: 'ah', ingredientId: 'penne', packAmount: 500, type: 'FIXED_PRICE', unitPriceCents: 79, minUnits: 1, label: 'Verlopen actie', window: 'expired' },
  { chainId: 'plus', ingredientId: 'tomatenpuree', packAmount: 140, type: 'PERCENT_OFF', percent: 40, minUnits: 1, label: 'Binnenkort', window: 'future' },
];
