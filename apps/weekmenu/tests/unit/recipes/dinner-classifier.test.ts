import { describe, expect, it } from 'vitest';
import { classifyDinner } from '@/services/recipes/dinner-classifier';
import { candidate } from '../../support/recipe-candidate';

/**
 * The bar is high on purpose.
 *
 * A planner that proposes lemon curd for Tuesday is worse than one with a
 * smaller library, because the user stops trusting the whole thing after the
 * first absurd suggestion. So the tests below are weighted towards the things
 * that must never be called dinner.
 */
describe('classifyDinner', () => {
  it('never calls a dessert, a drink or a condiment dinner', () => {
    const cases = [
      candidate('Chocolate Cake', ['200 g flour', '3 eggs', '150 g sugar', '100 g butter']),
      candidate('Strawberry Jam', ['1 kg strawberries', '800 g sugar', '1 lemon', '5 g pectin']),
      candidate('Classic Margarita', ['50 ml tequila', '25 ml lime juice', '20 ml syrup']),
      candidate('Chicken Stock', ['1 chicken carcass', '2 onions', '3 carrots', '1 leek']),
      candidate('Curry Powder', ['20 g cumin', '20 g turmeric', '10 g coriander', '5 g pepper']),
    ];
    for (const item of cases) {
      expect(classifyDinner(item).verdict, item.title).toBe('NOT_DINNER');
    }
  });

  it('accepts a dish whose title and contents agree', () => {
    const curry = candidate('Chicken Curry', [
      '500 g chicken thighs',
      '400 ml coconut milk',
      '2 onions',
      '300 g basmati rice',
      '2 tbsp red curry paste',
    ]);
    expect(classifyDinner(curry)).toMatchObject({
      verdict: 'DINNER',
      reason: 'TITLE_AND_COMPOSITION',
    });
  });

  it('trusts composition when the title says nothing', () => {
    const plate = candidate('Tuesday Tray', [
      '400 g pork loin',
      '600 g potatoes',
      '300 g green beans',
      '1 onion',
    ]);
    expect(classifyDinner(plate)).toMatchObject({ verdict: 'DINNER', reason: 'COMPOSITION' });
  });

  it('says maybe, not yes, when only two anchors are present', () => {
    // Protein and carbohydrate but nothing green, and a title that gives away
    // nothing: a plausible dinner, not a certain one.
    const half = candidate('Thursday Bake', [
      '300 g pasta',
      '2 tins tuna',
      '200 ml cream',
      '100 g grated cheese',
    ]);
    expect(classifyDinner(half).verdict).toBe('POSSIBLE_DINNER');
  });

  it('refuses a promising title with no food behind it', () => {
    const empty = candidate('Curry Rub', ['10 g cumin', '10 g paprika powder', '5 g cinnamon']);
    expect(classifyDinner(empty).verdict).not.toBe('DINNER');
  });

  it('lets the corpus category decide when it is explicit', () => {
    const dessert = candidate('Something Sweet', ['200 g flour', '2 eggs', '100 g sugar'], {
      mealType: 'dessert',
    });
    expect(classifyDinner(dessert)).toMatchObject({ verdict: 'NOT_DINNER', reason: 'CATEGORY' });

    const main = candidate('Something Savoury', ['400 g beef', '300 g rice', '2 carrots'], {
      mealType: 'main',
    });
    expect(classifyDinner(main)).toMatchObject({
      verdict: 'DINNER',
      reason: 'CATEGORY_AND_COMPOSITION',
    });
  });

  it('does not call a three-line list a meal', () => {
    const thin = candidate('Buttered Rice', ['200 g rice', '20 g butter', '2 g salt']);
    expect(classifyDinner(thin).verdict).toBe('NOT_DINNER');
  });

  /**
   * The case the brief names: two dishes that share a word and nothing else.
   */
  it('separates chicken pot pie from chicken liver pâté', () => {
    const pie = candidate('Chicken Pot Pie', [
      '500 g chicken breast',
      '300 g potatoes',
      '200 g peas',
      '2 carrots',
      '1 onion',
    ]);
    const pate = candidate('Chicken Liver Pâté', [
      '400 g chicken livers',
      '100 g butter',
      '50 ml cream',
      '1 shallot',
    ]);
    expect(classifyDinner(pie).verdict).toBe('DINNER');
    expect(classifyDinner(pate).verdict).not.toBe('DINNER');
  });
});
