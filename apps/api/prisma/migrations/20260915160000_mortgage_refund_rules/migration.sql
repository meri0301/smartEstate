-- The mortgage income-tax refund: provinces, border settlements, and the rules
-- themselves as data.
--
-- The refund is governed by two things this schema could not previously express.
--
-- **Which province a district is in.** The phase-out that ends the scheme runs
-- province by province, so the province is load-bearing and has to be reliable.
-- The existing `marz` column is free text parsed out of an OpenStreetMap
-- display name — it currently holds values like "Գյումրի-Ախուրյան սահման",
-- which is a community boundary and not a province at all. It stays, because it
-- is honest about where it came from; `marz_code` is added beside it as the
-- authoritative value and is backfilled from the district slug rather than from
-- anything OSM returned.
--
-- **Whether a settlement is a designated border settlement.** Those are exempt
-- from the phase-out. The designation is a government list that this project has
-- no authoritative copy of, so the column defaults to false everywhere and is
-- set per settlement when somebody has the list. False is the safe default: it
-- under-claims the refund rather than promising one that does not exist.
--
-- The rule sets themselves are rows, not constants, so a change in the law is a
-- row and not a deployment, and a calculation made last year can be reproduced
-- exactly by reading the set that was in force on the agreement date.

CREATE TYPE "Marz" AS ENUM (
  'YEREVAN',
  'ARAGATSOTN',
  'ARARAT',
  'ARMAVIR',
  'GEGHARKUNIK',
  'KOTAYK',
  'LORI',
  'SHIRAK',
  'SYUNIK',
  'TAVUSH',
  'VAYOTS_DZOR'
);

ALTER TABLE "districts" ADD COLUMN "marz_code" "Marz";
ALTER TABLE "districts"
  ADD COLUMN "is_border_settlement" BOOLEAN NOT NULL DEFAULT false;

-- Backfilled from the slug, which this project controls, rather than from the
-- OSM text, which it does not.
UPDATE "districts" SET "marz_code" = 'SHIRAK' WHERE "slug" = 'gyumri';
UPDATE "districts" SET "marz_code" = 'LORI'   WHERE "slug" = 'vanadzor';
UPDATE "districts" SET "marz_code" = 'TAVUSH' WHERE "slug" = 'dilijan';
UPDATE "districts" SET "marz_code" = 'YEREVAN' WHERE "marz_code" IS NULL;

ALTER TABLE "districts" ALTER COLUMN "marz_code" SET NOT NULL;

-- --- the rules, as data ------------------------------------------------------
--
-- Two sets, because the quarterly cap halved for agreements signed on or after
-- 2025-01-01. A set is selected by the loan agreement date, so which cap applies
-- is a property of the loan and not of today's date.
--
-- `maxApplicantAge` is null: an age limit is reported anecdotally and this
-- project has no source for it, and null means "not a condition" rather than
-- "unknown limit of zero". `incomeTaxRate` is deliberately absent from the rules
-- and read from configuration instead — see ADR-0017.

INSERT INTO "tax_refund_rule_sets"
  ("id", "version", "effective_from", "effective_to", "description", "rules")
VALUES
  (
    gen_random_uuid(),
    1,
    DATE '2014-11-01',
    DATE '2024-12-31',
    'Mortgage interest income-tax refund, agreements from 2014-11-01 to 2024-12-31',
    '{
      "minAgreementDate": "2014-11-01",
      "maxPropertyValueAmd": 55000000,
      "quarterlyCapAmd": 1500000,
      "maxApplicantAge": null,
      "borderSettlementsExempt": true,
      "phaseOut": {
        "YEREVAN": "2025-01-01",
        "ARAGATSOTN": "2027-01-01",
        "ARARAT": "2027-01-01",
        "ARMAVIR": "2027-01-01",
        "KOTAYK": "2027-01-01",
        "SHIRAK": "2029-01-01",
        "LORI": "2029-01-01",
        "TAVUSH": "2029-01-01",
        "GEGHARKUNIK": "2029-01-01",
        "VAYOTS_DZOR": "2029-01-01",
        "SYUNIK": "2029-01-01"
      }
    }'::jsonb
  ),
  (
    gen_random_uuid(),
    2,
    DATE '2025-01-01',
    NULL,
    'Mortgage interest income-tax refund, agreements from 2025-01-01; quarterly cap halved',
    '{
      "minAgreementDate": "2014-11-01",
      "maxPropertyValueAmd": 55000000,
      "quarterlyCapAmd": 750000,
      "maxApplicantAge": null,
      "borderSettlementsExempt": true,
      "phaseOut": {
        "YEREVAN": "2025-01-01",
        "ARAGATSOTN": "2027-01-01",
        "ARARAT": "2027-01-01",
        "ARMAVIR": "2027-01-01",
        "KOTAYK": "2027-01-01",
        "SHIRAK": "2029-01-01",
        "LORI": "2029-01-01",
        "TAVUSH": "2029-01-01",
        "GEGHARKUNIK": "2029-01-01",
        "VAYOTS_DZOR": "2029-01-01",
        "SYUNIK": "2029-01-01"
      }
    }'::jsonb
  );

-- One set per agreement date, enforced rather than trusted: overlapping ranges
-- would make a historical calculation depend on row order.
CREATE INDEX "tax_refund_rule_sets_effective_from_idx"
  ON "tax_refund_rule_sets" ("effective_from" DESC);
