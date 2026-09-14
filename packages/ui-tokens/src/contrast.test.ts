import { describe, expect, it } from 'vitest';
import { contrast, contrastRatio, relativeLuminance } from './contrast.js';

describe('relativeLuminance', () => {
  it('anchors at the ends of the sRGB range', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
  });

  it('accepts shorthand hex and is case-insensitive', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#FFFFFF'), 10);
  });

  it('weights green most heavily', () => {
    expect(relativeLuminance('#00FF00')).toBeGreaterThan(relativeLuminance('#FF0000'));
    expect(relativeLuminance('#FF0000')).toBeGreaterThan(relativeLuminance('#0000FF'));
  });

  it('rejects values that are not hex colours', () => {
    expect(() => relativeLuminance('rebeccapurple')).toThrow(TypeError);
    expect(() => relativeLuminance('#12345')).toThrow(TypeError);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 6);
    expect(contrastRatio('#CEF279', '#CEF279')).toBeCloseTo(1, 10);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#131313', '#FAFAFA')).toBeCloseTo(
      contrastRatio('#FAFAFA', '#131313'),
      10,
    );
  });

  it('matches a known published value', () => {
    // #767676 on white is the canonical "smallest grey that passes AA".
    expect(contrast('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#777777', '#FFFFFF')).toBeLessThan(4.6);
  });
});
