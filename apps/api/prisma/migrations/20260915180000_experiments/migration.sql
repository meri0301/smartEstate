-- The A/B harness: experiments as data, and the arm each ranking was served under.
--
-- An experiment is a row rather than configuration for the same reason the
-- refund rules are: the thesis compares strategies over weeks, and which arms
-- are running, at what allocation, should be readable from the database that
-- holds the results — not reconstructed from whichever commit was deployed on a
-- given day. The arms are a JSON array validated on read, one entry per arm,
-- each naming the strategy and method it maps to and its share of traffic.
--
-- `recommendation_sessions.arm` records which arm actually served a session.
-- It could be derived from the strategy and the method stored in the
-- preferences blob, but a derivation is a second definition of the arms that
-- would drift from the first the day an arm was redefined. The name is written
-- at serving time and stays what it was.

CREATE TABLE "experiments" (
  "id"          UUID          NOT NULL,
  "key"         TEXT          NOT NULL,
  "name"        TEXT          NOT NULL,
  "description" TEXT          NOT NULL,
  "arms"        JSONB         NOT NULL,
  "is_active"   BOOLEAN       NOT NULL DEFAULT true,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "experiments_key_key" ON "experiments"("key");

ALTER TABLE "recommendation_sessions" ADD COLUMN "arm" TEXT;

CREATE INDEX "recommendation_sessions_experiment_key_arm_idx"
  ON "recommendation_sessions"("experiment_key", "arm");

-- Outcomes are read back per session, which the existing indexes do not cover.
CREATE INDEX "user_interactions_session_id_idx" ON "user_interactions"("session_id");

-- The experiment the thesis runs: the two aggregation methods the recommender
-- already implements, at equal allocation. Both are multi-criteria methods over
-- the same seven criteria; they disagree on real data, and which disagreement a
-- buyer prefers is the empirical question.
--
-- A learned baseline is not an arm. It needs a trained ranker and a ground-truth
-- relevance definition, and neither exists yet; when one does it is a third
-- entry in this array, not a change to the harness.
INSERT INTO "experiments" ("id", "key", "name", "description", "arms")
VALUES (
  gen_random_uuid(),
  'ranking-method',
  'Weighted sum against TOPSIS',
  'Both arms rank on the same seven criteria with the same weights and differ only in how the criteria are combined: a weighted sum, or distance to an ideal point. Implicit feedback on the results decides which ordering buyers act on.',
  '[
    { "name": "A", "strategy": "MCDA", "method": "WEIGHTED_SUM", "weight": 1 },
    { "name": "B", "strategy": "MCDA", "method": "TOPSIS",       "weight": 1 }
  ]'::jsonb
);
