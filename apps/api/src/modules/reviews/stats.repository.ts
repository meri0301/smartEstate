import { Injectable } from '@nestjs/common';
import type { ProductStats } from '@smartestate/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

/**
 * How much the product has actually done.
 *
 * The design's badge reads "10,000+ valuations completed", which this system
 * cannot support. These are counts an examiner can check against the database.
 *
 * Standalone quotes from the landing page's calculator are not counted, because
 * ADR-0019 does not store them: a number nothing can be reconciled against
 * would be exactly the invented statistic this replaces.
 */
@Injectable()
export class StatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async counts(): Promise<ProductStats> {
    const [valuationsCompleted, listingsPublished] = await Promise.all([
      this.prisma.valuationRecord.count(),
      this.prisma.listing.count({ where: { status: 'PUBLISHED' } }),
    ]);
    return { valuationsCompleted, listingsPublished };
  }
}
