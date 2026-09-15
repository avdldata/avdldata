/**
 * Every product the expanded catalogue matches without a human, checked by hand.
 *
 * All 81 rows were read one by one when this phase measured matcher
 * precision on the new concepts: 81/81 were correct. The file exists so
 * that a later change to the vocabulary cannot quietly lower that number — a
 * wrong AUTO_APPROVED is the one matching error nobody sees, because it never
 * reaches the review queue.
 *
 * Regenerated deliberately, never automatically: if a row here starts failing,
 * the question is whether the matcher got worse, not whether the file is stale.
 */
export interface TaxonomyGoldenRow {
  readonly chainId: 'ah' | 'jumbo';
  readonly productName: string;
  readonly ingredientId: string;
  readonly variantId?: string;
}

export const TAXONOMY_GOLDEN: readonly TaxonomyGoldenRow[] = [
  {
    chainId: 'ah',
    productName: 'AH Biologisch Farfalle',
    ingredientId: 'pasta',
    variantId: 'farfalle',
  },
  {
    chainId: 'ah',
    productName: 'AH Biologisch Fusilli',
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  {
    chainId: 'ah',
    productName: 'AH Biologisch Fusilli volkoren',
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  {
    chainId: 'ah',
    productName: 'AH Biologisch Geitenkaas jong belegen 50+ stuk',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'ah',
    productName: 'AH Biologisch Geitenkaas naturel 48+',
    ingredientId: 'geitenkaas',
  },
  { chainId: 'ah', productName: 'AH Biologisch Groene pesto', ingredientId: 'pesto' },
  { chainId: 'ah', productName: 'AH Biologisch Orzo', ingredientId: 'pasta', variantId: 'orzo' },
  {
    chainId: 'ah',
    productName: 'AH Biologisch Orzo volkoren',
    ingredientId: 'pasta',
    variantId: 'orzo',
  },
  { chainId: 'ah', productName: 'AH Biologisch Rookworst', ingredientId: 'rookworst' },
  {
    chainId: 'ah',
    productName: 'AH Biologisch Tagliatelle volkoren',
    ingredientId: 'pasta',
    variantId: 'tagliatelle',
  },
  { chainId: 'ah', productName: 'AH Farfalle', ingredientId: 'pasta', variantId: 'farfalle' },
  { chainId: 'ah', productName: 'AH Fusilli', ingredientId: 'pasta', variantId: 'fusilli' },
  { chainId: 'ah', productName: 'AH Geitenkaas belegen 50+ stuk', ingredientId: 'geitenkaas' },
  { chainId: 'ah', productName: 'AH Geitenkaas jong belegen 30+ stuk', ingredientId: 'geitenkaas' },
  {
    chainId: 'ah',
    productName: 'AH Geitenkaas jong belegen 50+ stuk klein',
    ingredientId: 'geitenkaas',
  },
  { chainId: 'ah', productName: 'AH Geitenkaas naturel 50+', ingredientId: 'geitenkaas' },
  { chainId: 'ah', productName: 'AH Geitenkaas schijfjes naturel', ingredientId: 'geitenkaas' },
  {
    chainId: 'ah',
    productName: 'AH Glutenvrij Fusilli',
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  { chainId: 'ah', productName: 'AH Groene asperges', ingredientId: 'asperges' },
  { chainId: 'ah', productName: 'AH Groene pesto', ingredientId: 'pesto' },
  { chainId: 'ah', productName: 'AH Groene pesto', ingredientId: 'pesto' },
  { chainId: 'ah', productName: 'AH Rookworst', ingredientId: 'rookworst' },
  { chainId: 'ah', productName: 'AH Rookworst mager', ingredientId: 'rookworst' },
  { chainId: 'ah', productName: 'AH Rookworst mager', ingredientId: 'rookworst' },
  { chainId: 'ah', productName: 'AH Satésaus', ingredientId: 'satesaus' },
  { chainId: 'ah', productName: 'AH Witte asperges', ingredientId: 'asperges' },
  {
    chainId: 'ah',
    productName: "Grand' Italia Fusilli glutenvrij",
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  {
    chainId: 'ah',
    productName: "Grand' Italia Fusilli half volkoren",
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  {
    chainId: 'ah',
    productName: "Grand' Italia Fusilli volkoren",
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  { chainId: 'ah', productName: 'Lassie Gele Rijst', ingredientId: 'rijst' },
  { chainId: 'ah', productName: 'Lassie Orzo', ingredientId: 'pasta', variantId: 'orzo' },
  { chainId: 'ah', productName: 'Lassie Volkoren orzo', ingredientId: 'pasta', variantId: 'orzo' },
  { chainId: 'ah', productName: 'Streeckgenoten Rookworst', ingredientId: 'rookworst' },
  { chainId: 'ah', productName: 'Streeckgenoten Shoarmareepjes', ingredientId: 'shoarmavlees' },
  {
    chainId: 'jumbo',
    productName: 'Fairtrade Original Biologische Pandanrijst 400 g',
    ingredientId: 'rijst',
    variantId: 'pandanrijst',
  },
  { chainId: 'jumbo', productName: 'Go-Tan Sriracha 215ml fles', ingredientId: 'sriracha' },
  {
    chainId: 'jumbo',
    productName: "Grand'Italia Fusilli half volkoren 500 g",
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  {
    chainId: 'jumbo',
    productName: "Grand'Italia Fusilli Volkoren 500 g",
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  {
    chainId: 'jumbo',
    productName: "Grand'Italia Orzo Volkoren 500 g",
    ingredientId: 'pasta',
    variantId: 'orzo',
  },
  {
    chainId: 'jumbo',
    productName: "Grand'Italia Rigatoni Half Volkoren 500 g",
    ingredientId: 'pasta',
    variantId: 'rigatoni',
  },
  { chainId: 'jumbo', productName: 'Jumbo Asperges 185 g', ingredientId: 'asperges' },
  { chainId: 'jumbo', productName: 'Jumbo Asperges 530 g', ingredientId: 'asperges' },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Biologisch Geitenkaas 48+ ca. 125 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Biologisch Geitenkaas 50+ Jong Belegen Stuk ca. 375 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Biologisch Naturel Tagliatelle 500 g',
    ingredientId: 'pasta',
    variantId: 'tagliatelle',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Extra Magere Rookworst 100 g',
    ingredientId: 'rookworst',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Extra Magere Rookworst 275 g',
    ingredientId: 'rookworst',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Extra Magere Rookworst 375 g',
    ingredientId: 'rookworst',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Fusilli 500 g',
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Geitenkaas 50+ Belegen ca. 200 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Geitenkaas 50+ Jong Belegen ca. 200 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Geitenkaas 50+ Jong Belegen Stuk ca. 350 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Geitenkaas Belegen 50+ Stuk ca. 350 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Geitenkaas Jong Belegen 30+ Stuk ca. 350 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Geitenkaas Naturel Mild ca. 115 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Geitenkaas Schijfjes Naturel 125 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Geitenkaas Schijfjes Naturel Voordeelverpakking 2 x 100 g',
    ingredientId: 'geitenkaas',
  },
  { chainId: 'jumbo', productName: 'Jumbo Groene Asperges 350 g', ingredientId: 'asperges' },
  { chainId: 'jumbo', productName: 'Jumbo Groene Pesto 100 g', ingredientId: 'pesto' },
  { chainId: 'jumbo', productName: 'Jumbo Hummus Naturel 200 g', ingredientId: 'hummus' },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Jong Belegen Geitenkaas 50+ 190 g',
    ingredientId: 'geitenkaas',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Pandanrijst 4,5 kg',
    ingredientId: 'rijst',
    variantId: 'pandanrijst',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Pandanrijst Voordeelverpakking 1 kg',
    ingredientId: 'rijst',
    variantId: 'pandanrijst',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Pastasaus Traditioneel 510 g',
    ingredientId: 'pastasaus',
  },
  {
    chainId: 'jumbo',
    productName: 'Jumbo Roerbakmix Hollands 400 g',
    ingredientId: 'roerbakgroentemix',
  },
  { chainId: 'jumbo', productName: 'Jumbo Satésaus Mild 200 g', ingredientId: 'satesaus' },
  { chainId: 'jumbo', productName: 'Jumbo Zwarte Rijst 400 g', ingredientId: 'rijst' },
  {
    chainId: 'jumbo',
    productName: "Jumbo's Biologisch Volkoren Fusilli 500 g",
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  {
    chainId: 'jumbo',
    productName: "Jumbo's Biologisch Volkoren Rigatoni 500 g",
    ingredientId: 'pasta',
    variantId: 'rigatoni',
  },
  {
    chainId: 'jumbo',
    productName: "Jumbo's Farfalle 500 g",
    ingredientId: 'pasta',
    variantId: 'farfalle',
  },
  {
    chainId: 'jumbo',
    productName: "Jumbo's Fusilli 500 g",
    ingredientId: 'pasta',
    variantId: 'fusilli',
  },
  {
    chainId: 'jumbo',
    productName: "Jumbo's Rigatoni 500 g",
    ingredientId: 'pasta',
    variantId: 'rigatoni',
  },
  {
    chainId: 'jumbo',
    productName: "Jumbo's Taco Kruidenmix 15 g",
    ingredientId: 'taco-kruidenmix',
  },
  {
    chainId: 'jumbo',
    productName: "Jumbo's Tagliatelle 250 g",
    ingredientId: 'pasta',
    variantId: 'tagliatelle',
  },
  {
    chainId: 'jumbo',
    productName: "Jumbo's Tagliatelle 500 g",
    ingredientId: 'pasta',
    variantId: 'tagliatelle',
  },
  {
    chainId: 'jumbo',
    productName: "Jumbo's Tagliatelle 500 g",
    ingredientId: 'pasta',
    variantId: 'tagliatelle',
  },
  { chainId: 'jumbo', productName: 'Lassie Gele Rijst 325 g', ingredientId: 'rijst' },
  { chainId: 'jumbo', productName: 'Lassie Orzo 275 g', ingredientId: 'pasta', variantId: 'orzo' },
  {
    chainId: 'jumbo',
    productName: 'Lassie Pandanrijst Voordeelpak 750g',
    ingredientId: 'rijst',
    variantId: 'pandanrijst',
  },
  {
    chainId: 'jumbo',
    productName: 'Lassie Volkoren Orzo 275g',
    ingredientId: 'pasta',
    variantId: 'orzo',
  },
  {
    chainId: 'jumbo',
    productName: 'Santa Maria Taco Kruidenmix Mild 28 g',
    ingredientId: 'taco-kruidenmix',
  },
];
