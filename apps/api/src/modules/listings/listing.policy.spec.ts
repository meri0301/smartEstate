import { LISTING_STATUSES, type Role } from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import {
  activeListingQuota,
  assertCan,
  can,
  LISTING_ACTIONS,
  ListingAccessDeniedError,
  ListingQuotaExceededError,
  permittedActions,
  QUOTA_STATUSES,
  type ListingAction,
  type ListingActor,
  type ListingSubject,
} from './listing.policy.js';

const OWNER_ID = '00000000-0000-7000-8000-00000000000a';
const OTHER_ID = '00000000-0000-7000-8000-00000000000b';

const actor = (role: Role, id = OWNER_ID): ListingActor => ({ id, role });
const listing = (
  status: ListingSubject['status'],
  ownerId: string | null = OWNER_ID,
): ListingSubject => ({ status, ownerId });

const allowed = (
  who: ListingActor | undefined,
  action: ListingAction,
  subject: ListingSubject,
): boolean => can(who, action, subject).allowed;

describe('viewing', () => {
  it('shows a published listing to anyone, signed in or not', () => {
    expect(allowed(undefined, 'view', listing('PUBLISHED'))).toBe(true);
    expect(allowed(actor('USER', OTHER_ID), 'view', listing('PUBLISHED'))).toBe(true);
  });

  it('hides every other status from anonymous callers', () => {
    for (const status of LISTING_STATUSES.filter((s) => s !== 'PUBLISHED')) {
      expect(can(undefined, 'view', listing(status))).toEqual({
        allowed: false,
        reason: 'AUTHENTICATION_REQUIRED',
      });
    }
  });

  it('shows an unpublished listing to its owner and to staff, but not to a stranger', () => {
    for (const status of LISTING_STATUSES.filter((s) => s !== 'PUBLISHED')) {
      expect(allowed(actor('USER'), 'view', listing(status))).toBe(true);
      expect(allowed(actor('MODERATOR', OTHER_ID), 'view', listing(status))).toBe(true);
      expect(allowed(actor('ADMIN', OTHER_ID), 'view', listing(status))).toBe(true);
      expect(allowed(actor('AGENT', OTHER_ID), 'view', listing(status))).toBe(false);
    }
  });
});

describe('editing', () => {
  it('belongs to the owner, whatever their role', () => {
    for (const role of ['USER', 'AGENT'] as const) {
      expect(allowed(actor(role), 'update', listing('DRAFT'))).toBe(true);
      expect(allowed(actor(role, OTHER_ID), 'update', listing('DRAFT'))).toBe(false);
    }
  });

  it('is not something a moderator may do to a listing they do not own', () => {
    // Moderators judge listings; rewriting the content is not part of that.
    expect(can(actor('MODERATOR', OTHER_ID), 'update', listing('PENDING_REVIEW'))).toEqual({
      allowed: false,
      reason: 'NOT_OWNER',
    });
    expect(allowed(actor('ADMIN', OTHER_ID), 'update', listing('PENDING_REVIEW'))).toBe(true);
  });

  it('stops once the listing is archived, even for an administrator', () => {
    expect(can(actor('ADMIN', OTHER_ID), 'update', listing('ARCHIVED'))).toEqual({
      allowed: false,
      reason: 'LISTING_ARCHIVED',
    });
    expect(allowed(actor('USER'), 'update', listing('ARCHIVED'))).toBe(false);
  });
});

describe('the review loop', () => {
  it('lets only the owner submit and revise', () => {
    for (const action of ['submit', 'revise'] as const) {
      expect(allowed(actor('USER'), action, listing('DRAFT'))).toBe(true);
      expect(allowed(actor('MODERATOR', OTHER_ID), action, listing('DRAFT'))).toBe(false);
      expect(allowed(actor('ADMIN', OTHER_ID), action, listing('DRAFT'))).toBe(true);
    }
  });

  it('reserves direct publication for verified agents', () => {
    expect(allowed(actor('AGENT'), 'publish', listing('DRAFT'))).toBe(true);
    expect(can(actor('USER'), 'publish', listing('DRAFT'))).toEqual({
      allowed: false,
      reason: 'INSUFFICIENT_ROLE',
    });
    // An agent may publish their own work, not a listing belonging to someone else.
    expect(can(actor('AGENT', OTHER_ID), 'publish', listing('DRAFT'))).toEqual({
      allowed: false,
      reason: 'NOT_OWNER',
    });
  });

  it('reserves approval and rejection for staff, including on their own listings', () => {
    for (const action of ['approve', 'reject'] as const) {
      expect(allowed(actor('MODERATOR', OTHER_ID), action, listing('PENDING_REVIEW'))).toBe(true);
      expect(allowed(actor('MODERATOR'), action, listing('PENDING_REVIEW'))).toBe(true);
      expect(allowed(actor('ADMIN', OTHER_ID), action, listing('PENDING_REVIEW'))).toBe(true);
      expect(allowed(actor('AGENT'), action, listing('PENDING_REVIEW'))).toBe(false);
      expect(allowed(actor('USER'), action, listing('PENDING_REVIEW'))).toBe(false);
    }
  });
});

describe('archiving and deleting', () => {
  it('lets an owner archive their own listing and staff archive any listing', () => {
    expect(allowed(actor('USER'), 'archive', listing('PUBLISHED'))).toBe(true);
    expect(allowed(actor('USER', OTHER_ID), 'archive', listing('PUBLISHED'))).toBe(false);
    expect(allowed(actor('MODERATOR', OTHER_ID), 'archive', listing('PUBLISHED'))).toBe(true);
  });

  it('reserves hard deletion for administrators', () => {
    expect(allowed(actor('ADMIN', OTHER_ID), 'delete', listing('ARCHIVED'))).toBe(true);
    expect(can(actor('MODERATOR', OTHER_ID), 'delete', listing('ARCHIVED'))).toEqual({
      allowed: false,
      reason: 'INSUFFICIENT_ROLE',
    });
    expect(allowed(actor('USER'), 'delete', listing('DRAFT'))).toBe(false);
  });
});

describe('anonymous callers', () => {
  it('may do nothing but view a published listing', () => {
    for (const action of LISTING_ACTIONS) {
      expect(allowed(undefined, action, listing('PUBLISHED'))).toBe(action === 'view');
    }
  });
});

describe('quotas', () => {
  it('gives a regular user three live listings and an agent fifty', () => {
    expect(activeListingQuota('USER')).toBe(3);
    expect(activeListingQuota('AGENT')).toBe(50);
  });

  it('does not limit staff', () => {
    expect(activeListingQuota('MODERATOR')).toBeNull();
    expect(activeListingQuota('ADMIN')).toBeNull();
  });

  it('counts listings awaiting review as well as published ones', () => {
    expect([...QUOTA_STATUSES].sort()).toEqual(['PENDING_REVIEW', 'PUBLISHED']);
  });

  it('reports the limit and the current count when it is exceeded', () => {
    const error = new ListingQuotaExceededError(3, 3);
    expect(error.status).toBe(409);
    expect(error.code).toBe('LISTING_QUOTA_EXCEEDED');
    expect(error.context).toMatchObject({ limit: 3, current: 3 });
  });
});

describe('assertCan', () => {
  it('passes silently when the decision allows it', () => {
    expect(() => {
      assertCan(actor('USER'), 'view', listing('DRAFT'));
    }).not.toThrow();
  });

  it('throws a 403 carrying the action and the reason', () => {
    let caught: unknown;
    try {
      assertCan(actor('USER', OTHER_ID), 'archive', listing('PUBLISHED'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ListingAccessDeniedError);
    const error = caught as ListingAccessDeniedError;
    expect(error.status).toBe(403);
    expect(error.context).toEqual({ action: 'archive', reason: 'NOT_OWNER' });
  });
});

describe('permittedActions', () => {
  it('describes what a visitor may do with a published listing', () => {
    expect(permittedActions(undefined, listing('PUBLISHED'))).toEqual(['view']);
  });

  it('describes the options an owner has while a listing waits for review', () => {
    expect(permittedActions(actor('USER'), listing('PENDING_REVIEW'))).toEqual([
      'view',
      'create',
      'update',
      'submit',
      'revise',
      'archive',
    ]);
  });
});
