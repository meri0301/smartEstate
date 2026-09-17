import { Injectable } from '@nestjs/common';
import type { CreateReviewRequest, Review } from '@smartestate/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(request: CreateReviewRequest): Promise<Review> {
    const row = await this.prisma.review.create({
      data: {
        authorName: request.authorName,
        authorRole: request.authorRole,
        body: request.body,
        locale: request.locale,
      },
    });
    return toReview(row);
  }

  /** The published reviews, newest first, with the total behind them. */
  async published(limit: number): Promise<{ items: Review[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.review.count({ where: { status: 'PUBLISHED' } }),
    ]);
    return { items: rows.map(toReview), total };
  }

  /** Takes a review off the page. Returns false if there was nothing to hide. */
  async hide(id: string, moderatorId: string): Promise<boolean> {
    const { count } = await this.prisma.review.updateMany({
      where: { id, status: 'PUBLISHED' },
      data: { status: 'HIDDEN', hiddenAt: new Date(), hiddenById: moderatorId },
    });
    return count > 0;
  }
}

interface ReviewRow {
  id: string;
  authorName: string;
  authorRole: Review['authorRole'];
  body: string;
  locale: Review['locale'];
  createdAt: Date;
}

/**
 * The published shape.
 *
 * `status`, `hiddenAt` and `hiddenById` are deliberately dropped: they are
 * moderation state, and a public endpoint that returned them would say who took
 * something down.
 */
function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    authorName: row.authorName,
    authorRole: row.authorRole,
    body: row.body,
    locale: row.locale,
    createdAt: row.createdAt.toISOString(),
  };
}
