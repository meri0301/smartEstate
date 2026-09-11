import { describe, expect, it } from 'vitest';
import { buildListingTexts, type ListingTextInput } from './text.js';

const base: ListingTextInput = {
  rooms: 3,
  totalArea: 84.5,
  floor: 4,
  totalFloors: 9,
  buildingType: 'STONE',
  constructionYear: 1978,
  condition: 'EURO_RENOVATION',
  heating: 'INDIVIDUAL_GAS_BOILER',
  ceilingHeight: 2.9,
  hasElevator: true,
  balconyCount: 2,
  hasParking: false,
  hasStorage: true,
  priceNegotiable: true,
  docsVerified: true,
  district: { nameHy: 'Արաբկիր', nameRu: 'Арабкир', nameEn: 'Arabkir' },
  street: { en: 'Komitas', hy: 'Կոմիտաս', ru: 'Комитаса' },
  houseNumber: '12',
};

describe('buildListingTexts', () => {
  it('produces all three locales with every attribute reflected', () => {
    const texts = buildListingTexts(base);

    expect(texts.hy.title).toBe('3 սենյականոց բնակարան, Արաբկիր, 84.5 քմ');
    expect(texts.ru.title).toBe('3-комнатная квартира, Арабкир, 84.5 м²');
    expect(texts.en.title).toBe('3-room apartment in Arabkir, 84.5 m²');

    expect(texts.en.description).toContain('Komitas Street 12');
    expect(texts.en.description).toContain('floor 4 of 9');
    expect(texts.en.description).toContain('built in 1978');
    expect(texts.en.description).toContain('2 balconies');
    expect(texts.en.description).toContain('Price negotiable');
    expect(texts.en.description).not.toContain('Parking');

    expect(texts.ru.description).toContain('улица Комитаса, дом 12');
    expect(texts.ru.description).toContain('2 балкона');
    expect(texts.hy.description).toContain('Կոմիտաս փողոց 12');
    expect(texts.hy.description).toContain('4-րդ հարկ');
  });

  it('applies Russian plural rules for balconies', () => {
    expect(buildListingTexts({ ...base, balconyCount: 1 }).ru.description).toContain('1 балкон.');
    expect(buildListingTexts({ ...base, balconyCount: 3 }).ru.description).toContain('3 балкона.');
    expect(buildListingTexts({ ...base, balconyCount: 5 }).ru.description).toContain('5 балконов.');
  });

  it('uses the Armenian ordinal for the first floor', () => {
    expect(buildListingTexts({ ...base, floor: 1 }).hy.description).toContain('1-ին հարկ');
  });

  it('formats whole areas without decimals', () => {
    expect(buildListingTexts({ ...base, totalArea: 90 }).en.title).toContain('90 m²');
  });
});
