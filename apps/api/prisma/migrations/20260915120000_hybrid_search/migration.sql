-- Hybrid search: a lexical index over the listing texts, and an embedding
-- column sized for the model that actually runs.
--
-- Two halves, because hybrid search needs two rankings to fuse.
--
-- The lexical half is a generated `tsvector` per translation row. A generated
-- column rather than a trigger because `to_tsvector(regconfig, text)` is
-- immutable when the configuration is named explicitly, which is exactly the
-- condition PostgreSQL requires — and a column the database maintains cannot
-- drift out of step with the text the way a trigger somebody forgets to fire
-- can. The configuration is chosen per locale: Russian and English have
-- stemmers, Armenian has none in PostgreSQL, so Armenian rows fall back to
-- `simple`, which tokenises and folds case without stemming. That is a real
-- limitation and it is written down in ADR-0015 rather than hidden: Armenian
-- search matches word forms rather than lemmas.
--
-- The semantic half changes the embedding width from 768 to 384. The column was
-- provisioned for LaBSE or e5-base; the service runs multilingual-e5-small,
-- which is small enough to ship in an image an examiner can build. No data is
-- lost because nothing has ever been embedded — there is no backfill to
-- preserve — and a vector of the wrong width could not be compared with a new
-- one anyway. The HNSW index has to be dropped and rebuilt with the column.

-- --- lexical -----------------------------------------------------------------

ALTER TABLE "listing_translations"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      CASE "locale"
        WHEN 'ru' THEN 'russian'::regconfig
        WHEN 'en' THEN 'english'::regconfig
        ELSE 'simple'::regconfig
      END,
      -- The title counts for more than the description: repeating it is the
      -- cheapest available weighting and needs no second column.
      "title" || ' ' || "title" || ' ' || "description"
    )
  ) STORED;

CREATE INDEX "listing_translations_search_vector_idx"
  ON "listing_translations" USING gin ("search_vector");

-- --- semantic ----------------------------------------------------------------

DROP INDEX IF EXISTS "listing_embeddings_embedding_hnsw_idx";

ALTER TABLE "listing_embeddings"
  ALTER COLUMN "embedding" TYPE vector(384);

-- Rebuilt exactly as before, at the new width. Cosine distance still matches the
-- normalised vectors apps/ml produces.
CREATE INDEX "listing_embeddings_embedding_hnsw_idx"
  ON "listing_embeddings" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
