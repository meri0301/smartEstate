/**
 * Reading the rules and the place, which are the only two things the calculator
 * cannot work out for itself.
 *
 * The rule sets are cached: they change when the law does, which is a handful of
 * times a decade, and reading them on every keystroke of a calculator form would
 * be a query per keystroke for data that is older than the session.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { parseRules, type RuleSet } from './refund-rules.js';
import type { PropertyLocation } from './refund-calculator.js';

/** Long enough that a form is one read, short enough that a correction lands the same day. */
const RULES_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class MortgageRepository {
  private readonly logger = new Logger(MortgageRepository.name);
  private cached: { value: RuleSet[]; expiresAt: number } | undefined;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every rule set, newest first.
   *
   * Newest first so that `find` picks the most recent set whose range contains a
   * date, which matters only if two ranges ever overlap — and if they do, the
   * newer one is the better guess and the older one is a data error somebody
   * should see in the logs rather than a silent coin toss.
   */
  async ruleSets(): Promise<RuleSet[]> {
    const now = Date.now();
    if (this.cached !== undefined && this.cached.expiresAt > now) {
      return this.cached.value;
    }
    const rows = await this.prisma.taxRefundRuleSet.findMany({
      orderBy: { effectiveFrom: 'desc' },
    });
    const value = rows.map((row) => ({
      version: row.version,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      description: row.description,
      // Throws on a row that does not parse. A rule set that cannot be trusted
      // must not be quietly replaced by a default: that would be inventing tax
      // law, which is worse than refusing to answer.
      rules: parseRules(row.version, row.rules),
    }));
    this.cached = { value, expiresAt: now + RULES_TTL_MS };
    this.logger.log(`loaded ${String(value.length)} tax refund rule sets`);
    return value;
  }

  /** Where a district is, for the phase-out. */
  async location(districtSlug: string): Promise<PropertyLocation | undefined> {
    const district = await this.prisma.district.findUnique({
      where: { slug: districtSlug },
      select: { slug: true, marzCode: true, isBorderSettlement: true },
    });
    if (district === null) {
      return undefined;
    }
    return {
      districtSlug: district.slug,
      marz: district.marzCode,
      isBorderSettlement: district.isBorderSettlement,
    };
  }
}
