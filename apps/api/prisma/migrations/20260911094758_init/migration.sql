-- Extensions must be created inside the migration (not only by the Docker init
-- script) so that Prisma's shadow database and any fresh database get them too.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'AGENT', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('hy', 'ru', 'en');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RESERVED', 'SOLD', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BuildingType" AS ENUM ('STONE', 'PANEL', 'MONOLITH', 'KHRUSHCHYOVKA', 'STALINKA', 'NEW_BUILD');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('NEEDS_REPAIR', 'OLD_RENOVATION', 'GOOD', 'EURO_RENOVATION', 'DESIGNER');

-- CreateEnum
CREATE TYPE "HeatingType" AS ENUM ('CENTRAL_GAS', 'INDIVIDUAL_GAS_BOILER', 'ELECTRIC', 'NONE');

-- CreateEnum
CREATE TYPE "OwnershipDocsStatus" AS ENUM ('VERIFIED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('AMD', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "DistrictKind" AS ENUM ('CITY_DISTRICT', 'TOWN');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'FLOOR_PLAN', 'VIDEO');

-- CreateEnum
CREATE TYPE "PoiCategory" AS ENUM ('METRO', 'SCHOOL', 'KINDERGARTEN', 'PARK', 'HOSPITAL', 'SUPERMARKET');

-- CreateEnum
CREATE TYPE "TranslationSource" AS ENUM ('HUMAN', 'MACHINE');

-- CreateEnum
CREATE TYPE "ValuationVerdict" AS ENUM ('UNDERPRICED', 'FAIR', 'OVERPRICED');

-- CreateEnum
CREATE TYPE "RankingStrategy" AS ENUM ('MCDA', 'LEARNED_BASELINE');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('VIEW', 'DWELL', 'FAVORITE', 'UNFAVORITE', 'COMPARE', 'DISMISS', 'CONTACT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "locale" "Locale" NOT NULL DEFAULT 'hy',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "phone" TEXT,
    "budget_min_amd" BIGINT,
    "budget_max_amd" BIGINT,
    "preferred_rooms" INTEGER[],
    "commute_anchor" geometry(Point, 4326),
    "commute_anchor_label" TEXT,
    "priorities" JSONB NOT NULL DEFAULT '{}',
    "onboarding_completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by" UUID,
    "user_agent" TEXT,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "DistrictKind" NOT NULL,
    "name_hy" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "marz" TEXT NOT NULL,
    "osm_type" TEXT,
    "osm_id" BIGINT,
    "boundary" geometry(MultiPolygon, 4326) NOT NULL,
    "centroid" geometry(Point, 4326) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_of_interest" (
    "id" UUID NOT NULL,
    "category" "PoiCategory" NOT NULL,
    "name_hy" TEXT,
    "name_ru" TEXT,
    "name_en" TEXT,
    "osm_type" TEXT,
    "osm_id" BIGINT,
    "district_id" UUID,
    "location" geometry(Point, 4326) NOT NULL,

    CONSTRAINT "points_of_interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "street_aliases" (
    "id" UUID NOT NULL,
    "canonical" TEXT NOT NULL,
    "alias" CITEXT NOT NULL,
    "locale" "Locale",

    CONSTRAINT "street_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "address_line" TEXT NOT NULL,
    "street_hy" TEXT NOT NULL,
    "street_ru" TEXT NOT NULL,
    "street_en" TEXT NOT NULL,
    "house_number" TEXT NOT NULL,
    "building_type" "BuildingType" NOT NULL,
    "construction_year" INTEGER NOT NULL,
    "total_floors" INTEGER NOT NULL,
    "has_elevator" BOOLEAN NOT NULL,
    "seismic_retrofit" BOOLEAN NOT NULL DEFAULT false,
    "location" geometry(Point, 4326) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "building_id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "created_by_id" UUID,
    "source" TEXT NOT NULL,
    "source_ref" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "price_amd" BIGINT NOT NULL,
    "price_negotiable" BOOLEAN NOT NULL DEFAULT false,
    "original_currency" "Currency" NOT NULL DEFAULT 'AMD',
    "original_price" DECIMAL(14,2),
    "price_per_sqm_amd" INTEGER NOT NULL,
    "total_area" DECIMAL(7,2) NOT NULL,
    "living_area" DECIMAL(7,2),
    "kitchen_area" DECIMAL(6,2),
    "rooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL DEFAULT 1,
    "ceiling_height" DECIMAL(3,2),
    "floor" INTEGER NOT NULL,
    "balcony_count" INTEGER NOT NULL DEFAULT 0,
    "has_loggia" BOOLEAN NOT NULL DEFAULT false,
    "has_parking" BOOLEAN NOT NULL DEFAULT false,
    "has_storage" BOOLEAN NOT NULL DEFAULT false,
    "condition" "Condition" NOT NULL,
    "heating" "HeatingType" NOT NULL,
    "ownership_docs" "OwnershipDocsStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "location" geometry(Point, 4326) NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_translations" (
    "listing_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" "TranslationSource" NOT NULL DEFAULT 'HUMAN',
    "is_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listing_translations_pkey" PRIMARY KEY ("listing_id","locale")
);

-- CreateTable
CREATE TABLE "listing_embeddings" (
    "listing_id" UUID NOT NULL,
    "model_version" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_embeddings_pkey" PRIMARY KEY ("listing_id")
);

-- CreateTable
CREATE TABLE "listing_price_history" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "price_amd" BIGINT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'PHOTO',
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "perceptual_hash" TEXT,
    "is_placeholder" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "currency" "Currency" NOT NULL,
    "rate_to_amd" DECIMAL(12,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CBA',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "district_market_snapshots" (
    "id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "median_price_per_sqm_amd" INTEGER NOT NULL,
    "mean_price_per_sqm_amd" INTEGER NOT NULL,
    "median_rent_per_sqm_amd" INTEGER,
    "listing_count" INTEGER NOT NULL,

    CONSTRAINT "district_market_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_refund_rule_sets" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "description" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_refund_rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valuation_records" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "model_version" TEXT NOT NULL,
    "fair_price_amd" BIGINT NOT NULL,
    "lower_bound_amd" BIGINT NOT NULL,
    "upper_bound_amd" BIGINT NOT NULL,
    "deviation_pct" DECIMAL(6,2) NOT NULL,
    "verdict" "ValuationVerdict" NOT NULL,
    "top_factors" JSONB NOT NULL,
    "exchange_rate_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_id" TEXT,
    "strategy" "RankingStrategy" NOT NULL,
    "experiment_key" TEXT,
    "preferences" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "llm_trace" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_interactions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_id" TEXT,
    "listing_id" UUID NOT NULL,
    "type" "InteractionType" NOT NULL,
    "value" INTEGER,
    "session_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","listing_id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparisons" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparison_items" (
    "comparison_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "comparison_items_pkey" PRIMARY KEY ("comparison_id","listing_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "districts_slug_key" ON "districts"("slug");

-- CreateIndex
CREATE INDEX "districts_boundary_idx" ON "districts" USING GIST ("boundary");

-- CreateIndex
CREATE INDEX "districts_centroid_idx" ON "districts" USING GIST ("centroid");

-- CreateIndex
CREATE INDEX "points_of_interest_location_idx" ON "points_of_interest" USING GIST ("location");

-- CreateIndex
CREATE INDEX "points_of_interest_category_idx" ON "points_of_interest"("category");

-- CreateIndex
CREATE UNIQUE INDEX "points_of_interest_osm_type_osm_id_key" ON "points_of_interest"("osm_type", "osm_id");

-- CreateIndex
CREATE UNIQUE INDEX "street_aliases_alias_key" ON "street_aliases"("alias");

-- CreateIndex
CREATE INDEX "street_aliases_canonical_idx" ON "street_aliases"("canonical");

-- CreateIndex
CREATE INDEX "buildings_location_idx" ON "buildings" USING GIST ("location");

-- CreateIndex
CREATE INDEX "buildings_building_type_construction_year_idx" ON "buildings"("building_type", "construction_year");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_district_id_address_line_key" ON "buildings"("district_id", "address_line");

-- CreateIndex
CREATE UNIQUE INDEX "listings_public_id_key" ON "listings"("public_id");

-- CreateIndex
CREATE INDEX "listings_location_idx" ON "listings" USING GIST ("location");

-- CreateIndex
CREATE INDEX "listings_district_id_price_amd_rooms_idx" ON "listings"("district_id", "price_amd", "rooms");

-- CreateIndex
CREATE INDEX "listings_status_published_at_idx" ON "listings"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "listings_price_per_sqm_amd_idx" ON "listings"("price_per_sqm_amd");

-- CreateIndex
CREATE INDEX "listings_building_id_idx" ON "listings"("building_id");

-- CreateIndex
CREATE UNIQUE INDEX "listings_source_source_ref_key" ON "listings"("source", "source_ref");

-- CreateIndex
CREATE INDEX "listing_embeddings_model_version_idx" ON "listing_embeddings"("model_version");

-- CreateIndex
CREATE INDEX "listing_price_history_listing_id_recorded_at_idx" ON "listing_price_history"("listing_id", "recorded_at");

-- CreateIndex
CREATE INDEX "media_listing_id_sort_order_idx" ON "media"("listing_id", "sort_order");

-- CreateIndex
CREATE INDEX "media_perceptual_hash_idx" ON "media"("perceptual_hash");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_date_currency_key" ON "exchange_rates"("date", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "district_market_snapshots_district_id_period_start_key" ON "district_market_snapshots"("district_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "tax_refund_rule_sets_version_key" ON "tax_refund_rule_sets"("version");

-- CreateIndex
CREATE INDEX "valuation_records_listing_id_created_at_idx" ON "valuation_records"("listing_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "valuation_records_model_version_idx" ON "valuation_records"("model_version");

-- CreateIndex
CREATE INDEX "recommendation_sessions_user_id_created_at_idx" ON "recommendation_sessions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "recommendation_sessions_experiment_key_strategy_idx" ON "recommendation_sessions"("experiment_key", "strategy");

-- CreateIndex
CREATE INDEX "user_interactions_user_id_created_at_idx" ON "user_interactions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_interactions_listing_id_type_idx" ON "user_interactions"("listing_id", "type");

-- CreateIndex
CREATE INDEX "favorites_listing_id_idx" ON "favorites"("listing_id");

-- CreateIndex
CREATE INDEX "saved_searches_user_id_idx" ON "saved_searches"("user_id");

-- CreateIndex
CREATE INDEX "saved_searches_alerts_enabled_last_notified_at_idx" ON "saved_searches"("alerts_enabled", "last_notified_at");

-- CreateIndex
CREATE INDEX "comparisons_user_id_idx" ON "comparisons"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "comparison_items_comparison_id_position_key" ON "comparison_items"("comparison_id", "position");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_of_interest" ADD CONSTRAINT "points_of_interest_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_translations" ADD CONSTRAINT "listing_translations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_embeddings" ADD CONSTRAINT "listing_embeddings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_price_history" ADD CONSTRAINT "listing_price_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "district_market_snapshots" ADD CONSTRAINT "district_market_snapshots_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuation_records" ADD CONSTRAINT "valuation_records_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuation_records" ADD CONSTRAINT "valuation_records_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_sessions" ADD CONSTRAINT "recommendation_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interactions" ADD CONSTRAINT "user_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interactions" ADD CONSTRAINT "user_interactions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "comparisons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Approximate nearest-neighbour index for semantic search. Prisma Schema Language
-- cannot express HNSW indexes, hence raw SQL. Cosine distance matches the
-- normalised sentence-transformer embeddings produced by apps/ml.
CREATE INDEX "listing_embeddings_embedding_hnsw_idx"
  ON "listing_embeddings" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
