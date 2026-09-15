import { describe, expect, it } from 'vitest';
import { interpretations, ungroundedNumbers } from './grounding.js';

/** The figures a paragraph about one listing would have been given. */
const FIGURES = [
  1, // rank
  45_000_000, // price, AMD
  72, // area, m²
  3, // rooms
  20.4, // per cent under budget
  -12.3, // per cent below the estimate
];

describe('ungroundedNumbers', () => {
  it('accepts a paragraph that quotes only what it was given', () => {
    const text =
      'Ranked 1: at 45,000,000 ֏ it is 20.4% under your budget, and its 72 m² across 3 rooms.';

    expect(ungroundedNumbers(text, FIGURES)).toEqual([]);
  });

  it('accepts prose with no numbers at all', () => {
    expect(
      ungroundedNumbers('A good compromise, if you can live with the building.', FIGURES),
    ).toEqual([]);
  });

  it('catches a price that was never given', () => {
    const text = 'At 38,500,000 ֏ this is the cheapest on the page.';

    expect(ungroundedNumbers(text, FIGURES)).toEqual(['38,500,000']);
  });

  it('catches arithmetic the model did for itself', () => {
    // 45,000,000 / 72 is a real number about a real listing, and it is still a
    // figure nobody checked, which is exactly what this rule is for.
    expect(ungroundedNumbers('That is 625000 ֏ per square metre.', FIGURES)).toEqual(['625000']);
  });

  it('catches an invented count', () => {
    expect(ungroundedNumbers('Two balconies and 4 bathrooms.', FIGURES)).toEqual(['4']);
  });

  it('reads a number written at the million scale as the amount it means', () => {
    expect(ungroundedNumbers('About 45 million dram.', FIGURES)).toEqual([]);
  });

  it('does not let the million scale wave through a different amount', () => {
    expect(ungroundedNumbers('About 52 million dram.', FIGURES)).toEqual(['52']);
  });

  it('allows a figure to be rounded, within the precision it was written to', () => {
    expect(ungroundedNumbers('Roughly 20% under budget.', FIGURES)).toEqual([]);
    expect(ungroundedNumbers('Some 12% below the estimate.', FIGURES)).toEqual([]);
  });

  it('rejects a figure that drifted further than rounding explains', () => {
    expect(ungroundedNumbers('A full 25% under budget.', FIGURES)).toEqual(['25']);
  });

  it('ignores the sign, which the wording carries', () => {
    // The figure is -12.3; the sentence says "below", so the digits are positive.
    expect(ungroundedNumbers('Priced 12.3% below the estimate.', FIGURES)).toEqual([]);
  });

  it('reads the separators of all three locales', () => {
    for (const written of ['45,000,000', '45 000 000', '45.000.000', '45000000']) {
      expect(ungroundedNumbers(`Цена ${written} драм.`, FIGURES)).toEqual([]);
    }
  });

  it('reads a decimal comma as a decimal point', () => {
    expect(ungroundedNumbers('Площадь 72,0 м².', FIGURES)).toEqual([]);
  });

  it('reports every unaccounted number, not just the first', () => {
    expect(ungroundedNumbers('Built in 1975, 8 floors, 2 lifts.', FIGURES)).toEqual([
      '1975',
      '8',
      '2',
    ]);
  });

  it('works on Armenian text', () => {
    expect(ungroundedNumbers('72 մ² մակերեսով 3 սենյականոց բնակարան։', FIGURES)).toEqual([]);
  });
});

describe('interpretations', () => {
  it('reads an ambiguous separator both ways', () => {
    expect(interpretations('1.500').map((reading) => reading.value)).toEqual([1500, 1.5]);
  });

  it('treats a trailing separator as grouping only', () => {
    expect(interpretations('45,').map((reading) => reading.value)).toEqual([45]);
  });

  it('records how precisely a number was written', () => {
    expect(interpretations('20.45')).toContainEqual({ value: 20.45, decimals: 2 });
  });
});
