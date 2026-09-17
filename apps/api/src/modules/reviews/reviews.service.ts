/**
 * Reviews of the product.
 *
 * Two rules, both consequences of the same product decision — that anyone may
 * write a review and it appears at once.
 *
 * **A name is not an identity.** Nothing joins a review to an account, so the
 * service never treats `authorName` as more than text somebody typed. It is
 * trimmed and length-bounded by the contract and otherwise passed through
 * unchanged: the interface renders it as text, never as markup.
 *
 * **Publishing at once needs a way back.** A public endpoint that publishes
 * immediately will eventually receive something that has to go, so a moderator
 * can hide a review, and the act is written to the audit log with who did it.
 * Hiding rather than deleting means the record of what was removed survives.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateReviewRequest, ProductStats, Review, ReviewList } from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { AuditService } from '../admin/audit.service.js';
import { ReviewsRepository } from './reviews.repository.js';
import { StatsRepository } from './stats.repository.js';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviews: ReviewsRepository,
    private readonly stats: StatsRepository,
    private readonly audit: AuditService,
  ) {}

  async create(request: CreateReviewRequest, ipAddress: string | null): Promise<Review> {
    const review = await this.reviews.create(request);
    // Recorded because it is the one write on this service reachable without an
    // account: if the form is abused, the log is what makes the pattern visible.
    await this.audit.record({
      actorId: null,
      action: 'review.create',
      entityType: 'Review',
      entityId: review.id,
      metadata: { authorRole: review.authorRole, locale: review.locale },
      ipAddress,
    });
    return review;
  }

  list(limit: number): Promise<ReviewList> {
    return this.reviews.published(limit);
  }

  async hide(id: string, moderator: AuthenticatedUser): Promise<void> {
    const hidden = await this.reviews.hide(id, moderator.id);
    if (!hidden) {
      throw new NotFoundException({ message: 'Review not found', code: 'NOT_FOUND' });
    }
    await this.audit.record({
      actorId: moderator.id,
      action: 'review.hide',
      entityType: 'Review',
      entityId: id,
    });
  }

  productStats(): Promise<ProductStats> {
    return this.stats.counts();
  }
}
