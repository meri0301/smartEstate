/**
 * Templated listing titles and descriptions in Armenian, Russian and English.
 *
 * The texts are generated from structured attributes, so every sentence is
 * backed by a database column — nothing is invented. They also give the
 * multilingual embedding model (Phase 7/8) realistic, parallel corpora.
 */
import type {
  BuildingType,
  Condition,
  HeatingType,
  Locale,
} from '../../../src/generated/prisma/enums.js';
import type { Street } from '../data/streets.js';

export interface LocalizedText {
  title: string;
  description: string;
}

export interface ListingTextInput {
  rooms: number;
  totalArea: number;
  floor: number;
  totalFloors: number;
  buildingType: BuildingType;
  constructionYear: number;
  condition: Condition;
  heating: HeatingType;
  ceilingHeight: number;
  hasElevator: boolean;
  balconyCount: number;
  hasParking: boolean;
  hasStorage: boolean;
  priceNegotiable: boolean;
  docsVerified: boolean;
  district: { nameHy: string; nameRu: string; nameEn: string };
  street: Street;
  houseNumber: string;
}

type Vocabulary<K extends string> = Readonly<Record<K, Readonly<Record<Locale, string>>>>;

const BUILDING_TYPE_LABEL: Vocabulary<BuildingType> = {
  STONE: { hy: 'քարե շենք', ru: 'каменный дом', en: 'stone building' },
  PANEL: { hy: 'պանելային շենք', ru: 'панельный дом', en: 'panel building' },
  MONOLITH: { hy: 'մոնոլիտ շենք', ru: 'монолитный дом', en: 'monolith building' },
  KHRUSHCHYOVKA: { hy: 'խրուշչովկա', ru: 'хрущёвка', en: 'Khrushchyovka-era building' },
  STALINKA: { hy: 'ստալինկա', ru: 'сталинка', en: 'Stalin-era building' },
  NEW_BUILD: { hy: 'նորակառույց', ru: 'новостройка', en: 'new build' },
};

const CONDITION_LABEL: Vocabulary<Condition> = {
  NEEDS_REPAIR: { hy: 'վերանորոգման կարիք ունի', ru: 'требует ремонта', en: 'needs renovation' },
  OLD_RENOVATION: { hy: 'հին վերանորոգում', ru: 'старый ремонт', en: 'dated renovation' },
  GOOD: { hy: 'լավ վիճակ', ru: 'хорошее состояние', en: 'good condition' },
  EURO_RENOVATION: { hy: 'եվրովերանորոգում', ru: 'евроремонт', en: 'European-style renovation' },
  DESIGNER: {
    hy: 'դիզայներական վերանորոգում',
    ru: 'дизайнерский ремонт',
    en: 'designer renovation',
  },
};

const HEATING_LABEL: Vocabulary<HeatingType> = {
  CENTRAL_GAS: { hy: 'կենտրոնական գազային', ru: 'центральное газовое', en: 'central gas' },
  INDIVIDUAL_GAS_BOILER: {
    hy: 'անհատական գազի կաթսա',
    ru: 'индивидуальный газовый котёл',
    en: 'individual gas boiler',
  },
  ELECTRIC: { hy: 'էլեկտրական', ru: 'электрическое', en: 'electric' },
  NONE: { hy: 'բացակայում է', ru: 'отсутствует', en: 'none' },
};

function formatArea(area: number): string {
  return Number.isInteger(area) ? String(area) : area.toFixed(1);
}

function formatCeiling(height: number): string {
  return height.toFixed(1);
}

/** Armenian ordinal suffix: 1-ին, otherwise -րդ. */
function armenianOrdinal(n: number): string {
  return n === 1 ? '1-ին' : `${String(n)}-րդ`;
}

function russianBalconies(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${String(count)} балкон`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${String(count)} балкона`;
  }
  return `${String(count)} балконов`;
}

function englishBalconies(count: number): string {
  return count === 1 ? '1 balcony' : `${String(count)} balconies`;
}

function buildArmenian(input: ListingTextInput): LocalizedText {
  const area = formatArea(input.totalArea);
  const sentences = [
    `Վաճառվում է ${String(input.rooms)} սենյականոց բնակարան ${input.district.nameHy} վարչական շրջանում, ${input.street.hy} փողոց ${input.houseNumber}։`,
    `Ընդհանուր մակերեսը՝ ${area} քմ, ${armenianOrdinal(input.floor)} հարկ ${String(input.totalFloors)} հարկանի շենքում (${BUILDING_TYPE_LABEL[input.buildingType].hy}, ${String(input.constructionYear)} թ.)։`,
    `Վիճակը՝ ${CONDITION_LABEL[input.condition].hy}։ Առաստաղի բարձրությունը՝ ${formatCeiling(input.ceilingHeight)} մ։ Ջեռուցումը՝ ${HEATING_LABEL[input.heating].hy}։`,
  ];
  const extras: string[] = [];
  if (input.hasElevator) {
    extras.push('Կա վերելակ։');
  }
  if (input.balconyCount > 0) {
    extras.push(`${String(input.balconyCount)} պատշգամբ։`);
  }
  if (input.hasParking) {
    extras.push('Ավտոկայանատեղի։');
  }
  if (input.hasStorage) {
    extras.push('Նկուղ։');
  }
  if (input.docsVerified) {
    extras.push('Սեփականության փաստաթղթերը ստուգված են։');
  }
  if (input.priceNegotiable) {
    extras.push('Գինը սակարկելի է։');
  }
  return {
    title: `${String(input.rooms)} սենյականոց բնակարան, ${input.district.nameHy}, ${area} քմ`,
    description: [...sentences, extras.join(' ')].filter((s) => s.length > 0).join(' '),
  };
}

function buildRussian(input: ListingTextInput): LocalizedText {
  const area = formatArea(input.totalArea);
  const sentences = [
    `Продаётся ${String(input.rooms)}-комнатная квартира в административном районе ${input.district.nameRu}, улица ${input.street.ru}, дом ${input.houseNumber}.`,
    `Общая площадь ${area} м², ${String(input.floor)} этаж ${String(input.totalFloors)}-этажного дома (${BUILDING_TYPE_LABEL[input.buildingType].ru}, ${String(input.constructionYear)} г.).`,
    `Состояние: ${CONDITION_LABEL[input.condition].ru}. Высота потолков ${formatCeiling(input.ceilingHeight)} м. Отопление: ${HEATING_LABEL[input.heating].ru}.`,
  ];
  const extras: string[] = [];
  if (input.hasElevator) {
    extras.push('Есть лифт.');
  }
  if (input.balconyCount > 0) {
    extras.push(`${russianBalconies(input.balconyCount)}.`);
  }
  if (input.hasParking) {
    extras.push('Парковочное место.');
  }
  if (input.hasStorage) {
    extras.push('Кладовая.');
  }
  if (input.docsVerified) {
    extras.push('Документы на собственность проверены.');
  }
  if (input.priceNegotiable) {
    extras.push('Цена договорная.');
  }
  return {
    title: `${String(input.rooms)}-комнатная квартира, ${input.district.nameRu}, ${area} м²`,
    description: [...sentences, extras.join(' ')].filter((s) => s.length > 0).join(' '),
  };
}

function buildEnglish(input: ListingTextInput): LocalizedText {
  const area = formatArea(input.totalArea);
  const sentences = [
    `For sale: ${String(input.rooms)}-room apartment in ${input.district.nameEn} district, ${input.street.en} Street ${input.houseNumber}.`,
    `Total area ${area} m², floor ${String(input.floor)} of ${String(input.totalFloors)}, ${BUILDING_TYPE_LABEL[input.buildingType].en} built in ${String(input.constructionYear)}.`,
    `Condition: ${CONDITION_LABEL[input.condition].en}. Ceiling height ${formatCeiling(input.ceilingHeight)} m. Heating: ${HEATING_LABEL[input.heating].en}.`,
  ];
  const extras: string[] = [];
  if (input.hasElevator) {
    extras.push('Elevator available.');
  }
  if (input.balconyCount > 0) {
    extras.push(`${englishBalconies(input.balconyCount)}.`);
  }
  if (input.hasParking) {
    extras.push('Parking space.');
  }
  if (input.hasStorage) {
    extras.push('Storage room.');
  }
  if (input.docsVerified) {
    extras.push('Ownership documents verified.');
  }
  if (input.priceNegotiable) {
    extras.push('Price negotiable.');
  }
  return {
    title: `${String(input.rooms)}-room apartment in ${input.district.nameEn}, ${area} m²`,
    description: [...sentences, extras.join(' ')].filter((s) => s.length > 0).join(' '),
  };
}

export function buildListingTexts(
  input: ListingTextInput,
): Readonly<Record<Locale, LocalizedText>> {
  return {
    hy: buildArmenian(input),
    ru: buildRussian(input),
    en: buildEnglish(input),
  };
}
