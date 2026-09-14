import {
  LISTING_STATUSES,
  LISTING_TRANSITIONS,
  type ListingStatus,
  type ListingTransition,
} from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  applyTransition,
  IllegalListingTransitionError,
  initialStatus,
  isTransitionLegal,
  LISTING_TRANSITIONS_TABLE,
  RejectionReasonRequiredError,
} from './listing-lifecycle.js';

const ACTOR = '00000000-0000-7000-8000-000000000001';
const NOW = new Date('2026-09-14T10:00:00.000Z');
const REASON = 'The photographs do not show the advertised apartment.';

/**
 * The expected machine, written out independently of the implementation. Every
 * status/transition pair that is not listed here must be refused, and the test
 * below walks the full cross product so a new status or a new transition cannot
 * be added without a decision being recorded for each of its combinations.
 */
const LEGAL: Readonly<Record<ListingStatus, readonly ListingTransition[]>> = {
  DRAFT: ['SUBMIT', 'PUBLISH', 'ARCHIVE'],
  PENDING_REVIEW: ['APPROVE', 'REJECT', 'ARCHIVE'],
  PUBLISHED: ['ARCHIVE'],
  REJECTED: ['REVISE', 'ARCHIVE'],
  ARCHIVED: [],
};

const context = (reason?: string) => ({ actorId: ACTOR, now: NOW, reason });

describe('the transition table', () => {
  it('covers every declared transition', () => {
    expect(Object.keys(LISTING_TRANSITIONS_TABLE).sort()).toEqual([...LISTING_TRANSITIONS].sort());
  });

  it('reaches every status except the two entry points from some transition', () => {
    const reachable = new Set(Object.values(LISTING_TRANSITIONS_TABLE).map((rule) => rule.to));
    // DRAFT is reachable via REVISE; a listing only starts in DRAFT or PENDING_REVIEW.
    expect([...reachable].sort()).toEqual([
      'ARCHIVED',
      'DRAFT',
      'PENDING_REVIEW',
      'PUBLISHED',
      'REJECTED',
    ]);
  });

  it('makes ARCHIVED terminal', () => {
    expect(allowedTransitions('ARCHIVED')).toEqual([]);
  });
});

describe('every status and transition pair', () => {
  for (const from of LISTING_STATUSES) {
    for (const action of LISTING_TRANSITIONS) {
      const legal = LEGAL[from].includes(action);

      it(`${legal ? 'allows' : 'refuses'} ${action} from ${from}`, () => {
        expect(isTransitionLegal(from, action)).toBe(legal);

        if (!legal) {
          expect(() => applyTransition(from, action, context(REASON))).toThrow(
            IllegalListingTransitionError,
          );
          return;
        }
        const change = applyTransition(from, action, context(REASON));
        expect(change.status).toBe(LISTING_TRANSITIONS_TABLE[action].to);
      });
    }
  }
});

describe('the error an illegal transition raises', () => {
  it('reports 409 with the state it was refused from and what would have worked', () => {
    let caught: unknown;
    try {
      applyTransition('PUBLISHED', 'APPROVE', context());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IllegalListingTransitionError);
    const error = caught as IllegalListingTransitionError;
    expect(error.status).toBe(409);
    expect(error.code).toBe('ILLEGAL_LISTING_TRANSITION');
    expect(error.context).toEqual({ from: 'PUBLISHED', action: 'APPROVE', allowed: ['ARCHIVE'] });
    expect(error.message).toContain('PUBLISHED');
  });
});

describe('what each legal transition writes', () => {
  it('SUBMIT stamps the submission and clears any earlier verdict', () => {
    expect(applyTransition('DRAFT', 'SUBMIT', context())).toEqual({
      status: 'PENDING_REVIEW',
      submittedAt: NOW,
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null,
    });
  });

  it('PUBLISH records no reviewer, because nobody reviewed it', () => {
    expect(applyTransition('DRAFT', 'PUBLISH', context())).toEqual({
      status: 'PUBLISHED',
      publishedAt: NOW,
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null,
    });
  });

  it('APPROVE records the moderator and sets the publication date', () => {
    expect(applyTransition('PENDING_REVIEW', 'APPROVE', context())).toEqual({
      status: 'PUBLISHED',
      publishedAt: NOW,
      reviewedAt: NOW,
      reviewedById: ACTOR,
      rejectionReason: null,
    });
  });

  it('REJECT stores the trimmed reason and the moderator', () => {
    expect(applyTransition('PENDING_REVIEW', 'REJECT', context(`  ${REASON}  `))).toEqual({
      status: 'REJECTED',
      reviewedAt: NOW,
      reviewedById: ACTOR,
      rejectionReason: REASON,
    });
  });

  it('REVISE hands the listing back and drops the rejection', () => {
    expect(applyTransition('REJECTED', 'REVISE', context())).toEqual({
      status: 'DRAFT',
      submittedAt: null,
      rejectionReason: null,
    });
  });

  it('ARCHIVE changes nothing but the status, so the review history survives', () => {
    expect(applyTransition('PUBLISHED', 'ARCHIVE', context())).toEqual({ status: 'ARCHIVED' });
  });
});

describe('rejection reasons', () => {
  it.each([undefined, '', '   '])('refuses a rejection with reason %j', (reason) => {
    expect(() => applyTransition('PENDING_REVIEW', 'REJECT', context(reason))).toThrow(
      RejectionReasonRequiredError,
    );
  });

  it('reports a missing reason as 422, not as a state conflict', () => {
    let caught: unknown;
    try {
      applyTransition('PENDING_REVIEW', 'REJECT', context());
    } catch (error) {
      caught = error;
    }
    expect((caught as RejectionReasonRequiredError).status).toBe(422);
    expect((caught as RejectionReasonRequiredError).code).toBe('REJECTION_REASON_REQUIRED');
  });

  it('does not demand a reason from any other transition', () => {
    for (const from of LISTING_STATUSES) {
      for (const action of LEGAL[from].filter((a) => a !== 'REJECT')) {
        expect(() => applyTransition(from, action, context())).not.toThrow();
      }
    }
  });
});

describe('initialStatus', () => {
  it('sends a regular user straight into the review queue', () => {
    expect(initialStatus('USER')).toBe('PENDING_REVIEW');
  });

  it('lets verified agents and staff publish directly', () => {
    expect(initialStatus('AGENT')).toBe('PUBLISHED');
    expect(initialStatus('MODERATOR')).toBe('PUBLISHED');
    expect(initialStatus('ADMIN')).toBe('PUBLISHED');
  });
});
