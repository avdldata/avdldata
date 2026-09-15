import { describe, expect, it } from 'vitest';
import { clusterDuplicates, overlap, signatureOf } from '@/services/recipes/dedupe';
import { candidate } from '../../support/recipe-candidate';

/**
 * A library full of the same dinner wearing a different adjective looks large
 * and behaves small: the optimizer sees seven options and can only ever cook
 * one dish. Titles are marketing; the ingredients are the dish.
 */
describe('signatureOf', () => {
  it('reads protein, carbohydrate and method from the dish, not the adjectives', () => {
    const signature = signatureOf(
      candidate('Easy Creamy Chicken Pasta', [
        '400 g chicken breast',
        '350 g pasta',
        '200 ml cream',
        '2 garlic cloves',
      ]),
    );
    expect(signature).toMatchObject({ protein: 'chicken', carb: 'pasta' });
  });

  it('matches a plural the way a corpus writes it', () => {
    const signature = signatureOf(
      candidate('Sunday Roast', ['800 g potatoes', '1 kg beef', '3 carrots']),
    );
    expect(signature.carb).toBe('potato');
    expect(signature.protein).toBe('beef');
  });

  it('says none rather than guessing when a component is absent', () => {
    const signature = signatureOf(
      candidate('Green Salad', ['1 lettuce', '1 cucumber', '2 tomatoes']),
    );
    expect(signature.protein).toBe('none');
    expect(signature.carb).toBe('none');
  });
});

describe('overlap', () => {
  it('is measured against the smaller set, so a long list cannot hide a duplicate', () => {
    expect(overlap(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe(1);
    expect(overlap(['a', 'b', 'c', 'd'], ['a', 'x'])).toBe(0.5);
    expect(overlap([], ['a'])).toBe(0);
  });
});

describe('clusterDuplicates', () => {
  const lines = ['400 g chicken breast', '350 g pasta', '200 ml cream', '2 garlic cloves'];

  it('merges the same dish under three titles and keeps the best-ranked one', () => {
    const items = [
      { name: 'Chicken Pasta', score: 0.4, candidate: candidate('Chicken Pasta', lines) },
      {
        name: 'Creamy Chicken Pasta',
        score: 0.9,
        candidate: candidate('Creamy Chicken Pasta', lines),
      },
      {
        name: 'Easy Creamy Chicken Pasta',
        score: 0.6,
        candidate: candidate('Easy Creamy Chicken Pasta', lines),
      },
    ];
    const clusters = clusterDuplicates(
      items,
      (i) => signatureOf(i.candidate),
      (i) => i.score,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.best.name).toBe('Creamy Chicken Pasta');
    expect(clusters[0]!.duplicates).toHaveLength(2);
  });

  it('keeps two dishes apart when the ingredients disagree, whatever the signature says', () => {
    const soup = candidate('Chicken Soup', [
      '400 g chicken breast',
      '350 g pasta',
      '2 leeks',
      '3 carrots',
      '1 celery',
    ]);
    const bake = candidate('Chicken Pasta Bake', [
      '400 g chicken breast',
      '350 g pasta',
      '200 g grated cheese',
      '400 g canned tomatoes',
      '1 onion',
    ]);
    const clusters = clusterDuplicates(
      [{ c: soup }, { c: bake }],
      (i) => signatureOf(i.c),
      () => 1,
    );
    expect(clusters).toHaveLength(2);
  });

  it('loses nothing: every input ends up as a representative or a duplicate', () => {
    const items = [
      candidate('A', lines),
      candidate('B', lines),
      candidate('C', ['500 g cod', '400 g potatoes', '200 g spinach', '1 lemon']),
      candidate('D', ['300 g lentils', '2 onions', '3 carrots', '400 ml coconut milk']),
    ];
    const clusters = clusterDuplicates(items, signatureOf, () => 1);
    const total = clusters.reduce((n, c) => n + 1 + c.duplicates.length, 0);
    expect(total).toBe(items.length);
  });
});

/**
 * Regression, found by auditing the selection rather than by reading the code.
 *
 * Two copies of the same Swedish veal timbale both reached the top 50: one
 * listed a garnish of green beans and the other did not, so the first was keyed
 * `legume|pasta` and the second `egg|pasta`. Different partitions are never
 * compared, so the overlap test — which would have merged them instantly —
 * never ran.
 */
describe('signature partitioning', () => {
  it('keys a veal dish on its veal, not on an incidental garnish', () => {
    const withGarnish = candidate('Timbal på Kalv (Veal Timbal)', [
      '500 g boneless veal',
      '100 g macaroni',
      '400 ml cream',
      '2 eggs',
      '2 carrots',
      '150 g green beans',
    ]);
    const without = candidate('Timbal på kalv (Calf Timbal)', [
      '500 g boneless veal',
      '100 g macaroni',
      '400 ml cream',
      '2 eggs',
      '2 carrots',
    ]);
    expect(signatureOf(withGarnish).protein).toBe('veal');
    expect(signatureOf(without).protein).toBe('veal');
    expect(signatureOf(withGarnish).key).toBe(signatureOf(without).key);

    const clusters = clusterDuplicates([withGarnish, without], signatureOf, () => 1);
    expect(clusters).toHaveLength(1);
  });
});
