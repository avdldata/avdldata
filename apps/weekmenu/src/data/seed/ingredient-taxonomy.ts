import type { IngredientVariant } from '@/domain/ingredients/taxonomy';

/**
 * The taxonomy layer, filled in by hand from the measured opportunity list.
 *
 * Every row here is a decision about what a food *is*, and none of them can be
 * derived from a product name. "Fusilli" is pasta; "hummus" is not chickpeas;
 * "frozen spinach" is spinach in a state a salad cannot use. Those three
 * sentences are the whole content of this file, repeated fifty-two times.
 */

/** How a measured opportunity concept relates to what we already model. */
export type TaxonomyClass =
  /** A food we do not model at all, and should. */
  | 'NEW_CANONICAL_INGREDIENT'
  /** The same food, narrowed: fusilli under pasta. */
  | 'SUBTYPE_OF_EXISTING'
  /** The same food in another retail state: frozen spinach, baby potatoes. */
  | 'RETAIL_FORM_OF_EXISTING'
  /** Several foods sold as one product: pesto, hummus, pasta sauce. */
  | 'COMPOSITE_INGREDIENT'
  /** Real food, but not something a dinner planner should carry. */
  | 'SHOULD_NOT_MODEL';

export interface TaxonomyDecision {
  /** The candidate id from `scripts/coverage-gap.ts`. */
  readonly candidateId: string;
  readonly label: string;
  readonly klass: TaxonomyClass;
  /** The canonical ingredient it becomes, or lives under. */
  readonly target?: string;
  /** In the first implemented batch? */
  readonly inFirstBatch: boolean;
  readonly reason: string;
}

/**
 * All fifty-two concepts that touch at least one real promotion.
 *
 * The point of classifying every one of them, rather than only the batch we
 * implement, is question 6: how many of these are *genuinely* new top-level
 * ingredients? Counting only what we built would answer a different question.
 */
export const TAXONOMY_DECISIONS: readonly TaxonomyDecision[] = [
  // ---- pasta ---------------------------------------------------------------
  {
    candidateId: 'fusilli',
    label: 'Fusilli',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'pasta',
    inFirstBatch: true,
    reason: 'Een vorm van droge tarwepasta. Zelfde voedingswaarde, zelfde gebruik.',
  },
  {
    candidateId: 'tagliatelle',
    label: 'Tagliatelle',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'pasta',
    inFirstBatch: true,
    reason: 'Idem. Lintvorm verandert het gerecht niet wezenlijk.',
  },
  {
    candidateId: 'orzo',
    label: 'Orzo',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'pasta',
    inFirstBatch: true,
    reason: 'Pasta, maar rijstvormig en vooral voor soep en salade.',
  },
  {
    candidateId: 'rigatoni',
    label: 'Rigatoni',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'pasta',
    inFirstBatch: true,
    reason: 'Vorm van droge pasta.',
  },
  {
    candidateId: 'farfalle',
    label: 'Farfalle',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'pasta',
    inFirstBatch: true,
    reason: 'Vorm van droge pasta.',
  },
  // ---- rijst ---------------------------------------------------------------
  {
    candidateId: 'risottorijst',
    label: 'Risottorijst',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'rijst',
    inFirstBatch: true,
    reason:
      'Rijst, maar de techniek hangt op het zetmeel. Uitdrukkelijk niet inwisselbaar in de andere richting.',
  },
  {
    candidateId: 'pandanrijst',
    label: 'Pandanrijst',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'rijst',
    inFirstBatch: true,
    reason: 'Geurige langkorrelrijst; bruikbaar waar een recept generieke rijst vraagt.',
  },
  {
    candidateId: 'rijstnoedels',
    label: 'Rijstnoedels',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'mie',
    inFirstBatch: false,
    reason: 'Noedel, maar glutenvrij — vraagt dezelfde allergenensplitsing als maïstortilla.',
  },
  {
    candidateId: 'udon',
    label: 'Udonnoedels',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'mie',
    inFirstBatch: false,
    reason: 'Dikke tarwenoedel. Te weinig promoties voor de eerste batch.',
  },
  // ---- brood ---------------------------------------------------------------
  {
    candidateId: 'maistortilla',
    label: 'Maïstortilla',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'maistortilla',
    inFirstBatch: true,
    reason:
      'Geen variant van tarwewraps: een gezamenlijke ouder kan niet één eerlijke allergenenset dragen.',
  },
  {
    candidateId: 'naanbrood',
    label: 'Naanbrood',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'pitabrood',
    inFirstBatch: false,
    reason: 'Platbrood naast pitabrood. Eén promotie.',
  },
  {
    candidateId: 'volkorenbrood',
    label: 'Volkorenbrood',
    klass: 'SHOULD_NOT_MODEL',
    inFirstBatch: false,
    reason: 'Brood is in dit huishouden lunch, niet avondeten. Stokbrood dekt de soepcasus.',
  },
  // ---- groente -------------------------------------------------------------
  {
    candidateId: 'asperges',
    label: 'Asperges',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'asperges',
    inFirstBatch: true,
    reason: 'Gewone groente die wij niet modelleren. 16 promoties.',
  },
  {
    candidateId: 'krieltjes',
    label: 'Krieltjes',
    klass: 'RETAIL_FORM_OF_EXISTING',
    target: 'aardappel',
    inFirstBatch: true,
    reason: 'Kleine vastkokende aardappel. Zelfde ingredient, andere maat.',
  },
  {
    candidateId: 'aardappelpartjes',
    label: 'Aardappelpartjes',
    klass: 'RETAIL_FORM_OF_EXISTING',
    target: 'aardappel',
    inFirstBatch: true,
    reason: 'Voorgesneden, meestal diepvries. Vorm, geen nieuw ingredient.',
  },
  {
    candidateId: 'kastanjechampignons',
    label: 'Kastanjechampignons',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'champignons',
    inFirstBatch: false,
    reason: 'Bruine variant van dezelfde paddenstoel. Twee promoties.',
  },
  {
    candidateId: 'rodekool',
    label: 'Rode kool',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'rode-kool',
    inFirstBatch: false,
    reason: 'Echte nieuwe groente, maar één promotie.',
  },
  {
    candidateId: 'spruitjes',
    label: 'Spruitjes',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'spruitjes',
    inFirstBatch: false,
    reason: 'Echte nieuwe groente, twee promoties.',
  },
  {
    candidateId: 'witlof',
    label: 'Witlof',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'witlof',
    inFirstBatch: false,
    reason: 'Echte nieuwe groente, twee promoties.',
  },
  {
    candidateId: 'radijs',
    label: 'Radijs',
    klass: 'SHOULD_NOT_MODEL',
    inFirstBatch: false,
    reason: 'Garnering bij een salade, geen component van een avondmaaltijd.',
  },
  {
    candidateId: 'diepvriesspinazie',
    label: 'Diepvriesspinazie',
    klass: 'RETAIL_FORM_OF_EXISTING',
    target: 'spinazie',
    inFirstBatch: true,
    reason: 'Spinazie in diepvriesvorm. Alleen bruikbaar waar het recept dat accepteert.',
  },
  // ---- vlees ---------------------------------------------------------------
  {
    candidateId: 'rookworst',
    label: 'Rookworst',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'rookworst',
    inFirstBatch: true,
    reason: 'Wij modelleren geen enkele worst. Stamppot bestaat.',
  },
  {
    candidateId: 'shoarmavlees',
    label: 'Shoarmavlees',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'shoarmavlees',
    inFirstBatch: true,
    reason: 'Gekruid en gesneden vlees dat als één artikel wordt gekocht.',
  },
  {
    candidateId: 'kalkoenfilet',
    label: 'Kalkoenfilet',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'kalkoenfilet',
    inFirstBatch: false,
    reason: 'Eigen vleessoort, maar één promotie.',
  },
  {
    candidateId: 'kipgehakt',
    label: 'Kipgehakt',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'kipgehakt',
    inFirstBatch: false,
    reason: 'Naast rundergehakt en half-om-half. Twee promoties.',
  },
  {
    candidateId: 'gemengd-gehakt',
    label: 'Gemengd gehakt',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'gehakt-half',
    inFirstBatch: true,
    reason:
      'Geen nieuw concept en zelfs geen variant: dit is half-om-half onder een andere naam. Eén alias volstaat.',
  },
  {
    candidateId: 'plantaardig-gehakt',
    label: 'Plantaardig gehakt',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'vega-gehakt',
    inFirstBatch: true,
    reason: 'Alias van vegetarisch gehakt.',
  },
  {
    candidateId: 'kipschnitzel',
    label: 'Kipschnitzel',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'kipschnitzel',
    inFirstBatch: false,
    reason: 'Kip plus paneer plus vet: nutritioneel iets anders dan kipfilet.',
  },
  {
    candidateId: 'varkensribeye',
    label: 'Varkensribeye',
    klass: 'SHOULD_NOT_MODEL',
    inFirstBatch: false,
    reason: 'Eén promotie, zes producten. Te dun om een concept voor te maken.',
  },
  {
    candidateId: 'vega-schnitzel',
    label: 'Vegetarische schnitzel',
    klass: 'SHOULD_NOT_MODEL',
    inFirstBatch: false,
    reason: 'Eén promotie, vier producten.',
  },
  // ---- vis -----------------------------------------------------------------
  {
    candidateId: 'pangasius',
    label: 'Pangasiusfilet',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'kabeljauw',
    inFirstBatch: false,
    reason: 'Witvis naast kabeljauw; vraagt eerst een echte witvis-ouder.',
  },
  {
    candidateId: 'heek',
    label: 'Heekfilet',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'kabeljauw',
    inFirstBatch: false,
    reason: 'Idem.',
  },
  {
    candidateId: 'ansjovis',
    label: 'Ansjovis',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'ansjovis',
    inFirstBatch: false,
    reason: 'Eigen ingredient, maar één promotie.',
  },
  // ---- zuivel --------------------------------------------------------------
  {
    candidateId: 'geitenkaas',
    label: 'Geitenkaas',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'geitenkaas',
    inFirstBatch: true,
    reason:
      'Uitdrukkelijk geen variant van kaas: niemand die "kaas" schrijft bedoelt hiermee geitenkaas.',
  },
  {
    candidateId: 'kaasplakken',
    label: 'Kaasplakken',
    klass: 'RETAIL_FORM_OF_EXISTING',
    target: 'geraspte-kaas',
    inFirstBatch: false,
    reason:
      'Kaas in plakvorm. Zeventien promoties, maar overwegend broodbeleg; eerst de dinerrelevantie meten.',
  },
  {
    candidateId: 'slagroom',
    label: 'Slagroom',
    klass: 'SHOULD_NOT_MODEL',
    inFirstBatch: false,
    reason: 'Nagerecht, geen avondmaaltijd.',
  },
  {
    candidateId: 'sojadrink',
    label: 'Sojadrink',
    klass: 'SUBTYPE_OF_EXISTING',
    target: 'melk',
    inFirstBatch: false,
    reason: 'Plantaardig alternatief; niet inwisselbaar richting melk vanwege allergenen.',
  },
  {
    candidateId: 'karnemelk',
    label: 'Karnemelk',
    klass: 'SHOULD_NOT_MODEL',
    inFirstBatch: false,
    reason: 'Drinkzuivel, zelden een avondmaaltijdingredient.',
  },
  // ---- composites ----------------------------------------------------------
  {
    candidateId: 'hummus',
    label: 'Hummus',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'hummus',
    inFirstBatch: true,
    reason: 'Kikkererwt, tahin, olie, citroen. Niet gelijk aan kikkererwten.',
  },
  {
    candidateId: 'pesto',
    label: 'Pesto',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'pesto',
    inFirstBatch: true,
    reason: 'Basilicum, olie, kaas, pijnboompitten. 450 kcal/100 g tegen 23 voor basilicum.',
  },
  {
    candidateId: 'pastasaus',
    label: 'Pastasaus',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'pastasaus',
    inFirstBatch: true,
    reason: 'Tomaat plus ui, olie, suiker en zout. Niet gelijk aan passata.',
  },
  {
    candidateId: 'roerbakgroentemix',
    label: 'Roerbakgroentemix',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'roerbakgroentemix',
    inFirstBatch: true,
    reason: 'Meerdere groenten als één artikel. Bewust niet ontleed.',
  },
  {
    candidateId: 'satesaus',
    label: 'Satésaus',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'satesaus',
    inFirstBatch: true,
    reason: 'Pinda plus suiker, ketjap en kokos. Niet gelijk aan pindakaas.',
  },
  {
    candidateId: 'sriracha',
    label: 'Sriracha',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'sriracha',
    inFirstBatch: true,
    reason: 'Chilisaus met eigen zoutgehalte. Niet gelijk aan sambal.',
  },
  {
    candidateId: 'taco-kruidenmix',
    label: 'Taco kruidenmix',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'taco-kruidenmix',
    inFirstBatch: true,
    reason: 'Kruidenmengsel dat als één zakje wordt gekocht.',
  },
  {
    candidateId: 'nasi-kruidenmix',
    label: 'Nasi/bami kruidenmix',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'nasi-kruidenmix',
    inFirstBatch: false,
    reason: 'Zelfde soort concept als taco kruidenmix; zes promoties, negen producten.',
  },
  {
    candidateId: 'currysaus',
    label: 'Currysaus',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'currysaus',
    inFirstBatch: false,
    reason: 'Kant-en-klare saus naast onze currypasta.',
  },
  {
    candidateId: 'tzatziki',
    label: 'Tzatziki',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'tzatziki',
    inFirstBatch: false,
    reason: 'Yoghurt, komkommer, knoflook. Drie promoties.',
  },
  {
    candidateId: 'guacamole',
    label: 'Guacamole',
    klass: 'COMPOSITE_INGREDIENT',
    target: 'guacamole',
    inFirstBatch: false,
    reason: 'Avocado plus zuur en zout. Twee promoties.',
  },
  // ---- conserven -----------------------------------------------------------
  {
    candidateId: 'witte-bonen',
    label: 'Witte bonen',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'witte-bonen',
    inFirstBatch: false,
    reason: 'Vierde boon naast kidney, bruin en zwart. Eén promotie.',
  },
  {
    candidateId: 'kappertjes',
    label: 'Kappertjes',
    klass: 'NEW_CANONICAL_INGREDIENT',
    target: 'kappertjes',
    inFirstBatch: false,
    reason: 'Eigen ingredient, twee promoties.',
  },
  {
    candidateId: 'ananas-op-sap',
    label: 'Ananas op sap',
    klass: 'SHOULD_NOT_MODEL',
    inFirstBatch: false,
    reason: 'Fruit op sap; nagerecht.',
  },
];

/**
 * The variants and forms that were actually implemented.
 *
 * Note `risottorijst`: `substitutable: false` is the one flag in this file that
 * does real work. A recipe asking for generic rice will not be served arborio —
 * it costs roughly twice as much and cooks to a different texture, so accepting
 * it would be both a culinary and a financial mistake, silently.
 */
export const SEED_INGREDIENT_VARIANTS: readonly IngredientVariant[] = [
  { id: 'fusilli', parentId: 'pasta', name: 'Fusilli', substitutable: true },
  { id: 'tagliatelle', parentId: 'pasta', name: 'Tagliatelle', substitutable: true },
  { id: 'rigatoni', parentId: 'pasta', name: 'Rigatoni', substitutable: true },
  { id: 'farfalle', parentId: 'pasta', name: 'Farfalle', substitutable: true },
  {
    id: 'orzo',
    parentId: 'pasta',
    name: 'Orzo',
    substitutable: true,
    note: 'Rijstvormige pasta; bruikbaar waar generieke pasta wordt gevraagd.',
  },
  {
    id: 'risottorijst',
    parentId: 'rijst',
    name: 'Risottorijst',
    substitutable: false,
    note: 'Arborio/carnaroli. Duurder en plakkeriger; geen vervanger voor gewone rijst.',
  },
  { id: 'pandanrijst', parentId: 'rijst', name: 'Pandanrijst', substitutable: true },
  {
    id: 'spinazie-diepvries',
    parentId: 'spinazie',
    name: 'Diepvriesspinazie',
    form: 'frozen',
    substitutable: true,
    note: 'Alleen bruikbaar waar het recept diepvries accepteert.',
  },
  {
    id: 'krieltjes',
    parentId: 'aardappel',
    name: 'Krieltjes',
    form: 'baby',
    substitutable: true,
  },
  {
    id: 'aardappelpartjes',
    parentId: 'aardappel',
    name: 'Aardappelpartjes',
    form: 'frozen',
    substitutable: true,
  },
];
