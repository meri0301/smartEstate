/**
 * The listing moderation state machine.
 *
 * Pure: no database, no request, no authorisation. It answers one question —
 * given a current status and a requested transition, what does the listing
 * become, and which timestamps change. Who is allowed to ask is a separate
 * question, answered by `listing.policy.ts`; keeping the two apart means an
 * illegal transition and an unauthorised one produce different, correct answers
 * (409 versus 403) instead of one vague refusal.
 */
import type { ListingStatus, ListingTransition } from '@smartestate/contracts';
import { DomainError } from '../../common/errors/domain-error.js';

export interface TransitionRule {
  /** Statuses the transition may be applied from. */
  readonly from: readonly ListingStatus[];
  /** Status the listing takes on. */
  readonly to: ListingStatus;
}

/**
 * The whole lifecycle, as data.
 *
 * SUBMIT/APPROVE/REJECT/REVISE form the review loop the brief specifies.
 * PUBLISH is the same edge without the loop: it exists because a verified agent
 * publishes directly, so their draft goes straight to PUBLISHED. ARCHIVE is
 * reachable from every live status, because withdrawing a listing must not
 * depend on where it happens to sit in the review queue; ARCHIVED is terminal.
 */
export const LISTING_TRANSITIONS_TABLE: Readonly<Record<ListingTransition, TransitionRule>> = {
  SUBMIT: { from: ['DRAFT'], to: 'PENDING_REVIEW' },
  PUBLISH: { from: ['DRAFT'], to: 'PUBLISHED' },
  APPROVE: { from: ['PENDING_REVIEW'], to: 'PUBLISHED' },
  REJECT: { from: ['PENDING_REVIEW'], to: 'REJECTED' },
  REVISE: { from: ['REJECTED'], to: 'DRAFT' },
  ARCHIVE: { from: ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED'], to: 'ARCHIVED' },
};

/** A transition that the state machine does not allow from the current status. */
export class IllegalListingTransitionError extends DomainError {
  readonly code = 'ILLEGAL_LISTING_TRANSITION';
  /**
   * 409, not 400: the request is well formed and would be valid against another
   * state of the same resource. The conflict is with the resource, not the body.
   */
  readonly status = 409;
  override readonly context: Readonly<Record<string, unknown>>;

  constructor(
    readonly from: ListingStatus,
    readonly action: ListingTransition,
  ) {
    super(`Cannot ${action} a listing in status ${from}`);
    this.context = { from, action, allowed: allowedTransitions(from) };
  }
}

/** REJECT without an explanation; the owner would have nothing to act on. */
export class RejectionReasonRequiredError extends DomainError {
  readonly code = 'REJECTION_REASON_REQUIRED';
  /** 422: the body parses, but one field is missing for this particular action. */
  readonly status = 422;

  constructor() {
    super('A rejection requires a reason');
  }
}

/** Transitions that are legal from a status, in table order. */
export function allowedTransitions(from: ListingStatus): ListingTransition[] {
  return (Object.keys(LISTING_TRANSITIONS_TABLE) as ListingTransition[]).filter((action) =>
    LISTING_TRANSITIONS_TABLE[action].from.includes(from),
  );
}

export function isTransitionLegal(from: ListingStatus, action: ListingTransition): boolean {
  return LISTING_TRANSITIONS_TABLE[action].from.includes(from);
}

export interface TransitionContext {
  /** Who performed it; recorded as the reviewer for moderation transitions. */
  readonly actorId: string;
  /** Injected rather than read from the clock, so the result is assertable. */
  readonly now: Date;
  readonly reason?: string | undefined;
}

/**
 * Columns the transition changes. A field left `undefined` is not written, which
 * is how ARCHIVE preserves whatever review history the listing already had; an
 * explicit `null` clears the column.
 */
export interface ListingStateChange {
  readonly status: ListingStatus;
  readonly submittedAt?: Date | null;
  readonly publishedAt?: Date;
  readonly reviewedAt?: Date | null;
  readonly reviewedById?: string | null;
  readonly rejectionReason?: string | null;
}

/**
 * Applies a transition, or throws. The returned change is a description, not a
 * write: the caller persists it, which keeps this function testable in isolation.
 */
export function applyTransition(
  from: ListingStatus,
  action: ListingTransition,
  context: TransitionContext,
): ListingStateChange {
  if (!isTransitionLegal(from, action)) {
    throw new IllegalListingTransitionError(from, action);
  }
  const to = LISTING_TRANSITIONS_TABLE[action].to;
  const { actorId, now, reason } = context;

  switch (action) {
    case 'SUBMIT':
      // A resubmission starts a fresh review, so the previous verdict is cleared.
      return {
        status: to,
        submittedAt: now,
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: null,
      };
    case 'PUBLISH':
      // Self-publication by a verified agent: nobody reviewed it, so no reviewer.
      return {
        status: to,
        publishedAt: now,
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: null,
      };
    case 'APPROVE':
      return {
        status: to,
        publishedAt: now,
        reviewedAt: now,
        reviewedById: actorId,
        rejectionReason: null,
      };
    case 'REJECT': {
      const trimmed = reason?.trim();
      if (trimmed === undefined || trimmed.length === 0) {
        throw new RejectionReasonRequiredError();
      }
      return { status: to, reviewedAt: now, reviewedById: actorId, rejectionReason: trimmed };
    }
    case 'REVISE':
      // Back in the owner's hands: the rejection no longer describes the listing.
      return { status: to, submittedAt: null, rejectionReason: null };
    case 'ARCHIVE':
      return { status: to };
  }
}

/**
 * Status a newly created listing starts in.
 *
 * A regular user's listing enters the review queue immediately; a verified agent
 * and the staff roles publish directly. Creation is not a transition — there is
 * no prior status — so it lives here beside the table rather than inside it.
 */
export function initialStatus(role: 'USER' | 'AGENT' | 'MODERATOR' | 'ADMIN'): ListingStatus {
  return role === 'USER' ? 'PENDING_REVIEW' : 'PUBLISHED';
}
