import type {
  Allergen,
  CanonicalIngredient,
  IngredientCategory,
  Perishability,
  PregnancyRisk,
} from '@/domain/ingredients/types';
import type { BaseUnit } from '@/domain/units';

interface IngredientOptions {
  readonly density?: number;
  readonly pieceWeightGrams?: number;
  readonly allergens?: readonly Allergen[];
  readonly pregnancyRisks?: readonly PregnancyRisk[];
  readonly vegetarian?: boolean;
  readonly vegan?: boolean;
  readonly synonyms?: readonly string[];
  readonly pantryStaple?: boolean;
}

function ing(
  id: string,
  canonicalName: string,
  category: IngredientCategory,
  baseUnit: BaseUnit,
  perishability: Perishability,
  options: IngredientOptions = {},
): CanonicalIngredient {
  return {
    id,
    canonicalName,
    category,
    baseUnit,
    perishability,
    allergens: options.allergens ?? [],
    pregnancyRisks: options.pregnancyRisks ?? [],
    vegetarian: options.vegetarian ?? true,
    vegan: options.vegan ?? (options.vegetarian ?? true),
    synonyms: options.synonyms ?? [],
    ...(options.density !== undefined ? { density: options.density } : {}),
    ...(options.pieceWeightGrams !== undefined
      ? { pieceWeightGrams: options.pieceWeightGrams }
      : {}),
    ...(options.pantryStaple ? { pantryStaple: true } : {}),
  };
}

/**
 * The canonical ingredient catalogue.
 *
 * Every recipe line and every supermarket product points at one of these ids.
 * That single indirection is what makes it possible to add Monday's 300 g of
 * chicken to Wednesday's 200 g, and to compare an Albert Heijn pack with a Lidl
 * pack at all.
 */
export const SEED_INGREDIENTS: readonly CanonicalIngredient[] = [
  // ---- Groente & fruit ----------------------------------------------------
  ing('ui', 'Ui', 'groente-fruit', 'g', 'semi', { pieceWeightGrams: 110, synonyms: ['gele ui', 'uien'] }),
  ing('rode-ui', 'Rode ui', 'groente-fruit', 'g', 'semi', { pieceWeightGrams: 110 }),
  ing('knoflook', 'Knoflook', 'groente-fruit', 'g', 'semi', { pieceWeightGrams: 5, synonyms: ['teentje knoflook', 'knoflookteen'] }),
  ing('wortel', 'Wortel', 'groente-fruit', 'g', 'semi', { pieceWeightGrams: 80, synonyms: ['winterpeen', 'wortelen'] }),
  ing('broccoli', 'Broccoli', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 450 }),
  ing('bloemkool', 'Bloemkool', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 700 }),
  ing('courgette', 'Courgette', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 300 }),
  ing('aubergine', 'Aubergine', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 280 }),
  ing('paprika-rood', 'Rode paprika', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 160, synonyms: ['paprika rood', 'paprika'] }),
  ing('paprika-geel', 'Gele paprika', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 160 }),
  ing('tomaat', 'Tomaat', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 110 }),
  ing('cherrytomaat', 'Cherrytomaten', 'groente-fruit', 'g', 'perishable', {}),
  ing('champignons', 'Champignons', 'groente-fruit', 'g', 'perishable', { synonyms: ['witte champignons'] }),
  ing('spinazie', 'Verse spinazie', 'groente-fruit', 'g', 'perishable', {}),
  ing('sperziebonen', 'Sperziebonen', 'groente-fruit', 'g', 'perishable', {}),
  ing('prei', 'Prei', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 200 }),
  ing('aardappel', 'Aardappelen', 'groente-fruit', 'g', 'semi', { synonyms: ['kruimige aardappelen'] }),
  ing('zoete-aardappel', 'Zoete aardappel', 'groente-fruit', 'g', 'semi', { pieceWeightGrams: 250 }),
  ing('komkommer', 'Komkommer', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 350 }),
  ing('ijsbergsla', 'IJsbergsla', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 400 }),
  ing('rucola', 'Rucola', 'groente-fruit', 'g', 'perishable', {}),
  ing('avocado', 'Avocado', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 170 }),
  ing('citroen', 'Citroen', 'groente-fruit', 'g', 'semi', { pieceWeightGrams: 100 }),
  ing('limoen', 'Limoen', 'groente-fruit', 'g', 'semi', { pieceWeightGrams: 65 }),
  ing('spitskool', 'Spitskool', 'groente-fruit', 'g', 'semi', { pieceWeightGrams: 700 }),
  ing('boerenkool', 'Boerenkool', 'groente-fruit', 'g', 'perishable', {}),
  ing('andijvie', 'Andijvie', 'groente-fruit', 'g', 'perishable', {}),
  ing('pompoen', 'Pompoen', 'groente-fruit', 'g', 'semi', {}),
  ing('doperwten', 'Doperwten (diepvries)', 'groente-fruit', 'g', 'pantry', {}),
  ing('bosui', 'Bosui', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 15 }),
  ing('gember', 'Verse gember', 'groente-fruit', 'g', 'semi', {}),
  ing('tauge', 'Taugé', 'groente-fruit', 'g', 'perishable', {}),
  ing('snijbonen', 'Snijbonen', 'groente-fruit', 'g', 'perishable', {}),
  ing('appel', 'Appel', 'groente-fruit', 'g', 'semi', { pieceWeightGrams: 150 }),
  ing('venkel', 'Venkel', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 300 }),
  ing('rode-peper', 'Rode peper', 'groente-fruit', 'g', 'perishable', { pieceWeightGrams: 15 }),

  // ---- Vlees, vis & vervangers -------------------------------------------
  ing('kipfilet', 'Kipfilet', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false, synonyms: ['kipfilet naturel', 'kipborst'] }),
  ing('kipdijfilet', 'Kipdijfilet', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false }),
  ing('gehakt-rund', 'Rundergehakt', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false }),
  ing('gehakt-half', 'Half-om-half gehakt', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false }),
  ing('runderstoof', 'Runderstoofvlees', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false }),
  ing('varkenshaas', 'Varkenshaas', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false }),
  ing('spekblokjes', 'Spekblokjes', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false }),
  ing('runderlever', 'Runderlever', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false, pregnancyRisks: ['lever-vitamine-a'] }),
  ing('zalmfilet', 'Zalmfilet', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false, allergens: ['vis'] }),
  ing('gerookte-zalm', 'Gerookte zalm', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false, allergens: ['vis'], pregnancyRisks: ['rauwe-vis'] }),
  ing('tonijnsteak', 'Verse tonijnsteak', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false, allergens: ['vis'], pregnancyRisks: ['kwikrijke-vis'] }),
  ing('kabeljauw', 'Kabeljauwfilet', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false, allergens: ['vis'], synonyms: ['witvis'] }),
  ing('garnalen', 'Garnalen', 'vlees-vis-vega', 'g', 'perishable', { vegetarian: false, vegan: false, allergens: ['schaaldieren'] }),
  ing('ei', 'Eieren', 'vlees-vis-vega', 'piece', 'semi', { pieceWeightGrams: 58, vegan: false, allergens: ['ei'] }),
  ing('vega-gehakt', 'Vegetarisch gehakt', 'vlees-vis-vega', 'g', 'semi', { allergens: ['soja', 'gluten'] }),
  ing('tofu', 'Tofu naturel', 'vlees-vis-vega', 'g', 'semi', { allergens: ['soja'] }),
  ing('tempeh', 'Tempeh', 'vlees-vis-vega', 'g', 'semi', { allergens: ['soja'] }),
  ing('falafel', 'Falafel', 'vlees-vis-vega', 'g', 'semi', { allergens: ['sesam'] }),

  // ---- Zuivel -------------------------------------------------------------
  ing('melk', 'Halfvolle melk', 'zuivel', 'ml', 'perishable', { density: 1.03, vegan: false, allergens: ['melk'] }),
  ing('yoghurt', 'Volle yoghurt', 'zuivel', 'ml', 'perishable', { density: 1.03, vegan: false, allergens: ['melk'] }),
  ing('griekse-yoghurt', 'Griekse yoghurt', 'zuivel', 'g', 'perishable', { density: 1.05, vegan: false, allergens: ['melk'] }),
  ing('kookroom', 'Kookroom', 'zuivel', 'ml', 'semi', { density: 1.0, vegan: false, allergens: ['melk'] }),
  ing('creme-fraiche', 'Crème fraîche', 'zuivel', 'g', 'perishable', { density: 1.0, vegan: false, allergens: ['melk'] }),
  ing('geraspte-kaas', 'Geraspte belegen kaas', 'zuivel', 'g', 'semi', { vegan: false, allergens: ['melk'] }),
  ing('parmezaan', 'Parmezaanse kaas', 'zuivel', 'g', 'semi', { vegan: false, allergens: ['melk'] }),
  ing('mozzarella', 'Mozzarella', 'zuivel', 'g', 'perishable', { vegan: false, allergens: ['melk'] }),
  ing('feta', 'Feta', 'zuivel', 'g', 'perishable', { vegan: false, allergens: ['melk'] }),
  ing('blauwe-kaas', 'Blauwe kaas', 'zuivel', 'g', 'perishable', { vegan: false, allergens: ['melk'], pregnancyRisks: ['ongepasteuriseerd'] }),
  ing('roomboter', 'Roomboter', 'zuivel', 'g', 'semi', { vegan: false, allergens: ['melk'] }),
  ing('kwark', 'Magere kwark', 'zuivel', 'g', 'perishable', { vegan: false, allergens: ['melk'] }),

  // ---- Brood & granen -----------------------------------------------------
  ing('spaghetti', 'Spaghetti', 'brood-granen', 'g', 'pantry', { allergens: ['gluten'] }),
  ing('penne', 'Penne', 'brood-granen', 'g', 'pantry', { allergens: ['gluten'] }),
  ing('macaroni', 'Macaroni', 'brood-granen', 'g', 'pantry', { allergens: ['gluten'] }),
  ing('lasagnebladen', 'Lasagnebladen', 'brood-granen', 'g', 'pantry', { allergens: ['gluten', 'ei'] }),
  ing('witte-rijst', 'Witte rijst', 'brood-granen', 'g', 'pantry', {}),
  ing('basmatirijst', 'Basmatirijst', 'brood-granen', 'g', 'pantry', {}),
  ing('zilvervliesrijst', 'Zilvervliesrijst', 'brood-granen', 'g', 'pantry', {}),
  ing('couscous', 'Couscous', 'brood-granen', 'g', 'pantry', { allergens: ['gluten'] }),
  ing('bulgur', 'Bulgur', 'brood-granen', 'g', 'pantry', { allergens: ['gluten'] }),
  ing('quinoa', 'Quinoa', 'brood-granen', 'g', 'pantry', {}),
  ing('mie', 'Mienoedels', 'brood-granen', 'g', 'pantry', { allergens: ['gluten', 'ei'] }),
  ing('wraps', 'Tarwewraps', 'brood-granen', 'piece', 'semi', { pieceWeightGrams: 62, allergens: ['gluten'] }),
  ing('pitabrood', 'Pitabrood', 'brood-granen', 'piece', 'semi', { pieceWeightGrams: 60, allergens: ['gluten'] }),
  ing('stokbrood', 'Stokbrood', 'brood-granen', 'g', 'perishable', { allergens: ['gluten'] }),
  ing('paneermeel', 'Paneermeel', 'brood-granen', 'g', 'pantry', { allergens: ['gluten'] }),
  ing('bloem', 'Tarwebloem', 'brood-granen', 'g', 'pantry', { allergens: ['gluten'] }),

  // ---- Conserven ----------------------------------------------------------
  ing('tomatenblokjes', 'Tomatenblokjes', 'conserven', 'g', 'pantry', { synonyms: ['tomaten in blik'] }),
  ing('passata', 'Passata', 'conserven', 'ml', 'pantry', { density: 1.05 }),
  ing('tomatenpuree', 'Tomatenpuree', 'conserven', 'g', 'pantry', {}),
  ing('kokosmelk', 'Kokosmelk', 'conserven', 'ml', 'pantry', { density: 1.0 }),
  ing('kikkererwten', 'Kikkererwten', 'conserven', 'g', 'pantry', {}),
  ing('kidneybonen', 'Kidneybonen', 'conserven', 'g', 'pantry', {}),
  ing('bruine-bonen', 'Bruine bonen', 'conserven', 'g', 'pantry', {}),
  ing('zwarte-bonen', 'Zwarte bonen', 'conserven', 'g', 'pantry', {}),
  ing('linzen', 'Linzen', 'conserven', 'g', 'pantry', {}),
  ing('mais', 'Maïs', 'conserven', 'g', 'pantry', {}),
  ing('tonijn-blik', 'Tonijn in blik', 'conserven', 'g', 'pantry', { vegetarian: false, vegan: false, allergens: ['vis'] }),
  ing('olijven', 'Olijven', 'conserven', 'g', 'pantry', {}),
  ing('zongedroogde-tomaten', 'Zongedroogde tomaten', 'conserven', 'g', 'pantry', {}),

  // ---- Kruiden & specerijen ----------------------------------------------
  ing('zout', 'Zout', 'kruiden-specerijen', 'g', 'pantry', { density: 1.2, pantryStaple: true }),
  ing('peper', 'Zwarte peper', 'kruiden-specerijen', 'g', 'pantry', { density: 0.5, pantryStaple: true }),
  ing('olijfolie', 'Olijfolie', 'kruiden-specerijen', 'ml', 'pantry', { density: 0.92 }),
  ing('zonnebloemolie', 'Zonnebloemolie', 'kruiden-specerijen', 'ml', 'pantry', { density: 0.92 }),
  ing('sojasaus', 'Sojasaus', 'kruiden-specerijen', 'ml', 'pantry', { density: 1.1, allergens: ['soja', 'gluten'] }),
  ing('ketjap', 'Ketjap manis', 'kruiden-specerijen', 'ml', 'pantry', { density: 1.2, allergens: ['soja', 'gluten'] }),
  ing('sambal', 'Sambal', 'kruiden-specerijen', 'g', 'pantry', { density: 1.0 }),
  ing('rode-currypasta', 'Rode currypasta', 'kruiden-specerijen', 'g', 'pantry', { density: 1.0, allergens: ['schaaldieren'] }),
  ing('paprikapoeder', 'Paprikapoeder', 'kruiden-specerijen', 'g', 'pantry', { density: 0.5 }),
  ing('komijn', 'Komijnpoeder', 'kruiden-specerijen', 'g', 'pantry', { density: 0.5, synonyms: ['djinten'] }),
  ing('kerriepoeder', 'Kerriepoeder', 'kruiden-specerijen', 'g', 'pantry', { density: 0.5 }),
  ing('kurkuma', 'Kurkuma', 'kruiden-specerijen', 'g', 'pantry', { density: 0.5 }),
  ing('italiaanse-kruiden', 'Italiaanse kruiden', 'kruiden-specerijen', 'g', 'pantry', { density: 0.3 }),
  ing('oregano', 'Oregano', 'kruiden-specerijen', 'g', 'pantry', { density: 0.3 }),
  ing('chilipoeder', 'Chilipoeder', 'kruiden-specerijen', 'g', 'pantry', { density: 0.5 }),
  ing('kaneel', 'Kaneel', 'kruiden-specerijen', 'g', 'pantry', { density: 0.5 }),
  ing('groentebouillon', 'Groentebouillonblokjes', 'kruiden-specerijen', 'g', 'pantry', { allergens: ['selderij'] }),
  ing('verse-peterselie', 'Verse peterselie', 'kruiden-specerijen', 'g', 'perishable', {}),
  ing('verse-basilicum', 'Verse basilicum', 'kruiden-specerijen', 'g', 'perishable', {}),
  ing('verse-koriander', 'Verse koriander', 'kruiden-specerijen', 'g', 'perishable', {}),
  ing('mosterd', 'Mosterd', 'kruiden-specerijen', 'g', 'pantry', { density: 1.0, allergens: ['mosterd'] }),
  ing('honing', 'Honing', 'kruiden-specerijen', 'g', 'pantry', { density: 1.4, vegan: false }),
  ing('pindakaas', 'Pindakaas', 'kruiden-specerijen', 'g', 'pantry', { density: 1.0, allergens: ['pinda'] }),
  ing('sesamzaad', 'Sesamzaad', 'kruiden-specerijen', 'g', 'pantry', { allergens: ['sesam'] }),
  ing('walnoten', 'Walnoten', 'kruiden-specerijen', 'g', 'pantry', { allergens: ['noten'] }),
  ing('cashewnoten', 'Cashewnoten', 'kruiden-specerijen', 'g', 'pantry', { allergens: ['noten'] }),
  ing('azijn', 'Witte wijnazijn', 'kruiden-specerijen', 'ml', 'pantry', { density: 1.0, allergens: ['sulfiet'] }),
];
