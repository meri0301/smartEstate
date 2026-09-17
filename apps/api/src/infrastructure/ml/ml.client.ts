/**
 * HTTP client for the Python ML service.
 *
 * The response is parsed with a schema rather than trusted, for the same reason
 * every other boundary in this project is: the two services are written in
 * different languages and deployed separately, so the only thing keeping their
 * shapes in step is a check that runs. A mismatch surfaces here, with the field
 * that was wrong, instead of as a NaN in a price three layers later.
 *
 * Failures are deliberately not retried. A valuation is an enhancement to a
 * listing page, not the page itself; waiting twice as long to fail makes the
 * product worse, and the caller already knows how to do without one.
 */
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from '../../common/errors/domain-error.js';
import { InjectConfig, type AppConfig } from '../../config/app-config.js';

/** Mirrors `ListingFeatures` in `apps/ml/app/schemas/valuation.py`. */
export interface MlListingFeatures {
  totalArea: number;
  rooms: number;
  floor: number;
  totalFloors: number;
  constructionYear: number;
  districtSlug: string;
  buildingType: string;
  condition: string;
  heating: string;
  ownershipDocs: string;
  lat: number;
  lon: number;
  livingArea: number | null;
  kitchenArea: number | null;
  bathrooms: number;
  ceilingHeight: number | null;
  balconyCount: number;
  hasLoggia: boolean;
  hasParking: boolean;
  hasStorage: boolean;
  hasElevator: boolean;
  seismicRetrofit: boolean;
}

const estimateSchema = z.object({
  pricePerSqmAmd: z.number(),
  priceAmd: z.number(),
  lowPriceAmd: z.number(),
  highPriceAmd: z.number(),
});

const explainResponseSchema = z.object({
  modelVersion: z.string().min(1),
  estimate: estimateSchema,
  baselinePricePerSqmAmd: z.number(),
  contributions: z.array(
    z.object({
      feature: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      effect: z.number(),
      logContribution: z.number(),
    }),
  ),
  deviation: z.number().nullable(),
  verdict: z.enum(['UNDERPRICED', 'FAIR', 'OVERPRICED']).nullable(),
});
export type MlExplanation = z.infer<typeof explainResponseSchema>;

const predictResponseSchema = z.object({
  modelVersion: z.string().min(1),
  estimates: z.array(estimateSchema),
});
export type MlPrediction = z.infer<typeof predictResponseSchema>;

/** The service refuses a larger batch, and so does this client, with a clearer message. */
export const ML_MAX_BATCH = 100;

/** `/embed` has a tighter limit than `/predict`: encoding is far slower than a tree. */
export const ML_MAX_EMBED_BATCH = 64;

/**
 * Which end of a search a text belongs to.
 *
 * The encoder was trained with different prefixes for the two, and using the
 * wrong one costs retrieval quality with nothing to notice, so it is part of the
 * call rather than a default anybody can forget.
 */
export type MlTextKind = 'query' | 'passage';

const embedResponseSchema = z.object({
  modelVersion: z.string().min(1),
  dimensions: z.number().int().positive(),
  embeddings: z.array(z.array(z.number())),
});
export type MlEmbeddings = z.infer<typeof embedResponseSchema>;

const embeddingModelSchema = z.object({
  modelVersion: z.string().min(1),
  dimensions: z.number().int().positive(),
});
export type MlEmbeddingModel = z.infer<typeof embeddingModelSchema>;

/** One cross-validation scheme's score for the model itself. */
const foldMetricsSchema = z.object({
  model: z.object({ mape: z.number(), r2: z.number() }),
  intervalCoverageCalibrated: z.number(),
});

const modelInfoSchema = z.object({
  modelVersion: z.string().min(1),
  trainedAt: z.string(),
  trainingRows: z.number().int(),
  districts: z.array(z.string()).default([]),
  target: z.string().default(''),
  /**
   * Both validation schemes. The random one holds out listings; the grouped one
   * holds out whole districts, which is the harder and more honest question —
   * it asks what happens somewhere the model has never been.
   */
  metrics: z.object({ random: foldMetricsSchema, grouped: foldMetricsSchema }).optional(),
});

export type MlModelInfo = z.infer<typeof modelInfoSchema>;

/** The ML service could not be reached, or answered with something unusable. */
export class MlUnavailableError extends DomainError {
  readonly code = 'ML_UNAVAILABLE';
  /** 503: nothing is wrong with the request, a dependency is missing. */
  readonly status = 503;

  constructor(reason: string) {
    super(`The model service is unavailable: ${reason}`);
  }
}

/** How long the model version is reused before the service is asked again. */
const MODEL_VERSION_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class MlClient {
  private readonly logger = new Logger(MlClient.name);
  private cachedVersion: { value: string; expiresAt: number } | undefined;
  private cachedEmbeddingModel: { value: MlEmbeddingModel; expiresAt: number } | undefined;

  constructor(@InjectConfig() private readonly config: AppConfig) {}

  /**
   * Version of the deployed model, cached briefly.
   *
   * The valuation service needs it on every request, to decide whether a stored
   * valuation is still current, and it changes only when someone retrains.
   */
  async modelVersion(): Promise<string> {
    const now = Date.now();
    if (this.cachedVersion !== undefined && this.cachedVersion.expiresAt > now) {
      return this.cachedVersion.value;
    }
    const info = modelInfoSchema.parse(await this.request('GET', '/model'));
    this.cachedVersion = { value: info.modelVersion, expiresAt: now + MODEL_VERSION_TTL_MS };
    return info.modelVersion;
  }

  /** Everything the model service knows about what is loaded, metrics included. */
  async modelInfo(): Promise<MlModelInfo> {
    const parsed = modelInfoSchema.safeParse(await this.request('GET', '/model'));
    if (!parsed.success) {
      throw new MlUnavailableError('it answered /model with an unexpected shape');
    }
    return parsed.data;
  }

  /** Value one listing and ask why. `askingPriceAmd` adds the deviation and the verdict. */
  async explain(
    listing: MlListingFeatures,
    askingPriceAmd: number,
    topK = 3,
  ): Promise<MlExplanation> {
    const body = await this.request('POST', '/explain', { listing, askingPriceAmd, topK });
    const parsed = explainResponseSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new MlUnavailableError(`it answered with an unexpected shape (${detail})`);
    }
    return parsed.data;
  }

  /**
   * Value a batch of listings without asking why.
   *
   * Ranking needs an estimate for every candidate and a reason for none of them,
   * so this is the cheap call: one round trip for a whole page of results rather
   * than one per listing.
   */
  async predict(listings: readonly MlListingFeatures[]): Promise<MlPrediction> {
    if (listings.length === 0) {
      return { modelVersion: await this.modelVersion(), estimates: [] };
    }
    if (listings.length > ML_MAX_BATCH) {
      throw new MlUnavailableError(
        `a batch of ${String(listings.length)} exceeds the limit of ${String(ML_MAX_BATCH)}`,
      );
    }
    const body = await this.request('POST', '/predict', { listings });
    const parsed = predictResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new MlUnavailableError('it answered /predict with an unexpected shape');
    }
    if (parsed.data.estimates.length !== listings.length) {
      // The estimates are matched to listings by position, so a short answer
      // would silently attach one listing's price to another.
      throw new MlUnavailableError(
        `it returned ${String(parsed.data.estimates.length)} estimates for ${String(listings.length)} listings`,
      );
    }
    return parsed.data;
  }

  /**
   * Which encoder is loaded, cached briefly.
   *
   * A search asks on every request and does not care whether the answer is a few
   * minutes old, so the cache saves a round trip per search.
   *
   * A backfill passes `fresh` and must: it decides from this answer which stored
   * vectors are from other weights and therefore get deleted. Acting on a
   * five-minute-old version could delete the current rows and keep the stale
   * ones, which is the one mistake this whole versioning scheme exists to
   * prevent.
   */
  async embeddingModel(options: { fresh?: boolean } = {}): Promise<MlEmbeddingModel> {
    const now = Date.now();
    if (
      options.fresh !== true &&
      this.cachedEmbeddingModel !== undefined &&
      this.cachedEmbeddingModel.expiresAt > now
    ) {
      return this.cachedEmbeddingModel.value;
    }
    const parsed = embeddingModelSchema.safeParse(await this.request('GET', '/embed/model'));
    if (!parsed.success) {
      throw new MlUnavailableError('it answered /embed/model with an unexpected shape');
    }
    this.cachedEmbeddingModel = { value: parsed.data, expiresAt: now + MODEL_VERSION_TTL_MS };
    return parsed.data;
  }

  /**
   * Encode a batch of texts as vectors, in order.
   *
   * Position is the only thing tying a vector back to its text, so a short or
   * long answer is refused rather than zipped optimistically: attaching one
   * listing's meaning to another would be undetectable afterwards.
   */
  async embed(texts: readonly string[], kind: MlTextKind): Promise<MlEmbeddings> {
    if (texts.length === 0) {
      const model = await this.embeddingModel();
      return { ...model, embeddings: [] };
    }
    if (texts.length > ML_MAX_EMBED_BATCH) {
      throw new MlUnavailableError(
        `a batch of ${String(texts.length)} exceeds the embedding limit of ${String(ML_MAX_EMBED_BATCH)}`,
      );
    }
    const parsed = embedResponseSchema.safeParse(
      await this.request('POST', '/embed', { texts, kind }, this.config.ml.embedTimeoutMs),
    );
    if (!parsed.success) {
      throw new MlUnavailableError('it answered /embed with an unexpected shape');
    }
    if (parsed.data.embeddings.length !== texts.length) {
      throw new MlUnavailableError(
        `it returned ${String(parsed.data.embeddings.length)} vectors for ${String(texts.length)} texts`,
      );
    }
    const wrong = parsed.data.embeddings.find((vector) => vector.length !== parsed.data.dimensions);
    if (wrong !== undefined) {
      // The column is fixed width. A vector of the wrong length would fail the
      // insert, and one of the right length but the wrong model would not.
      throw new MlUnavailableError(
        `it returned a vector of ${String(wrong.length)} dimensions, not ${String(parsed.data.dimensions)}`,
      );
    }
    return parsed.data;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    timeoutMs: number = this.config.ml.timeoutMs,
  ): Promise<unknown> {
    const url = `${this.config.ml.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        signal: AbortSignal.timeout(timeoutMs),
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch (error) {
      // A timeout and a refused connection are the same thing to the caller:
      // there is no valuation to be had right now.
      const reason = error instanceof Error ? error.message : 'the request failed';
      this.logger.warn({ url, err: error }, 'ML request failed');
      throw new MlUnavailableError(reason);
    }

    if (!response.ok) {
      const detail = await readDetail(response);
      this.logger.warn({ url, status: response.status }, 'ML request rejected');
      throw new MlUnavailableError(`it answered ${String(response.status)}${detail}`);
    }
    return response.json();
  }
}

/** FastAPI puts a readable message in `detail`; anything else is not worth quoting. */
async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const { detail } = body;
      if (typeof detail === 'string') {
        return ` (${detail})`;
      }
    }
  } catch {
    // A body that is not JSON tells the caller nothing; the status already did.
  }
  return '';
}
