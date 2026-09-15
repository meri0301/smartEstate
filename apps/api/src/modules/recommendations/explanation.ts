/**
 * Why a listing is where it is, computed from the arithmetic that put it there.
 *
 * This is the explanation. Not a summary of one, not a prompt for one: the
 * highlights produced here are what a client renders, in any of the three
 * languages, with or without a language model in the picture. A model may later
 * phrase the same facts as a paragraph, and that paragraph is checked against
 * these numbers before anyone sees it.
 *
 * Two rules shape the selection. Trade-offs are named as readily as strengths,
 * because a recommender that only lists reasons to say yes is an advertisement.
 * And a reason is only worth stating if it carries weight: a criterion the buyer
 * gave almost no weight to did not put the listing anywhere, however well it
 * scored, so it stays out of the reasons.
 */
import type {
  CriterionScore,
  ExplanationFact,
  ExplanationHighlight,
  PreferenceProfile,
  RankedExplanation,
  RankingCriterion,
} from '@smartestate/contracts';
import { toNumber, type ListingRow } from '../listings/listing-row.js';
import { haversineMetres } from './criteria.js';

/**
 * At or above this a criterion is a reason to look; at or below it is a reason
 * to hesitate. The band between is the ordinary middle, which explains nothing
 * and is left unsaid.
 */
const STRENGTH_SCORE = 0.7;
const TRADEOFF_SCORE = 0.35;

/**
 * The least weight a criterion can carry and still be given as a reason.
 *
 * With seven criteria an even split is about 0.14, so this admits anything the
 * buyer did not actively push aside, and excludes the criterion they set to
 * almost nothing — which cannot honestly be described as a reason for the
 * position of anything.
 */
const MIN_REASON_WEIGHT = 0.05;

/** More than four reasons is a list, and a list is not an explanation. */
const MAX_HIGHLIGHTS = 4;

/** The reference year the building-age fact is measured against. */
const REFERENCE_YEAR = 2026;

export interface ExplanationInput {
  row: ListingRow;
  breakdown: readonly CriterionScore[];
  preferences: PreferenceProfile;
  /** Asking price against the model's estimate, when there was one. */
  deviationPct?: number | undefined;
}

/**
 * The strongest few reasons, strengths first, each with its figure.
 *
 * Ordered by how much the criterion actually moved the score, so the first
 * reason is the one that did the most work. A trade-off is ranked by the same
 * measure: a criterion with weight behind it that scored badly cost the listing
 * more than a criterion nobody weighted.
 */
export function explain(input: ExplanationInput): RankedExplanation {
  const candidates: (ExplanationHighlight & { rankBy: number })[] = [];

  for (const entry of input.breakdown) {
    if (entry.weight < MIN_REASON_WEIGHT) {
      continue;
    }
    const kind =
      entry.score >= STRENGTH_SCORE
        ? 'strength'
        : entry.score <= TRADEOFF_SCORE
          ? 'tradeoff'
          : undefined;
    if (kind === undefined) {
      continue;
    }
    const fact = factFor(entry.criterion, input);
    candidates.push({
      criterion: entry.criterion,
      kind,
      score: entry.score,
      ...(fact === undefined ? {} : { fact }),
      // How far the criterion is from the neutral middle, weighted. A strong
      // score with weight behind it and a weak one both rank highly; a middling
      // one never gets here at all.
      rankBy: Math.abs(entry.score - 0.5) * entry.weight,
    });
  }

  const highlights = candidates
    .sort(byStrengthFirstThenImpact)
    .slice(0, MAX_HIGHLIGHTS)
    .map(({ rankBy: _rankBy, ...highlight }) => highlight);

  return { highlights };
}

/**
 * Strengths before trade-offs, and within each, whatever moved the score most.
 *
 * The order is deliberate rather than purely numeric: a reader wants to know
 * what is good about a listing before what is wrong with it, and a trade-off
 * read first is read as a rejection.
 */
function byStrengthFirstThenImpact(
  a: { kind: string; rankBy: number },
  b: { kind: string; rankBy: number },
): number {
  if (a.kind !== b.kind) {
    return a.kind === 'strength' ? -1 : 1;
  }
  return b.rankBy - a.rankBy;
}

/**
 * The computed figure a criterion's reason is about.
 *
 * Not every criterion has one. `condition` is an enumeration the client already
 * knows how to name, and inventing a number for it would be worse than having
 * none.
 */
function factFor(
  criterion: RankingCriterion,
  input: ExplanationInput,
): { key: ExplanationFact; value: number } | undefined {
  const { row, preferences } = input;
  switch (criterion) {
    case 'price': {
      const price = Number(String(row.price_amd));
      if (preferences.budgetAmd <= 0) {
        return undefined;
      }
      return {
        key: 'budgetHeadroomPct',
        value: round((1 - price / preferences.budgetAmd) * 100, 1),
      };
    }
    case 'value':
      return input.deviationPct === undefined
        ? undefined
        : { key: 'priceVsEstimatePct', value: round(input.deviationPct, 1) };
    case 'size':
      return { key: 'areaSqm', value: round(toNumber(row.total_area), 1) };
    case 'rooms':
      return { key: 'rooms', value: row.rooms };
    case 'location':
      return preferences.anchor === undefined
        ? undefined
        : {
            key: 'distanceM',
            value: Math.round(haversineMetres(preferences.anchor, { lat: row.lat, lon: row.lon })),
          };
    case 'building':
      return {
        key: 'buildingAgeYears',
        value: Math.max(0, REFERENCE_YEAR - row.b_construction_year),
      };
    case 'condition':
      return undefined;
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
