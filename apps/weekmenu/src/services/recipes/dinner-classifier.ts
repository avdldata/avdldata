import type { ExternalRecipeCandidate } from './candidate-types';
import { cleanName } from './ingredient-line';

/**
 * Is this a normal evening meal?
 *
 * The brief is explicit that a title is not enough, and the corpora prove it:
 * "Chicken Liver Pâté" and "Chicken Pot Pie" share a word and nothing else.
 * So three signals are combined — what the corpus calls it, what the title
 * says, and what it is made of — and composition is the one that decides in the
 * hard cases.
 *
 * The bar is deliberately high. A dinner planner that occasionally proposes
 * lemon curd for Tuesday is worse than one with a smaller library, because the
 * user stops trusting the whole thing after the first absurd suggestion.
 */

export type DinnerVerdict = 'DINNER' | 'POSSIBLE_DINNER' | 'NOT_DINNER' | 'AMBIGUOUS';

export interface DinnerClassification {
  readonly verdict: DinnerVerdict;
  /** Why, in one token, so the census can count reasons. */
  readonly reason: string;
}

/** Things that are never a main course, whatever else is true. */
const NEVER_DINNER =
  /\b(cake|cookie|biscuit|brownie|blondie|pie crust|frosting|icing|custard|pudding|mousse|sorbet|gelato|ice cream|ijs|parfait|trifle|tart|tarte|torte|cheesecake|doughnut|donut|muffin|scone|pancake|pannenkoek|waffle|wafel|crepe|jam|jelly|marmalade|preserve|compote|syrup|siroop|candy|fudge|truffle|praline|toffee|caramel sauce|cocktail|martini|margarita|mojito|punch|liqueur|smoothie|milkshake|lemonade|limonade|iced tea|coffee|koffie|thee\b|infusion|tonic|bitters|granola|muesli|porridge|oatmeal|cereal|marinade|brine|rub\b|spice mix|kruidenmix|dressing|vinaigrette|mayonnaise|mayonaise|ketchup|mustard\b|relish|chutney|pickle|piccalilli|dip\b|hummus|salsa|guacamole|pesto|stock|bouillon|broth\b|fond\b|roux|beurre|butter\b|bread\b|brood\b|loaf|bun\b|roll\b|bagel|cracker|biscotti|shortbread|meringue|macaron|pastry|croissant|strudel|fritter|beignet|churro)\b/i;

/**
 * A title that ends in a component word.
 *
 * "Curry Powder", "Red Curry Paste", "Cajun Seasoning", "Vanilla Extract" are
 * things you keep in a cupboard to make dinner with, not dinner. Anchored to
 * the end of the title so "Chicken Tikka Masala" and "Beef in Red Curry Paste"
 * are untouched.
 */
const COMPONENT_TITLE = /\b(powder|mix|seasoning|paste|essence|extract|concentrate)$/i;

/** Things that are almost always a main course. */
const CLEARLY_DINNER =
  /\b(curry|stew|stoof|hutspot|stamppot|casserole|ovenschotel|traybake|roast|braise|risotto|paella|lasagne|lasagna|pasta|spaghetti|noodle|noedel|ramen|pho|stir[- ]?fry|roerbak|wok|tagine|goulash|chili con carne|burrito|enchilada|fajita|taco|shakshuka|moussaka|biryani|pilaf|jambalaya|gumbo|schnitzel|meatball|gehaktbal|meatloaf|burger|shepherd'?s pie|pot pie|pot roast|hachee|nasi|bami|rendang|katsu|bibimbap|bulgogi|adobo|cacciatore|bourguignon|stroganoff|kebab|shoarma|gyros|souvlaki|frikandel|hotpot|chowder|bouillabaisse|soup|soep|salad bowl|buddha bowl|poke bowl)\b/i;

/** Corpus categories that answer the question on their own. */
const CATEGORY_NOT_DINNER =
  /^(dessert|desserts|baking|bakery|drink|drinks|beverage|beverages|cocktail|cocktails|breakfast|snack|snacks|condiment|condiments|sauce|sauces|preserve|preserves|confection|candy|pastry|bread|breads)$/i;
const CATEGORY_DINNER = /^(main|mains|main course|dinner|entree|entrée|proteins|supper)$/i;

/**
 * Ingredients that anchor a meal.
 *
 * A dish with a protein and a carbohydrate is a dinner far more reliably than
 * one whose title happens to contain a promising word.
 *
 * Two things these patterns learned the hard way, both found by a test rather
 * than by reading:
 *
 *   plurals   Corpora write "potatoes", "tomatoes", "carrots". `\bpotato\b`
 *             does not match "potatoes", so `PLURAL` is appended to every
 *             anchor and the count stops silently running low.
 *
 *   pepper    Black pepper is in nearly every recipe on earth. Counting the
 *             word `pepper` as a vegetable handed a free anchor to spice mixes
 *             and marinades — "Curry Powder" classified as dinner on the
 *             strength of its ground pepper. Only the vegetable spellings
 *             count now.
 */
/** Optional plural, so an anchor matches the way a corpus actually writes it. */
const PLURAL = '(?:e?s)?';
const PROTEIN = new RegExp(
  `\\b(chicken|kip|beef|rund|pork|varken|lamb|lam|turkey|kalkoen|duck|eend|veal|kalf|bacon|spek|sausage|worst|ham|mince|gehakt|fish|vis|salmon|zalm|cod|kabeljauw|tuna|tonijn|haddock|shrimp|prawn|garna|mussel|mossel|squid|inkt|tofu|tempeh|seitan|lentil|linze|chickpea|kikkererwt|bean|boon|bonen|egg|eieren|paneer|halloumi|quorn)${PLURAL}\\b`,
  'i',
);
const CARB = new RegExp(
  `\\b(rice|rijst|pasta|spaghetti|penne|macaroni|noodle|noedel|mie|potato|aardappel|couscous|bulgur|quinoa|polenta|tortilla|wrap|naan|pita|bread|brood|barley|gerst|orzo|gnocchi)${PLURAL}\\b`,
  'i',
);
const VEGETABLE = new RegExp(
  `\\b(onion|ui|garlic|knoflook|tomato|tomaat|carrot|wortel|bell pepper|red pepper|green pepper|paprika|broccoli|cauliflower|bloemkool|spinach|spinazie|courgette|zucchini|aubergine|eggplant|mushroom|champignon|leek|prei|cabbage|kool|bean|boon|pea|erwt|celery|selderij|pumpkin|pompoen|squash|kale|boerenkool|lettuce|sla)${PLURAL}\\b`,
  'i',
);

export function classifyDinner(candidate: ExternalRecipeCandidate): DinnerClassification {
  const title = candidate.title;
  const category = candidate.mealType ?? '';
  const tagText = candidate.tags.join(' ');

  if (CATEGORY_NOT_DINNER.test(category)) return { verdict: 'NOT_DINNER', reason: 'CATEGORY' };
  if (NEVER_DINNER.test(title)) return { verdict: 'NOT_DINNER', reason: 'TITLE' };
  if (COMPONENT_TITLE.test(title.trim())) return { verdict: 'NOT_DINNER', reason: 'COMPONENT' };

  const names = candidate.ingredients.map((i) => cleanName(i.rawName ?? i.rawText)).join(' ');
  const hasProtein = PROTEIN.test(names);
  const hasCarb = CARB.test(names);
  const hasVegetable = VEGETABLE.test(names);

  if (CLEARLY_DINNER.test(title) || CLEARLY_DINNER.test(tagText)) {
    // Even a promising title needs something to eat in it. "Tomato soup" with
    // three ingredients and no protein is still dinner; "Curry powder" is not.
    return hasProtein || hasCarb || hasVegetable
      ? { verdict: 'DINNER', reason: 'TITLE_AND_COMPOSITION' }
      : { verdict: 'AMBIGUOUS', reason: 'TITLE_WITHOUT_FOOD' };
  }
  if (CATEGORY_DINNER.test(category) && (hasProtein || hasCarb)) {
    return { verdict: 'DINNER', reason: 'CATEGORY_AND_COMPOSITION' };
  }

  // Composition alone. A protein plus a carbohydrate plus a vegetable is a
  // plate; two of the three is a maybe; fewer is not a meal.
  const anchors = [hasProtein, hasCarb, hasVegetable].filter(Boolean).length;
  if (anchors === 3) return { verdict: 'DINNER', reason: 'COMPOSITION' };
  if (anchors === 2) return { verdict: 'POSSIBLE_DINNER', reason: 'COMPOSITION' };
  if (candidate.ingredients.length < 4) return { verdict: 'NOT_DINNER', reason: 'TOO_FEW' };
  return { verdict: 'AMBIGUOUS', reason: 'NO_SIGNAL' };
}
