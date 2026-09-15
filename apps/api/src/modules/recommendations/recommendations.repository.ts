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
  /** The browser's own id when nobody is signed in, so feedback has a subject. */
  anonymousId: string | null;
  strategy: RankingStrategy;
  experimentKey: string | null;
  /** Written at serving time, never derived: see the experiments migration. */
  arm: string | null;
  /** The inputs, verbatim, plus what the run decided about them. */
  preferences: Prisma.InputJsonValue;
  /** The ordering, with each listing's score, breakdown and computed reasons. */
  results: Prisma.InputJsonValue;
  /**
   * The prompt, model and raw response behind the phrased explanations.
   *
   * Null when no model was asked, which is the default. Stored here rather than
   * in a table of its own because a trace without the ranking it explains is not
   * reproducible, and the two are written in the same transaction.
   */
  llmTrace: Prisma.InputJsonValue | null;
}

@Injectable()
export class RecommendationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(session: NewRecommendationSession): Promise<void> {
    await this.prisma.recommendationSession.create({
      data: {
        id: session.id,
        userId: session.userId,
        anonymousId: session.anonymousId,
        strategy: session.strategy,
        experimentKey: session.experimentKey,
        arm: session.arm,
        preferences: session.preferences,
        results: session.results,
        llmTrace: session.llmTrace ?? Prisma.DbNull,
      },
    });
  }
}
