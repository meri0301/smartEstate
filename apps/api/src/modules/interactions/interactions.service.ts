/**
 * Recording what a reader did with a listing.
 *
 * This is the outcome stream for the A/B harness and, later, the training data
 * for a learned ranker — which is why it is written from the first day rather
 * than the day somebody wants to train one.
 *
 * A subject is a signed-in user or an anonymous browser id the client minted.
 * Neither is required: an interaction with no subject is still a fact about the
 * listing. A `sessionId` that does not name a real recommendation session is
 * dropped rather than stored, so a client cannot attribute outcomes to a ranking
 * that never happened.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { InteractionRecorded, RecordInteractionBody } from '@smartestate/contracts';
import { uuidV7 } from '../../common/ids/uuid-v7.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

export interface InteractionSubject {
  userId: string | undefined;
  anonymousId: string | undefined;
}

@Injectable()
export class InteractionsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    body: RecordInteractionBody,
    subject: InteractionSubject,
  ): Promise<InteractionRecorded> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: body.listingId },
      select: { id: true },
    });
    if (listing === null) {
      throw new NotFoundException({ message: 'Listing not found', code: 'NOT_FOUND' });
    }

    // An outcome is attributed to a session only if that session exists and
    // showed this listing. Anything else is either a mistake or an attempt to
    // put a thumb on the scale, and neither belongs in the results.
    const sessionId = await this.attributableSession(body.sessionId, body.listingId);

    const id = uuidV7();
    const row = await this.prisma.userInteraction.create({
      data: {
        id,
        userId: subject.userId ?? null,
        anonymousId: subject.anonymousId ?? null,
        listingId: body.listingId,
        type: body.type,
        value: body.value ?? null,
        sessionId,
      },
      select: { id: true, createdAt: true },
    });
    return { id: row.id, recordedAt: row.createdAt.toISOString() };
  }

  private async attributableSession(
    sessionId: string | undefined,
    listingId: string,
  ): Promise<string | null> {
    if (sessionId === undefined) {
      return null;
    }
    const session = await this.prisma.recommendationSession.findUnique({
      where: { id: sessionId },
      select: { results: true },
    });
    if (session === null || !Array.isArray(session.results)) {
      return null;
    }
    const shown = session.results.some(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'listingId' in entry &&
        entry.listingId === listingId,
    );
    return shown ? sessionId : null;
  }
}
