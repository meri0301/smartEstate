/**
 * Reading experiments and what happened under them.
 *
 * Arms are a JSON column validated on read, like the refund rules: a row that
 * does not parse is refused rather than defaulted, because an experiment with
 * an invented arm would silently assign real people to nothing.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  experimentArmSchema,
  type Experiment,
  type ExperimentArm,
  type InteractionType,
} from '@smartestate/contracts';
import { z } from 'zod';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

const armsSchema = z.array(experimentArmSchema).min(2);

/** Thrown for a row whose arms do not validate. Never recovered from silently. */
export class InvalidExperimentError extends Error {
  constructor(key: string, detail: string) {
    super(`Experiment "${key}" is not usable: ${detail}`);
  }
}

/** One served session as the metrics need it: what was shown, in order. */
export interface ServedSession {
  id: string;
  arm: string;
  shownListingIds: string[];
}

/** Experiments change rarely; assignment happens on every ranking request. */
const EXPERIMENTS_TTL_MS = 60 * 1000;

@Injectable()
export class ExperimentsRepository {
  private readonly logger = new Logger(ExperimentsRepository.name);
  private cached: { value: Experiment[]; expiresAt: number } | undefined;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<Experiment[]> {
    const now = Date.now();
    if (this.cached !== undefined && this.cached.expiresAt > now) {
      return this.cached.value;
    }
    const rows = await this.prisma.experiment.findMany({ orderBy: { createdAt: 'asc' } });
    const value = rows.map((row) => ({
      key: row.key,
      name: row.name,
      description: row.description,
      arms: parseArms(row.key, row.arms),
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    }));
    this.cached = { value, expiresAt: now + EXPERIMENTS_TTL_MS };
    return value;
  }

  async byKey(key: string): Promise<Experiment | undefined> {
    return (await this.all()).find((experiment) => experiment.key === key);
  }

  /**
   * Every session served under an experiment, with the listings it showed.
   *
   * The results blob holds the full breakdown per listing; only the ids are
   * needed here, in the order they were ranked, which is the order they were
   * shown.
   */
  async sessions(experimentKey: string): Promise<ServedSession[]> {
    const rows = await this.prisma.recommendationSession.findMany({
      where: { experimentKey, arm: { not: null } },
      select: { id: true, arm: true, results: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.flatMap((row) => {
      if (row.arm === null) {
        return [];
      }
      const results = Array.isArray(row.results) ? row.results : [];
      const shownListingIds = results.flatMap((entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'listingId' in entry &&
        typeof entry.listingId === 'string'
          ? [entry.listingId]
          : [],
      );
      return [{ id: row.id, arm: row.arm, shownListingIds }];
    });
  }

  /**
   * Every interaction attributed to a set of sessions.
   *
   * Grouped by session and listing on the way out, so a session's judgement of
   * one listing is a list of what was done to it rather than a scattering of
   * rows the metrics would have to regroup.
   */
  async interactions(
    sessionIds: readonly string[],
  ): Promise<Map<string, Map<string, InteractionType[]>>> {
    const bySession = new Map<string, Map<string, InteractionType[]>>();
    if (sessionIds.length === 0) {
      return bySession;
    }
    const rows = await this.prisma.userInteraction.findMany({
      where: { sessionId: { in: [...sessionIds] } },
      select: { sessionId: true, listingId: true, type: true },
    });
    for (const row of rows) {
      if (row.sessionId === null) {
        continue;
      }
      const byListing = bySession.get(row.sessionId) ?? new Map<string, InteractionType[]>();
      const types = byListing.get(row.listingId) ?? [];
      types.push(row.type);
      byListing.set(row.listingId, types);
      bySession.set(row.sessionId, byListing);
    }
    return bySession;
  }
}

function parseArms(key: string, raw: unknown): ExperimentArm[] {
  const parsed = armsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidExperimentError(
      key,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return parsed.data;
}
