-- Reviews of the product, written from the landing page.
--
-- Unauthenticated and published on submission, by product decision: the
-- landing page's review form asks for a name rather than an account, and a
-- review appears as soon as it is written. Two consequences are built into the
-- shape below rather than left to the application.
--
-- `author_name` is a name somebody typed. Nothing joins it to a user, and
-- nothing in the system has checked it, so it must never be presented as a
-- verified identity. That is why there is no `user_id` column to be tempted by.
--
-- `status` exists to take a review down, not to let one up. A public endpoint
-- that publishes immediately will eventually receive something that has to go,
-- and the alternative to this column is a DELETE that leaves no trace of what
-- was removed or by whom.
--
-- `author_role` is an enum rather than free text because the label sits beside
-- a name on the front page, has to exist in three languages, and an open field
-- is an invitation to claim a title nobody verified.
--
-- `locale` is stored because a review is prose. It cannot be machine
-- translated into the other two languages without putting words in the
-- author's mouth, so the language it was written in is recorded and the
-- interface marks it instead.

CREATE TYPE "ReviewerRole" AS ENUM (
  'HOMEBUYER',
  'INVESTOR',
  'PROPERTY_MANAGER',
  'AGENT',
  'OTHER'
);

CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

CREATE TABLE "reviews" (
  "id"           UUID           NOT NULL,
  "author_name"  VARCHAR(80)    NOT NULL,
  "author_role"  "ReviewerRole" NOT NULL,
  "body"         VARCHAR(600)   NOT NULL,
  "locale"       "Locale"       NOT NULL,
  "status"       "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
  "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hidden_at"    TIMESTAMPTZ(3),
  "hidden_by_id" UUID,

  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_hidden_by_id_fkey"
  FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The landing page's only read: published reviews, newest first.
CREATE INDEX "reviews_status_created_at_idx" ON "reviews" ("status", "created_at" DESC);
