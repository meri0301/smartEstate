/**
 * The parser that ships by default, tested in all three languages.
 *
 * The brief's own example sentence appears here verbatim, because it is the one
 * the thesis will quote: "quiet 2-room near a school in Arabkir, under 60
 * million, not ground floor". Two of its clauses cannot be acted on, and the
 * test asserts that they are reported rather than ignored.
 */
import { describe, expect, it } from 'vitest';
import { parseWithRules, type DistrictVocabulary } from './rule-based-parser.js';

const DISTRICTS: DistrictVocabulary[] = [
  { slug: 'arabkir', names: ['Arabkir', 'Արաբկիր', 'Арабкир'] },
  { slug: 'kentron', names: ['Kentron', 'Կենտրոն', 'Кентрон'] },
  { slug: 'nor-nork', names: ['Nor Nork', 'Նոր Նորք', 'Нор Норк'] },
  { slug: 'avan', names: ['Avan', 'Ավան', 'Аван'] },
];

const parse = (query: string) => parseWithRules(query, DISTRICTS);

describe('the example from the brief', () => {
  const result = parse('quiet 2-room near a school in Arabkir, under 60 million, not ground floor');

  it('understands everything it has a filter for', () => {
    expect(result.filters).toMatchObject({
      roomsMin: 2,
      roomsMax: 2,
      districts: ['arabkir'],
      priceMax: 60_000_000,
      excludeGroundFloor: true,
    });
  });

  it('admits to the parts it cannot act on', () => {
    expect(result.unmapped).toContain('quiet');
    expect(result.unmapped).toContain('school');
  });
});

describe('prices', () => {
  it.each([
    ['under 60 million', 60_000_000],
    ['up to 60m', 60_000_000],
    ['max 60 mln', 60_000_000],
    ['60000000', 60_000_000],
    ['60,000,000 dram', 60_000_000],
    ['до 60 млн', 60_000_000],
    ['бюджет 45 миллионов', 45_000_000],
    ['մինչև 60 մլն', 60_000_000],
    ['60 միլիոն դրամ', 60_000_000],
  ])('reads %s as a ceiling', (query, expected) => {
    expect(parse(query).filters.priceMax).toBe(expected);
  });

  it('reads a lower bound when one is signalled', () => {
    expect(parse('from 30 million').filters).toMatchObject({ priceMin: 30_000_000 });
    expect(parse('от 30 млн').filters).toMatchObject({ priceMin: 30_000_000 });
  });

  it('reads thousands as thousands', () => {
    expect(parse('under 900 thousand per month').filters.priceMax).toBe(900_000);
  });

  it('does not mistake a small bare number for a price', () => {
    expect(parse('balcony 2').filters.priceMax).toBeUndefined();
  });
});

describe('rooms', () => {
  it.each([
    ['2-room apartment', 2],
    ['3 rooms', 3],
    ['двухкомнатная квартира', 2],
    ['3 комнаты', 3],
    ['трёхкомнатная', 3],
    ['2 սենյականոց բնակարան', 2],
    ['երկսենյականոց', 2],
  ])('reads %s as exactly %d rooms', (query, rooms) => {
    expect(parse(query).filters).toMatchObject({ roomsMin: rooms, roomsMax: rooms });
  });

  it('reads a bound when one is given', () => {
    expect(parse('at least 3 rooms').filters).toMatchObject({ roomsMin: 3 });
    expect(parse('at least 3 rooms').filters.roomsMax).toBeUndefined();
    expect(parse('max 2 rooms').filters).toMatchObject({ roomsMax: 2 });
  });
});

describe('area', () => {
  it('reads a floor area as a minimum by default', () => {
    expect(parse('70 m2').filters).toMatchObject({ areaMin: 70 });
    expect(parse('от 70 кв').filters).toMatchObject({ areaMin: 70 });
    expect(parse('70 քմ-ից').filters).toMatchObject({ areaMin: 70 });
  });

  it('reads an explicit ceiling', () => {
    expect(parse('up to 90 m2').filters).toMatchObject({ areaMax: 90 });
  });

  it('ignores an area nobody would ask for', () => {
    expect(parse('5000 m2').filters.areaMin).toBeUndefined();
  });
});

describe('districts', () => {
  it('matches a name in any of the three languages', () => {
    expect(parse('in Arabkir').filters.districts).toEqual(['arabkir']);
    expect(parse('в Кентрон').filters.districts).toEqual(['kentron']);
    expect(parse('Կենտրոն').filters.districts).toEqual(['kentron']);
  });

  it('matches an inflected name, which is how the name is actually written', () => {
    // Armenian puts the case on the noun: "in Arabkir" is one word.
    expect(parse('բնակարան Արաբկիրում').filters.districts).toEqual(['arabkir']);
    expect(parse('Կենտրոնում').filters.districts).toEqual(['kentron']);
    expect(parse('квартира в Кентроне').filters.districts).toEqual(['kentron']);
  });

  it('does not let a short Latin name swallow an unrelated word', () => {
    // "Avan" is four letters of Latin script, so it is matched exactly only.
    expect(parse('in Avanti').filters.districts).toBeUndefined();
  });

  it('matches a name of more than one word', () => {
    expect(parse('flat in Nor Nork').filters.districts).toEqual(['nor-nork']);
  });

  it('matches several', () => {
    expect(parse('Arabkir or Kentron').filters.districts?.sort()).toEqual(['arabkir', 'kentron']);
  });

  it('does not find a district inside another word', () => {
    // "Avan" sits inside "avenue"; matching it would send the reader to the
    // wrong side of the city.
    expect(parse('flat on the avenue').filters.districts).toBeUndefined();
  });
});

describe('floors', () => {
  it.each(['not ground floor', 'no first floor', 'не первый этаж', 'ոչ առաջին հարկ'])(
    'excludes the ground floor for %s',
    (query) => {
      expect(parse(query).filters).toMatchObject({ excludeGroundFloor: true });
    },
  );

  it('excludes the top floor when asked', () => {
    expect(parse('not the top floor').filters).toMatchObject({ excludeTopFloor: true });
    expect(parse('не последний этаж').filters).toMatchObject({ excludeTopFloor: true });
  });

  it('does not turn a preference into an exclusion', () => {
    // "first floor" with no negation asks for something the filters cannot
    // express; inventing the opposite would be worse than doing nothing.
    const result = parse('first floor please');
    expect(result.filters.excludeGroundFloor).toBeUndefined();
    expect(result.filters.excludeTopFloor).toBeUndefined();
  });
});

describe('features', () => {
  it('reads a lift and a parking space', () => {
    expect(parse('with a lift and parking').filters).toMatchObject({
      hasElevator: true,
      hasParking: true,
    });
    expect(parse('с лифтом и парковкой').filters).toMatchObject({
      hasElevator: true,
      hasParking: true,
    });
    expect(parse('վերելակով և ավտոկայանատեղիով').filters).toMatchObject({
      hasElevator: true,
    });
  });

  it('respects a negation', () => {
    expect(parse('without parking').filters).toMatchObject({ hasParking: false });
    expect(parse('без лифта').filters).toMatchObject({ hasElevator: false });
  });
});

describe('condition and building', () => {
  it('reads a state of repair', () => {
    expect(parse('renovated flat').filters.conditions).toEqual(['EURO_RENOVATION']);
    expect(parse('с евроремонтом').filters.conditions).toEqual(['EURO_RENOVATION']);
    expect(parse('դիզայներական').filters.conditions).toEqual(['DESIGNER']);
  });

  it('reads the building stock', () => {
    expect(parse('in a new build').filters.buildingTypes).toEqual(['NEW_BUILD']);
    expect(parse('панельный дом').filters.buildingTypes).toEqual(['PANEL']);
    expect(parse('քարե շենք').filters.buildingTypes).toEqual(['STONE']);
  });
});

describe('what it refuses to do', () => {
  it('produces nothing from a sentence it does not understand', () => {
    const result = parse('somewhere nice and sunny');

    expect(result.filters).toEqual({});
    expect(result.unmapped.length).toBeGreaterThan(0);
  });

  it('produces nothing from an empty query', () => {
    expect(parse('   ')).toEqual({ filters: {}, unmapped: [] });
  });

  it('does not report filler as misunderstood', () => {
    expect(parse('I want an apartment in Arabkir').unmapped).toEqual([]);
  });

  it('caps how much it admits to, because a wall of words is not feedback', () => {
    const result = parse(
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike',
    );

    expect(result.unmapped).toHaveLength(10);
  });
});

describe('a whole sentence in each language', () => {
  it('Armenian', () => {
    const result = parse('2 սենյականոց բնակարան Արաբկիրում մինչև 50 մլն, ոչ առաջին հարկ');

    expect(result.filters).toMatchObject({
      roomsMin: 2,
      roomsMax: 2,
      priceMax: 50_000_000,
      excludeGroundFloor: true,
    });
  });

  it('Russian', () => {
    const result = parse('двухкомнатная квартира в Кентрон до 80 млн с лифтом');

    expect(result.filters).toMatchObject({
      roomsMin: 2,
      roomsMax: 2,
      districts: ['kentron'],
      priceMax: 80_000_000,
      hasElevator: true,
    });
  });

  it('English', () => {
    const result = parse('3 rooms in Nor Nork under 45 million with parking, renovated');

    expect(result.filters).toMatchObject({
      roomsMin: 3,
      roomsMax: 3,
      districts: ['nor-nork'],
      priceMax: 45_000_000,
      hasParking: true,
      conditions: ['EURO_RENOVATION'],
    });
  });
});

describe('a bound word belongs to one quantity', () => {
  it('gives "до" to the price, not to the room count three words earlier', () => {
    const result = parse('двухкомнатная в Кентроне до 50 млн с лифтом');

    expect(result.filters).toMatchObject({
      roomsMin: 2,
      roomsMax: 2,
      districts: ['kentron'],
      priceMax: 50_000_000,
      hasElevator: true,
    });
  });

  it('gives "մինչև" to the price in a full Armenian sentence', () => {
    const result = parse('3 սենյականոց Արաբկիրում մինչև 80 մլն');

    expect(result.filters).toMatchObject({
      roomsMin: 3,
      roomsMax: 3,
      districts: ['arabkir'],
      priceMax: 80_000_000,
    });
  });

  it('still binds a bound word to the room count when it is the only quantity', () => {
    expect(parse('up to 3 rooms in Kentron').filters).toMatchObject({ roomsMax: 3 });
  });

  it('binds each bound word to its own number', () => {
    const result = parse('at least 3 rooms from 70 m2 under 90 million');

    expect(result.filters).toMatchObject({
      roomsMin: 3,
      areaMin: 70,
      priceMax: 90_000_000,
    });
    expect(result.filters.roomsMax).toBeUndefined();
  });
});
