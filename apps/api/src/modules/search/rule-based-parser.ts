/**
 * Reading a search sentence without a language model.
 *
 * This is not a fallback in the apologetic sense. With the default provider it
 * is *the* parser, and the product has to be demonstrable on it, so it is
 * written to handle the things people actually type in the three languages the
 * product speaks: a price ceiling, a room count, a floor area, a district, a
 * floor preference, a lift, a parking space, a state of repair.
 *
 * Three principles keep it honest.
 *
 * It never guesses. A phrase that matches no rule goes into `unmapped` and is
 * shown to the reader, because a filter nobody asked for is worse than a filter
 * that is missing.
 *
 * It reads numbers the way they are written. "60 million", "60 млн", "60 մլն"
 * and "60000000" are the same ceiling, and a bare "60" next to a price word is
 * assumed to be millions because nobody is looking for a sixty-dram flat.
 *
 * It works on words, not on substrings. Matching "avan" inside "Nor Nork
 * avenue" would be worse than not matching it at all.
 */
import type { BuildingType, Condition, ParsedFilters } from '@smartestate/contracts';

export interface DistrictVocabulary {
  slug: string;
  /** Every spelling that should resolve to this district, lower-cased. */
  names: readonly string[];
}

export interface RuleParseResult {
  filters: ParsedFilters;
  unmapped: string[];
}

/** Digits, letters of any script, and the separators that appear inside numbers. */
const TOKEN = /[\p{L}\p{N}]+(?:[.,]\p{N}+)*/gu;

const MILLION_WORDS = new Set([
  'm',
  'mln',
  'million',
  'millions',
  'млн',
  'миллион',
  'миллиона',
  'миллионов',
  'мио',
  'մլն',
  'միլիոն',
  'միլիոնի',
]);

const THOUSAND_WORDS = new Set([
  'k',
  'thousand',
  'thousands',
  'тыс',
  'тысяч',
  'тысячи',
  'հազ',
  'հազար',
]);

/** Words that mean the number after them is an upper limit. */
const UPPER_BOUND_WORDS = new Set([
  'under',
  'below',
  'max',
  'maximum',
  // "up to" is two words. Matching on "up" alone is reliable enough, and "to"
  // on its own is not: "close to a school" is not a price ceiling.
  'up',
  'upto',
  'до',
  'максимум',
  'не',
  'дороже',
  'մինչև',
  'առավելագույնը',
  'ցածր',
]);

/** Words that mean the number after them is a lower limit. */
const LOWER_BOUND_WORDS = new Set([
  'from',
  'above',
  'over',
  'min',
  'minimum',
  'least',
  'от',
  'минимум',
  'больше',
  'սկսած',
  'նվազագույնը',
  'բարձր',
]);

const PRICE_WORDS = new Set([
  'price',
  'budget',
  'amd',
  'dram',
  'цена',
  'бюджет',
  'драм',
  'гнի',
  'գին',
  'գնով',
  'դրամ',
  'բյուջե',
]);

const ROOM_WORDS = new Set([
  'room',
  'rooms',
  'bedroom',
  'bedrooms',
  'комната',
  'комнаты',
  'комнат',
  'комн',
  'комнатная',
  'комнатной',
  'սենյակ',
  'սենյակի',
  'սենյականոց',
]);

const AREA_WORDS = new Set([
  'm2',
  'sqm',
  'm²',
  'area',
  'square',
  'м2',
  'м²',
  'кв',
  'площадь',
  'քմ',
  'մակերես',
]);

/** Number words that appear in front of a room word, per language. */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  одна: 1,
  одно: 1,
  однокомнатная: 1,
  двух: 2,
  двухкомнатная: 2,
  двушка: 2,
  трех: 3,
  трёх: 3,
  трехкомнатная: 3,
  трёхкомнатная: 3,
  трешка: 3,
  четырех: 4,
  четырёх: 4,
  четырехкомнатная: 4,
  մեկ: 1,
  միասենյականոց: 1,
  երկու: 2,
  երկսենյականոց: 2,
  երեք: 3,
  եռասենյականոց: 3,
  չորս: 4,
};

const GROUND_FLOOR_WORDS = new Set(['ground', 'first', 'первый', 'первом', 'առաջին']);
const TOP_FLOOR_WORDS = new Set(['top', 'last', 'последний', 'последнем', 'վերջին']);
const FLOOR_WORDS = new Set(['floor', 'этаж', 'этаже', 'հարկ', 'հարկում', 'հարկի']);
const NEGATION_WORDS = new Set([
  'not',
  'no',
  'without',
  'except',
  'avoid',
  'не',
  'без',
  'кроме',
  'ոչ',
  'առանց',
]);

// Russian and Armenian inflect, so the forms that actually get typed are listed
// rather than a stem: "без лифта" is genitive and "с лифтом" instrumental.
const ELEVATOR_WORDS = new Set([
  'lift',
  'elevator',
  'лифт',
  'лифта',
  'лифтом',
  'վերելակ',
  'վերելակի',
  'վերելակով',
]);
const PARKING_WORDS = new Set([
  'parking',
  'garage',
  'парковка',
  'парковки',
  'парковкой',
  'гараж',
  'гаража',
  'гаражом',
  'ավտոկայանատեղի',
  'կայանատեղի',
  'ավտոտնակ',
]);

const CONDITION_WORDS: Readonly<Record<string, Condition>> = {
  renovated: 'EURO_RENOVATION',
  renovation: 'EURO_RENOVATION',
  euro: 'EURO_RENOVATION',
  евроремонт: 'EURO_RENOVATION',
  евроремонтом: 'EURO_RENOVATION',
  ремонтом: 'EURO_RENOVATION',
  եվրովերանորոգում: 'EURO_RENOVATION',
  վերանորոգված: 'EURO_RENOVATION',
  designer: 'DESIGNER',
  дизайнерский: 'DESIGNER',
  դիզայներական: 'DESIGNER',
};

const BUILDING_TYPE_WORDS: Readonly<Record<string, BuildingType>> = {
  newbuild: 'NEW_BUILD',
  new: 'NEW_BUILD',
  newly: 'NEW_BUILD',
  новостройка: 'NEW_BUILD',
  новостройке: 'NEW_BUILD',
  նորակառույց: 'NEW_BUILD',
  monolith: 'MONOLITH',
  монолит: 'MONOLITH',
  монолитный: 'MONOLITH',
  մոնոլիտ: 'MONOLITH',
  stone: 'STONE',
  каменный: 'STONE',
  քարե: 'STONE',
  panel: 'PANEL',
  панельный: 'PANEL',
  панельном: 'PANEL',
  պանելային: 'PANEL',
  khrushchyovka: 'KHRUSHCHYOVKA',
  хрущевка: 'KHRUSHCHYOVKA',
  хрущёвка: 'KHRUSHCHYOVKA',
  խրուշչովկա: 'KHRUSHCHYOVKA',
  stalinka: 'STALINKA',
  сталинка: 'STALINKA',
  ստալինկա: 'STALINKA',
};

/** Words that carry no filter but are not worth reporting as misunderstood. */
const NOISE_WORDS = new Set([
  'a',
  'an',
  'the',
  'in',
  'at',
  'on',
  'with',
  'for',
  'and',
  'or',
  'of',
  'is',
  'me',
  'i',
  'want',
  'need',
  'looking',
  'flat',
  'apartment',
  'house',
  'в',
  'на',
  'с',
  'и',
  'или',
  'квартира',
  'квартиру',
  'ищу',
  'хочу',
  'нужна',
  'և',
  'կամ',
  'բնակարան',
  'բնակարաններ',
  'փնտրում',
  'եմ',
]);

interface Token {
  text: string;
  /** The numeric value when the token is a number, otherwise undefined. */
  value: number | undefined;
  used: boolean;
}

/**
 * Parses a sentence into filters.
 *
 * `districts` carries the names to match against; they come from the database
 * rather than a constant, so a new district is searchable the moment it is
 * seeded.
 */
export function parseWithRules(
  query: string,
  districts: readonly DistrictVocabulary[],
): RuleParseResult {
  const tokens = tokenise(query);
  const filters: ParsedFilters = {};

  // Order matters. A sentence like "двухкомнатная в Кентроне до 50 млн" has one
  // bound word, "до", and it belongs to the price rather than to the room count
  // three words earlier. Letting price and area claim their bound words first,
  // and skipping claimed ones afterwards, is what keeps "two-room" meaning
  // exactly two rather than at most two.
  matchDistricts(tokens, districts, filters);
  matchPrice(tokens, filters);
  matchArea(tokens, filters);
  matchRooms(tokens, filters);
  matchFloors(tokens, filters);
  matchFlags(tokens, filters);
  matchVocabulary(tokens, filters);

  return { filters, unmapped: leftovers(tokens) };
}

/** A number written against its unit, as in "60m", "70m2", "45млн". */
const NUMBER_WITH_UNIT = /^(\d+(?:[.,]\d+)?)(\p{L}+\d*)$/u;

function tokenise(query: string): Token[] {
  const matches = query.toLowerCase().match(TOKEN) ?? [];
  const tokens: Token[] = [];
  for (const text of matches) {
    // Letters and digits are one character class to the tokeniser, so "60m"
    // arrives as a single word and would never be read as a number. Splitting it
    // here is what makes "60m", "70m2" and "45млн" mean what they look like.
    const split = NUMBER_WITH_UNIT.exec(text);
    if (split?.[1] !== undefined && split[2] !== undefined) {
      tokens.push({ text: split[1], value: toNumber(split[1]), used: false });
      tokens.push({ text: split[2], value: undefined, used: false });
      continue;
    }
    tokens.push({ text, value: toNumber(text), used: false });
  }
  return tokens;
}

/** "60", "60.5", "1,200" — a comma between digits is a group separator, not a decimal. */
function toNumber(text: string): number | undefined {
  const normalised = text.replace(/,(?=\d{3}\b)/gu, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/u.test(normalised)) {
    return undefined;
  }
  const value = Number(normalised);
  return Number.isFinite(value) ? value : undefined;
}

/** Scale implied by the word after a number: millions, thousands, or nothing. */
function scaleAfter(tokens: Token[], index: number): { factor: number; consumed: number } {
  const next = tokens[index + 1];
  if (next === undefined) {
    return { factor: 1, consumed: 0 };
  }
  if (MILLION_WORDS.has(next.text)) {
    return { factor: 1_000_000, consumed: 1 };
  }
  if (THOUSAND_WORDS.has(next.text)) {
    return { factor: 1_000, consumed: 1 };
  }
  return { factor: 1, consumed: 0 };
}

/**
 * Whether an upper or lower bound was signalled near this number.
 *
 * Both directions, because the three languages disagree about where the word
 * goes: English and Russian put it before ("under 60", "до 60"), Armenian may
 * put it after ("60 միլիոնից ցածր").
 *
 * A word already claimed by another quantity is skipped, and a scan stops at
 * another number, because a bound word beyond one belongs to that one. Without
 * both rules a single "under" in a long sentence would bind to everything in it.
 */
function boundAround(tokens: Token[], index: number): 'upper' | 'lower' | undefined {
  for (const direction of [-1, 1]) {
    for (let offset = 1; offset <= 3; offset += 1) {
      const candidate = tokens[index + direction * offset];
      if (candidate === undefined || candidate.value !== undefined) {
        break;
      }
      if (candidate.used) {
        continue;
      }
      if (UPPER_BOUND_WORDS.has(candidate.text)) {
        candidate.used = true;
        return 'upper';
      }
      if (LOWER_BOUND_WORDS.has(candidate.text)) {
        candidate.used = true;
        return 'lower';
      }
    }
  }
  return undefined;
}

function nearby(
  tokens: Token[],
  index: number,
  words: ReadonlySet<string>,
  span = 2,
): Token | undefined {
  for (let offset = 1; offset <= span; offset += 1) {
    for (const candidate of [tokens[index - offset], tokens[index + offset]]) {
      if (candidate !== undefined && words.has(candidate.text)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * Districts first, because a district name may contain a word another rule
 * would otherwise claim, and multi-word names have to be matched before the
 * sentence is picked apart.
 */
function matchDistricts(
  tokens: Token[],
  districts: readonly DistrictVocabulary[],
  filters: ParsedFilters,
): void {
  const found = new Set<string>();
  // Longest names first, so "nor nork" wins over a district merely called "nor".
  const entries = districts
    .flatMap((district) => district.names.map((name) => ({ slug: district.slug, name })))
    .map((entry) => ({ ...entry, words: entry.name.toLowerCase().match(TOKEN) ?? [] }))
    .filter((entry) => entry.words.length > 0)
    .sort((a, b) => b.words.length - a.words.length);

  for (const entry of entries) {
    for (let index = 0; index + entry.words.length <= tokens.length; index += 1) {
      const window = tokens.slice(index, index + entry.words.length);
      if (window.some((token) => token.used)) {
        continue;
      }
      if (window.every((token, offset) => matchesName(token.text, entry.words, offset))) {
        for (const token of window) {
          token.used = true;
        }
        found.add(entry.slug);
      }
    }
  }
  if (found.size > 0) {
    filters.districts = [...found];
  }
}

/**
 * Longest a case ending may be. Armenian's locative is two characters
 * ("Արաբկիրում"), Russian's prepositional one ("в Кентроне"); four leaves room
 * without letting a name swallow an unrelated word.
 */
const MAX_CASE_ENDING = 4;

/** Shortest name that may be matched with an ending, so "нор" cannot match "норка". */
const MIN_INFLECTABLE_NAME = 5;

/**
 * Whether a token is this word of a district name, allowing for inflection.
 *
 * Armenian and Russian put the case on the noun: "Arabkir" becomes
 * "Արաբկիրում" for "in Arabkir", and "Кентрон" becomes "Кентроне". Requiring an
 * exact match would mean the parser only understood place names in the
 * nominative, which is not how anyone writes a search.
 *
 * Only the last word of a name may carry an ending, and only a name written in a
 * script that inflects. The Latin spellings in this dataset are transliterations
 * used as-is, and allowing them a loose match would let "Avan" claim "avenue".
 */
function matchesName(token: string, words: readonly string[], offset: number): boolean {
  const word = words[offset];
  if (word === undefined) {
    return false;
  }
  if (token === word) {
    return true;
  }
  const isLastWord = offset === words.length - 1;
  // Outside printable ASCII means Armenian or Russian here, and both inflect.
  const inflects = /[^\x20-\x7e]/u.test(word);
  if (!isLastWord || !inflects || word.length < MIN_INFLECTABLE_NAME) {
    return false;
  }
  return token.startsWith(word) && token.length - word.length <= MAX_CASE_ENDING;
}

function matchRooms(tokens: Token[], filters: ParsedFilters): void {
  tokens.forEach((token, index) => {
    if (token.used) {
      return;
    }
    // "2 rooms", "2-комнатная"
    if (token.value !== undefined && Number.isInteger(token.value)) {
      const word = nearby(tokens, index, ROOM_WORDS, 1);
      if (word !== undefined && token.value >= 1 && token.value <= 10) {
        token.used = true;
        word.used = true;
        applyRooms(tokens, index, filters, token.value);
        return;
      }
    }
    // "two-room", "двухкомнатная", "երկսենյականոց"
    const spelled = NUMBER_WORDS[token.text];
    if (spelled !== undefined) {
      const word = nearby(tokens, index, ROOM_WORDS, 1);
      const compound = ROOM_WORDS.has(token.text) || /комнатная|սենյականոց/u.test(token.text);
      if (word !== undefined || compound) {
        token.used = true;
        if (word !== undefined) {
          word.used = true;
        }
        applyRooms(tokens, index, filters, spelled);
      }
    }
  });
}

function applyRooms(tokens: Token[], index: number, filters: ParsedFilters, rooms: number): void {
  const bound = boundAround(tokens, index);
  if (bound === 'upper') {
    filters.roomsMax = rooms;
    return;
  }
  if (bound === 'lower') {
    filters.roomsMin = rooms;
    return;
  }
  // A plain "2-room" means exactly two, not two or more.
  filters.roomsMin = rooms;
  filters.roomsMax = rooms;
}

function matchArea(tokens: Token[], filters: ParsedFilters): void {
  tokens.forEach((token, index) => {
    if (token.used || token.value === undefined) {
      return;
    }
    const word = nearby(tokens, index, AREA_WORDS, 1);
    if (word === undefined || token.value < 10 || token.value > 500) {
      return;
    }
    token.used = true;
    word.used = true;
    const bound = boundAround(tokens, index);
    if (bound === 'upper') {
      filters.areaMax = token.value;
    } else {
      // "70 m²" almost always means at least seventy.
      filters.areaMin = token.value;
    }
  });
}

/**
 * Prices, after rooms and area have taken their numbers.
 *
 * A number with a scale word, or next to a price word, or simply large, is a
 * price. The "simply large" rule is what makes "under 60 million" and
 * "60000000" both work without the writer having to say "price".
 */
function matchPrice(tokens: Token[], filters: ParsedFilters): void {
  tokens.forEach((token, index) => {
    if (token.used || token.value === undefined) {
      return;
    }
    const scale = scaleAfter(tokens, index);
    const priceWord = nearby(tokens, index, PRICE_WORDS, 2);
    const amount = token.value * scale.factor;
    const looksLikePrice = scale.factor > 1 || priceWord !== undefined || amount >= 1_000_000;
    if (!looksLikePrice) {
      return;
    }

    token.used = true;
    if (scale.consumed > 0) {
      const scaleToken = tokens[index + 1];
      if (scaleToken !== undefined) {
        scaleToken.used = true;
      }
    }
    if (priceWord !== undefined) {
      priceWord.used = true;
    }

    const bound = boundAround(tokens, index);
    if (bound === 'lower') {
      filters.priceMin = Math.round(amount);
    } else {
      // Unqualified, a budget is a ceiling: "60 million" means at most.
      filters.priceMax = Math.round(amount);
    }
  });
}

/**
 * "not the ground floor", "не первый этаж", "ոչ առաջին հարկ".
 *
 * Only the negated forms are acted on. Someone who says "first floor" without a
 * negation is expressing a preference the filters cannot represent, and turning
 * it into an exclusion would be the opposite of what they asked.
 */
function matchFloors(tokens: Token[], filters: ParsedFilters): void {
  tokens.forEach((token, index) => {
    if (token.used || !FLOOR_WORDS.has(token.text)) {
      return;
    }
    const ground = nearby(tokens, index, GROUND_FLOOR_WORDS, 2);
    const top = nearby(tokens, index, TOP_FLOOR_WORDS, 2);
    const which = ground ?? top;
    if (which === undefined) {
      return;
    }
    const negation =
      nearby(tokens, index, NEGATION_WORDS, 3) ??
      nearby(tokens, tokens.indexOf(which), NEGATION_WORDS, 2);
    if (negation === undefined) {
      return;
    }
    token.used = true;
    which.used = true;
    negation.used = true;
    if (ground !== undefined) {
      filters.excludeGroundFloor = true;
    } else {
      filters.excludeTopFloor = true;
    }
  });
}

function matchFlags(tokens: Token[], filters: ParsedFilters): void {
  for (const [index, token] of tokens.entries()) {
    if (token.used) {
      continue;
    }
    const negated = nearby(tokens, index, NEGATION_WORDS, 2) !== undefined;
    if (ELEVATOR_WORDS.has(token.text)) {
      token.used = true;
      filters.hasElevator = !negated;
    } else if (PARKING_WORDS.has(token.text)) {
      token.used = true;
      filters.hasParking = !negated;
    }
  }
}

function matchVocabulary(tokens: Token[], filters: ParsedFilters): void {
  const conditions = new Set<Condition>();
  const buildingTypes = new Set<BuildingType>();
  for (const token of tokens) {
    if (token.used) {
      continue;
    }
    const condition = CONDITION_WORDS[token.text];
    if (condition !== undefined) {
      token.used = true;
      conditions.add(condition);
      continue;
    }
    const buildingType = BUILDING_TYPE_WORDS[token.text];
    if (buildingType !== undefined) {
      token.used = true;
      buildingTypes.add(buildingType);
    }
  }
  if (conditions.size > 0) {
    filters.conditions = [...conditions];
  }
  if (buildingTypes.size > 0) {
    filters.buildingTypes = [...buildingTypes];
  }
}

/**
 * Words that matched nothing and are worth admitting to.
 *
 * Filler is dropped, because reporting "the" as misunderstood would bury the one
 * word that matters. At most ten, because a wall of them is not feedback.
 */
function leftovers(tokens: Token[]): string[] {
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.used || NOISE_WORDS.has(token.text) || token.text.length < 3) {
      continue;
    }
    seen.add(token.text);
  }
  return [...seen].slice(0, 10);
}
