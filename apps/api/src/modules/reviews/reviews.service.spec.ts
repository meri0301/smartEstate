import { NotFoundException } from '@nestjs/common';
import type { CreateReviewRequest, Review } from '@smartestate/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import type { AuditService } from '../admin/audit.service.js';
import { ReviewsService } from './reviews.service.js';
import type { ReviewsRepository } from './reviews.repository.js';
import type { StatsRepository } from './stats.repository.js';

const request: CreateReviewRequest = {
  authorName: 'Anahit S.',
  authorRole: 'HOMEBUYER',
  body: 'The evidence count told me the estimate was thin for my district.',
  locale: 'en',
};

const created: Review = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e01',
  ...request,
  createdAt: '2026-09-17T09:00:00.000Z',
};

const moderator: AuthenticatedUser = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e99',
  email: 'moderator@smartestate.test',
  role: 'MODERATOR',
  locale: 'en',
};

function build(overrides: { hide?: boolean } = {}) {
  const reviews = {
    create: vi.fn().mockResolvedValue(created),
    published: vi.fn().mockResolvedValue({ items: [created], total: 1 }),
    hide: vi.fn().mockResolvedValue(overrides.hide ?? true),
  };
  const stats = {
    counts: vi.fn().mockResolvedValue({ valuationsCompleted: 12, listingsPublished: 340 }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new ReviewsService(
    reviews as unknown as ReviewsRepository,
    stats as unknown as StatsRepository,
    audit as unknown as AuditService,
  );
  return { service, reviews, audit };
}

describe('ReviewsService', () => {
  let harness: ReturnType<typeof build>;

  beforeEach(() => {
    harness = build();
  });

  it('records every submission, because this write needs no account', async () => {
    // It is the one write on the system anybody on the internet can reach. If
    // the form is abused, the log is what makes the pattern visible.
    await harness.service.create(request, '203.0.113.7');

    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        action: 'review.create',
        entityId: created.id,
        ipAddress: '203.0.113.7',
      }),
    );
  });

  it('does not log what was written, only that something was', async () => {
    // The review is already public; copying its text into the audit log would
    // duplicate personal data into a table nobody moderates.
    await harness.service.create(request, null);

    const entry = harness.audit.record.mock.calls[0]?.[0] as { metadata?: Record<string, unknown> };
    expect(JSON.stringify(entry.metadata)).not.toContain('evidence count');
  });

  it('names the moderator who took a review down', async () => {
    await harness.service.hide(created.id, moderator);

    expect(harness.reviews.hide).toHaveBeenCalledWith(created.id, moderator.id);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: moderator.id, action: 'review.hide' }),
    );
  });

  it('refuses to log a hide that did not happen', async () => {
    const already = build({ hide: false });

    await expect(already.service.hide(created.id, moderator)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(already.audit.record).not.toHaveBeenCalled();
  });
});
