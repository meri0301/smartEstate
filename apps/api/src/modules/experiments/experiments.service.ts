/**
 * The harness: assigning subjects to arms, and reading the results back.
 *
 * Assignment is called from inside the recommender on every ranking request
 * that names an experiment; results are computed on demand from the sessions
 * and interactions already stored, so there is no second table to keep in step
 * with the first.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ArmComparison,
  ArmResults,
  Experiment,
  ExperimentArm,
  ExperimentResults,
  InteractionType,
  MetricEstimate,
} from '@smartestate/contracts';
import { assign } from './assignment.js';
import { ExperimentsRepository, type ServedSession } from './experiments.repository.js';
import {
  DEFAULT_K,
  estimate,
  gradeListing,
  hadFeedback,
  MINIMUM_SESSIONS_PER_ARM,
  ndcgAtK,
  precisionAtK,
  RELEVANCE_GAINS,
  welchDifference,
  type JudgedSession,
} from './metrics.js';

@Injectable()
export class ExperimentsService {
  constructor(private readonly repository: ExperimentsRepository) {}

  list(): Promise<Experiment[]> {
    return this.repository.all();
  }

  /**
   * The arm a subject is served under an active experiment.
   *
   * `undefined` when the experiment is unknown or paused, in which case the
   * recommender runs as asked and records no arm — a paused experiment must not
   * keep collecting exposures nobody will read.
   */
  async armFor(experimentKey: string, subject: string): Promise<ExperimentArm | undefined> {
    const experiment = await this.repository.byKey(experimentKey);
    if (!experiment?.isActive) {
      return undefined;
    }
    return assign(experimentKey, subject, experiment.arms);
  }

  async results(experimentKey: string, k: number = DEFAULT_K): Promise<ExperimentResults> {
    const experiment = await this.repository.byKey(experimentKey);
    if (experiment === undefined) {
      throw new NotFoundException({ message: 'Unknown experiment', code: 'NOT_FOUND' });
    }

    const sessions = await this.repository.sessions(experimentKey);
    const interactions = await this.repository.interactions(sessions.map((s) => s.id));

    const arms = experiment.arms.map((arm) =>
      summariseArm(
        arm,
        sessions.filter((session) => session.arm === arm.name),
        interactions,
        k,
      ),
    );

    const sufficient = arms.every((entry) => entry.sessions >= MINIMUM_SESSIONS_PER_ARM);

    return {
      experiment,
      k,
      relevanceGains: RELEVANCE_GAINS,
      minimumSessionsPerArm: MINIMUM_SESSIONS_PER_ARM,
      arms,
      // Below the minimum a comparison would be noise dressed as a finding, so
      // none is offered rather than one with a caveat nobody reads.
      comparisons: sufficient ? compareArms(arms) : [],
      sufficient,
      computedAt: new Date().toISOString(),
    };
  }
}

/** One arm's sessions, judged and averaged. */
function summariseArm(
  arm: ExperimentArm,
  served: readonly ServedSession[],
  interactions: ReadonlyMap<string, ReadonlyMap<string, InteractionType[]>>,
  k: number,
): ArmResults {
  const judged: JudgedSession[] = served.map((session) => {
    const byListing = interactions.get(session.id) ?? new Map<string, InteractionType[]>();
    const relevance = new Map<string, number>();
    for (const [listingId, types] of byListing) {
      relevance.set(listingId, gradeListing(types));
    }
    return { shown: session.shownListingIds, relevance };
  });

  const withFeedback = judged.filter(hadFeedback);

  return {
    arm,
    sessions: judged.length,
    sessionsWithFeedback: withFeedback.length,
    // Click-through is over every session: a session nobody acted on is a
    // zero, and leaving it out would flatter every arm equally.
    clickThroughRate: estimate(judged.map((session) => (hadFeedback(session) ? 1 : 0))),
    // The ranking metrics are over sessions with feedback: a session with no
    // judgement says nothing about the order, and scoring it zero would
    // punish arms for readers who closed the tab.
    precisionAtK: estimate(withFeedback.map((session) => precisionAtK(session, k))),
    ndcgAtK: estimate(withFeedback.map((session) => ndcgAtK(session, k))),
  };
}

/** The first arm against each of the others, on every metric. */
function compareArms(arms: readonly ArmResults[]): ArmComparison[] {
  const [control, ...others] = arms;
  if (control === undefined) {
    return [];
  }
  const metrics = ['clickThroughRate', 'precisionAtK', 'ndcgAtK'] as const;
  return others.flatMap((other) =>
    metrics.map((metric) => {
      const a: MetricEstimate = control[metric];
      const b: MetricEstimate = other[metric];
      const interval = welchDifference(a, b);
      return {
        metric,
        arms: [control.arm.name, other.arm.name] as [string, string],
        ...interval,
        distinguishable: interval.confidenceLow > 0 || interval.confidenceHigh < 0,
      };
    }),
  );
}
