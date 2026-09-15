/**
 * Storage for recommendation runs.
 *
 * Every run is written down with its preferences, its strategy and its ordered
 * results. That record is the raw material of the thesis's ranking comparison:
 * without it, two strategies can only be compared by re-running them, which is
 * not the same as comparing what real users were actually shown.
 */
import { Injectable } from '@nestjs/common';
import type { RankingStrategy } from '@smartestate/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

export interface NewRecommendationSession {
  id: string;
  userId: string | null;
  strategy: RankingStrategy;
  experimentKey: string | null;
  /** The inputs, verbatim, plus what the run decided about them. */
  preferences: Prisma.InputJsonValue;
  /** The ordering, with each listing's score and breakdown. */
  results: Prisma.InputJsonValue;
}

@Injectable()
export class RecommendationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(session: NewRecommendationSession): Promise<void> {
    await this.prisma.recommendationSession.create({
      data: {
        id: session.id,
        userId: session.userId,
        strategy: session.strategy,
        experimentKey: session.experimentKey,
        preferences: session.preferences,
        results: session.results,
      },
    });
  }
}
