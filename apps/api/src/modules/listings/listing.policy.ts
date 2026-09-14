/**
 * Authorisation for listings: attribute-based rules layered on top of the
 * role-based guard.
 *
 * `RolesGuard` answers "may this kind of user reach this endpoint at all"
 * from the JWT alone, before the handler runs. It cannot answer "may this user
 * touch *this* listing", because that depends on the row: who owns it and what
 * status it is in. That second question is answered here, in one place, so no
 * controller has to write `listing.ownerId === user.id` and no two of them can
 * get it subtly differently. See ADR-0009.
 *
 * Everything in this module is pure, including the quota limits: counting a
 * user's live listings needs the database, so the policy publishes the limit and
 * the service enforces it. That keeps the whole rule set unit-testable.
 */
import type { ListingStatus, Role } from '@smartestate/contracts';
import { DomainError } from '../../common/errors/domain-error.js';

/** Everything a caller can attempt on a listing. Transitions use their own names. */
export const LISTING_ACTIONS = [
  'view',
  'create',
  'update',
  'submit',
  'publish',
  'approve',
  'reject',
  'revise',
  'archive',
  'delete',
] as const;
export type ListingAction = (typeof LISTING_ACTIONS)[number];

/** The attributes of the listing the decision depends on. */
export interface ListingSubject {
  readonly status: ListingStatus;
  readonly ownerId: string | null;
}

/** The attributes of the caller the decision depends on. */
export interface ListingActor {
  readonly id: string;
  readonly role: Role;
}

export type DenialReason =
  'AUTHENTICATION_REQUIRED' | 'NOT_OWNER' | 'INSUFFICIENT_ROLE' | 'LISTING_ARCHIVED';

export type PolicyDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: DenialReason };

const ALLOW: PolicyDecision = { allowed: true };
const deny = (reason: DenialReason): PolicyDecision => ({ allowed: false, reason });

/** Staff roles: they act on listings they do not own. */
const MODERATION_ROLES: ReadonlySet<Role> = new Set<Role>(['MODERATOR', 'ADMIN']);

/**
 * How many listings a role may hold in a live status at once.
 *
 * Live means PENDING_REVIEW or PUBLISHED: a draft costs a moderator nothing, and
 * an archived listing is gone. `null` is unlimited.
 */
export function activeListingQuota(role: Role): number | null {
  switch (role) {
    case 'USER':
      return 3;
    case 'AGENT':
      return 50;
    case 'MODERATOR':
    case 'ADMIN':
      return null;
  }
}

/** The statuses that count towards the quota. */
export const QUOTA_STATUSES: readonly ListingStatus[] = ['PENDING_REVIEW', 'PUBLISHED'];

/** Statuses any visitor may see. Everything else is owner-or-staff only. */
const PUBLIC_STATUSES: ReadonlySet<ListingStatus> = new Set<ListingStatus>(['PUBLISHED']);

/** Raised when the policy refuses; the filter renders it as 403. */
export class ListingAccessDeniedError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly status = 403;
  override readonly context: Readonly<Record<string, unknown>>;

  constructor(
    readonly action: ListingAction,
    readonly reason: DenialReason,
  ) {
    super(MESSAGES[reason]);
    this.context = { action, reason };
  }
}

const MESSAGES: Readonly<Record<DenialReason, string>> = {
  AUTHENTICATION_REQUIRED: 'Authentication required',
  NOT_OWNER: 'You may only act on your own listings',
  INSUFFICIENT_ROLE: 'Your role does not permit this action',
  LISTING_ARCHIVED: 'An archived listing can no longer be changed',
};

/** Raised when a role's live-listing allowance is already used up. */
export class ListingQuotaExceededError extends DomainError {
  readonly code = 'LISTING_QUOTA_EXCEEDED';
  /** 409: nothing is wrong with the request, it conflicts with the account's current state. */
  readonly status = 409;
  override readonly context: Readonly<Record<string, unknown>>;

  constructor(
    readonly limit: number,
    readonly current: number,
  ) {
    super(
      `You may hold ${String(limit)} live listings at a time; you already have ${String(current)}`,
    );
    this.context = { limit, current, statuses: QUOTA_STATUSES };
  }
}

/**
 * The single authorisation decision for listings.
 *
 * `actor` is `undefined` for an anonymous caller, which only `view` tolerates.
 */
export function can(
  actor: ListingActor | undefined,
  action: ListingAction,
  listing: ListingSubject,
): PolicyDecision {
  if (action === 'view' && PUBLIC_STATUSES.has(listing.status)) {
    return ALLOW;
  }
  if (actor === undefined) {
    return deny('AUTHENTICATION_REQUIRED');
  }

  const isOwner = listing.ownerId !== null && listing.ownerId === actor.id;
  const isStaff = MODERATION_ROLES.has(actor.role);
  const isAdmin = actor.role === 'ADMIN';

  switch (action) {
    case 'view':
      // A listing that is not published is visible to its owner and to staff.
      return isOwner || isStaff ? ALLOW : deny('NOT_OWNER');

    case 'create':
      // Every authenticated role may create; what it becomes depends on the role.
      return ALLOW;

    case 'update':
      // Content belongs to its owner. Moderators judge listings, they do not
      // rewrite them; an administrator may correct anything.
      if (listing.status === 'ARCHIVED') {
        return deny('LISTING_ARCHIVED');
      }
      if (isAdmin) {
        return ALLOW;
      }
      return isOwner ? ALLOW : deny('NOT_OWNER');

    case 'submit':
    case 'revise':
      // Steps the owner takes on their own listing.
      if (isAdmin) {
        return ALLOW;
      }
      return isOwner ? ALLOW : deny('NOT_OWNER');

    case 'publish':
      // Skipping review is a property of a verified account, not of ownership
      // alone, so a plain user is refused here and must submit instead.
      if (isAdmin) {
        return ALLOW;
      }
      if (actor.role !== 'AGENT') {
        return deny('INSUFFICIENT_ROLE');
      }
      return isOwner ? ALLOW : deny('NOT_OWNER');

    case 'approve':
    case 'reject':
      // Moderation is a staff action on any pending listing, including, as the
      // brief specifies, one the moderator happens to own.
      return isStaff ? ALLOW : deny('INSUFFICIENT_ROLE');

    case 'archive':
      // Owners withdraw their own; staff may withdraw anyone's.
      return isOwner || isStaff ? ALLOW : deny('NOT_OWNER');

    case 'delete':
      // Hard deletion destroys history, so it is reserved for administrators.
      return isAdmin ? ALLOW : deny('INSUFFICIENT_ROLE');
  }
}

/** `can`, as an assertion. Throws the 403 domain error rather than returning a decision. */
export function assertCan(
  actor: ListingActor | undefined,
  action: ListingAction,
  listing: ListingSubject,
): void {
  const decision = can(actor, action, listing);
  if (!decision.allowed) {
    throw new ListingAccessDeniedError(action, decision.reason);
  }
}

/** Every action the actor may take on the listing; useful for rendering a UI. */
export function permittedActions(
  actor: ListingActor | undefined,
  listing: ListingSubject,
): ListingAction[] {
  return LISTING_ACTIONS.filter((action) => can(actor, action, listing).allowed);
}
