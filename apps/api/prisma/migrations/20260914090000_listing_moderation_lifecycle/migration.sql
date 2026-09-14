-- Listing moderation lifecycle.
--
-- The previous enum mixed review states with market states. The review states
-- are what the platform can enforce, so the enum now describes moderation only:
-- DRAFT -> PENDING_REVIEW -> PUBLISHED -> ARCHIVED, with PENDING_REVIEW ->
-- REJECTED -> DRAFT for the correction loop.
--
-- PostgreSQL cannot remove a value from an enum type, so the type is rebuilt and
-- the column rewritten with an explicit mapping:
--   ACTIVE, RESERVED  -> PUBLISHED   (both were visible to buyers)
--   SOLD, WITHDRAWN   -> ARCHIVED    (both were off the market)
-- RESERVED and SOLD had no transition rules behind them and are not represented
-- in the new enum; a future "deal state" would be a separate column.

ALTER TYPE "ListingStatus" RENAME TO "ListingStatus_old";

CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

ALTER TABLE "listings" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "listings"
  ALTER COLUMN "status" TYPE "ListingStatus"
  USING (
    CASE "status"::text
      WHEN 'ACTIVE' THEN 'PUBLISHED'
      WHEN 'RESERVED' THEN 'PUBLISHED'
      WHEN 'SOLD' THEN 'ARCHIVED'
      WHEN 'WITHDRAWN' THEN 'ARCHIVED'
      ELSE 'DRAFT'
    END
  )::"ListingStatus";

ALTER TABLE "listings" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "ListingStatus_old";

-- Moderation bookkeeping. All nullable: a listing that was never submitted or
-- reviewed has nothing to record.
ALTER TABLE "listings"
  ADD COLUMN "submitted_at" TIMESTAMPTZ(3),
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(3),
  ADD COLUMN "reviewed_by_id" UUID,
  ADD COLUMN "rejection_reason" TEXT;

ALTER TABLE "listings"
  ADD CONSTRAINT "listings_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Moderation queue: oldest pending submissions first.
CREATE INDEX "listings_status_submitted_at_idx" ON "listings"("status", "submitted_at");

-- "My listings" for one owner, newest first, in any status.
CREATE INDEX "listings_created_by_id_created_at_idx" ON "listings"("created_by_id", "created_at" DESC);
