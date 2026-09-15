/**
 * Storage for valuations.
 *
 * Every valuation shown to a user is written down, with the model version that
 * produced it. That is what makes a figure in a screenshot traceable months
 * later, and what lets the A/B evaluation compare models on the same listings.
 */
import { Injectable } from '@nestjs/common';
import type { Valuation } from '@smartestate/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

export interface StoredValuation {
  modelVersion: string;
  fairPriceAmd: number;
  lowerBoundAmd: number;
  upperBoundAmd: number;
  deviationPct: number;
  verdict: Valuation['verdict'];
  factors: Valuation['factors'];
  createdAt: Date;
}

@Injectable()
export class ValuationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The most recent valuation for a listing, whatever model produced it. */
  async findLatest(listingId: string): Promise<StoredValuation | undefined> {
    const record = await this.prisma.valuationRecord.findFirst({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
    });
    if (record === null) {
      return undefined;
    }
    return {
      modelVersion: record.modelVersion,
      fairPriceAmd: Number(record.fairPriceAmd),
      lowerBoundAmd: Number(record.lowerBoundAmd),
      upperBoundAmd: Number(record.upperBoundAmd),
      deviationPct: Number(record.deviationPct),
      verdict: record.verdict,
      // `topFactors` is JSON to the database. It is written from a validated
      // shape and read back into the same one; a cast is the honest admission
      // that the column itself carries no guarantee.
      factors: record.topFactors as unknown as Valuation['factors'],
      createdAt: record.createdAt,
    };
  }

  /** Appends a valuation. History is kept: nothing is ever updated in place. */
  async insert(valuation: Valuation): Promise<void> {
    await this.prisma.valuationRecord.create({
      data: {
        listingId: valuation.listingId,
        modelVersion: valuation.modelVersion,
        fairPriceAmd: BigInt(valuation.fairPriceAmd),
        lowerBoundAmd: BigInt(valuation.lowerBoundAmd),
        upperBoundAmd: BigInt(valuation.upperBoundAmd),
        deviationPct: new Prisma.Decimal(valuation.deviationPct),
        verdict: valuation.verdict,
        topFactors: valuation.factors,
      },
    });
  }
}
