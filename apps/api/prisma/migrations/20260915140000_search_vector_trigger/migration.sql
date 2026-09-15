-- Maintain `listing_translations.search_vector` with a trigger instead of a
-- generated column.
--
-- The previous migration made it `GENERATED ALWAYS AS (...) STORED`, which is
-- the better mechanism: the database keeps it in step with the text and no
-- writer can forget to. It cannot be represented in `schema.prisma`, though.
-- Prisma models a generated column as a `dbgenerated` default and compares the
-- expression as a string, and PostgreSQL pretty-prints the `CASE` that picks the
-- text search configuration across several lines — which a Prisma schema string
-- cannot contain. The drift check therefore failed on every run, reporting a
-- difference that was not one.
--
-- A trigger is invisible to `prisma migrate diff`, so the column becomes an
-- ordinary nullable `tsvector` that the schema already describes correctly. The
-- cost is that the guarantee now rests on the trigger rather than on the column
-- definition: it fires on INSERT and on UPDATE of the three fields that can
-- change the vector, so the only way to desynchronise it is to drop it.
--
-- The configuration choice is unchanged. Russian and English have stemmers;
-- PostgreSQL has no Armenian dictionary, so Armenian uses `simple` and matches
-- word forms rather than lemmas.

ALTER TABLE "listing_translations" DROP COLUMN "search_vector";

ALTER TABLE "listing_translations" ADD COLUMN "search_vector" tsvector;

CREATE OR REPLACE FUNCTION listing_translations_search_vector()
RETURNS trigger
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  NEW."search_vector" := to_tsvector(
    CASE NEW."locale"
      WHEN 'ru' THEN 'russian'::regconfig
      WHEN 'en' THEN 'english'::regconfig
      ELSE 'simple'::regconfig
    END,
    -- The title counts for more than the description: repeating it is the
    -- cheapest available weighting and needs no second column.
    NEW."title" || ' ' || NEW."title" || ' ' || NEW."description"
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_translations_search_vector_trg
  BEFORE INSERT OR UPDATE OF "title", "description", "locale"
  ON "listing_translations"
  FOR EACH ROW
  EXECUTE FUNCTION listing_translations_search_vector();

-- Existing rows: the trigger only fires on write, so they are filled once here.
UPDATE "listing_translations" SET "title" = "title";

-- The index went with the dropped column.
CREATE INDEX "listing_translations_search_vector_idx"
  ON "listing_translations" USING gin ("search_vector");
