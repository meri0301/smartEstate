/**
 * Valuing a property nobody has listed.
 *
 * The listing valuation answers "is this listing priced well?". This answers the
 * question the product is named for — "should I buy this?" — about a flat the
 * reader is standing in, which exists nowhere in the catalogue.
 *
 * Nothing is stored. A quote is about a property with no identity, asked by
 * someone who may not have an account; writing it down would accumulate rows
 * that can never be joined to anything and, for a reader typing their own
 * address into a form, would be a record of an intention they did not offer.
 * The model version is returned with every figure instead, which is what makes a
 * screenshot traceable.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ValuationAssumption,
  ValuationFactor,
  ValuationQuote,
  ModelAccuracy,
  ValuationQuoteRequest,
} from '@smartestate/contracts';
import type { MlListingFeatures } from '../../infrastructure/ml/ml.client.js';
import { MlClient } from '../../infrastructure/ml/ml.client.js';
import { impactAmd, verdictFor } from './valuation.mapper.js';
import { confidenceOf, evidenceOf, grossRentalYieldPct } from './quote.js';
import { QuoteRepository, type DistrictStock } from './quote.repository.js';

/**
 * Stood in for a district whose published stock is empty.
 *
 * A district with no listings cannot supply a median, and the model refuses a
 * request without a construction year. These are the least committal values
 * available: the midpoint of the Soviet-era stock that dominates the catalogue,
 * and the commonest heating in Armenian apartments. Both are reported as
 * assumptions, so a reader is never shown a figure resting on them silently.
 */
const FALLBACK_CONSTRUCTION_YEAR = 1975;
const FALLBACK_HEATING = 'CENTRAL_GAS' as const;

/**
 * Interior proportions for a district with nothing published in it.
 *
 * Shares of the floor area rather than absolute sizes, so they hold for a studio
 * and for a five-room flat alike, and a ceiling height typical of the Soviet-era
 * stock. Only reached when a district has no listings at all; everywhere else
 * the district's own median is used.
 */
const DEFAULT_LIVING_RATIO = 0.6;
const DEFAULT_KITCHEN_RATIO = 0.14;
const DEFAULT_CEILING_HEIGHT = 2.7;

@Injectable()
export class QuoteService {
  constructor(
    private readonly quotes: QuoteRepository,
    private readonly ml: MlClient,
  ) {}

  /** What the model measured about itself, for the question the FAQ asks. */
  async accuracy(): Promise<ModelAccuracy> {
    const info = await this.ml.modelInfo();
    return {
      modelVersion: info.modelVersion,
      trainedAt: info.trainedAt,
      trainingRows: info.trainingRows,
      districtsCovered: info.districts.length,
      target: info.target,
      withinKnownDistrictsMape: info.metrics?.random.model.mape,
      unseenDistrictMape: info.metrics?.grouped.model.mape,
      intervalCoverage: info.metrics?.grouped.intervalCoverageCalibrated,
    };
  }

  async quote(request: ValuationQuoteRequest): Promise<ValuationQuote> {
    const stock = await this.quotes.districtStock(request.districtSlug);
    if (stock === undefined) {
      throw new BadRequestException({
        message: `Unknown district "${request.districtSlug}"`,
        code: 'UNKNOWN_DISTRICT',
      });
    }

    const { features, assumptions } = toFeatures(request, stock);
    const [explanation, comparableCount] = await Promise.all([
      this.ml.explain(features, request.askingPriceAmd),
      this.quotes.countComparables({
        districtSlug: request.districtSlug,
        rooms: request.rooms,
        totalArea: request.totalArea,
      }),
    ]);

    const fairPriceAmd = Math.max(0, Math.round(explanation.estimate.priceAmd));
    const lowerBoundAmd = Math.max(0, Math.round(explanation.estimate.lowPriceAmd));
    const upperBoundAmd = Math.max(0, Math.round(explanation.estimate.highPriceAmd));

    return {
      modelVersion: explanation.modelVersion,
      fairPriceAmd,
      lowerBoundAmd,
      upperBoundAmd,
      deviationPct: roundTo(
        explanation.deviation !== null
          ? explanation.deviation * 100
          : deviationOf(request.askingPriceAmd, fairPriceAmd),
        2,
      ),
      verdict:
        explanation.verdict ?? verdictFor(request.askingPriceAmd, lowerBoundAmd, upperBoundAmd),
      factors: explanation.contributions.map((contribution): ValuationFactor => ({
        feature: contribution.feature,
        value: contribution.value,
        effect: roundTo(contribution.effect, 4),
        impactAmd: impactAmd(fairPriceAmd, contribution.logContribution),
      })),
      comparableCount,
      evidence: evidenceOf(comparableCount),
      confidence: roundTo(confidenceOf({ fairPriceAmd, lowerBoundAmd, upperBoundAmd }), 3),
      ...(request.monthlyRentAmd !== undefined && request.monthlyRentAmd > 0
        ? {
            grossRentalYieldPct: roundTo(
              grossRentalYieldPct(request.monthlyRentAmd, request.askingPriceAmd),
              2,
            ),
          }
        : {}),
      assumptions,
      calculatedAt: new Date().toISOString(),
    };
  }
}

/**
 * The property as the model expects it, and what had to be assumed.
 *
 * The reader's own answers always win. Only the blanks are filled, and every
 * fill is recorded — an estimate resting on a guessed construction year is still
 * a useful estimate, but only if the reader can see which year was guessed.
 *
 * `notes` is never mapped. It is prose about a property, the model takes
 * numbers and categories, and there is no honest way to turn one into the other.
 */
export function toFeatures(
  request: ValuationQuoteRequest,
  stock: DistrictStock,
): { features: MlListingFeatures; assumptions: ValuationAssumption[] } {
  const assumptions: ValuationAssumption[] = [];

  const constructionYear =
    request.constructionYear ?? stock.medianConstructionYear ?? FALLBACK_CONSTRUCTION_YEAR;
  if (request.constructionYear === undefined) {
    assumptions.push({ field: 'constructionYear', value: String(constructionYear) });
  }

  const heating = request.heating ?? stock.commonestHeating ?? FALLBACK_HEATING;
  if (request.heating === undefined) {
    assumptions.push({ field: 'heating', value: heating });
  }

  // There is no address in the request, so the property is placed at the centre
  // of its district. Distance to the centre is one of the model's features, so
  // this is a real substitution and is reported as one.
  assumptions.push({ field: 'coordinates', value: request.districtSlug });

  // The interior details the form never asks about, taken from the district's
  // typical flat and scaled to this one's size. Sending nulls instead does not
  // describe an unremarkable ceiling height — it describes an unknown one,
  // which the model has barely seen and prices down accordingly.
  assumptions.push({ field: 'interior', value: request.districtSlug });

  return {
    features: {
      totalArea: request.totalArea,
      rooms: request.rooms,
      floor: request.floor,
      totalFloors: request.totalFloors,
      constructionYear,
      districtSlug: request.districtSlug,
      buildingType: request.buildingType,
      condition: request.condition,
      heating,
      ownershipDocs: 'UNVERIFIED',
      lat: stock.lat,
      lon: stock.lon,
      livingArea: scaled(stock.medianLivingAreaRatio, request.totalArea, DEFAULT_LIVING_RATIO),
      kitchenArea: scaled(stock.medianKitchenAreaRatio, request.totalArea, DEFAULT_KITCHEN_RATIO),
      bathrooms: stock.medianBathrooms ?? 1,
      ceilingHeight: stock.medianCeilingHeight ?? DEFAULT_CEILING_HEIGHT,
      balconyCount: stock.medianBalconyCount ?? 1,
      hasLoggia: false,
      hasParking: request.hasParking ?? false,
      hasStorage: false,
      hasElevator: request.hasElevator ?? false,
      seismicRetrofit: false,
    },
    assumptions,
  };
}

/** A share of the floor area, rounded to the precision the model's inputs carry. */
function scaled(ratio: number | undefined, totalArea: number, fallback: number): number {
  return Math.round(totalArea * (ratio ?? fallback) * 10) / 10;
}

function deviationOf(askingPriceAmd: number, fairPriceAmd: number): number {
  return fairPriceAmd > 0 ? (askingPriceAmd / fairPriceAmd - 1) * 100 : 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
