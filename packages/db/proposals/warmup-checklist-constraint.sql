-- PROPOSAL ONLY — NOT A MIGRATION. This file is outside migrations/ and is not in the journal, so
-- the migration runner never applies it. Sprint 2 rule: the production constraint stays unchanged.
--
-- Why: production CHECK "training_assignments_meaningful" requires one of
-- sets / reps / total_reps / duration_seconds / prescription_text. A Warm-up CHECKLIST item needs
-- none of them. Sprint 2 works WITHOUT this change: the API stores CHECKLIST items with the neutral
-- prescription "Abhaken" (CHECKLIST_PRESCRIPTION_FALLBACK in @vitruv/shared).
--
-- If the owner approves removing that shim later:
--   1. copy this SQL into a new numbered migration (pnpm db:generate after editing the schema),
--   2. list that file in migrations/APPROVED_DESTRUCTIVE.json (the guard flags DROP CONSTRAINT),
--   3. apply on a Neon branch first, then production.
-- The new constraint is a strict SUPERSET of the old one (every row valid today stays valid), so it
-- is added before the old one is dropped and both run in one transaction.

ALTER TABLE "training_exercise_assignments"
  ADD CONSTRAINT "training_assignments_meaningful_v2" CHECK (
    "execution_type" = 'CHECKLIST'
    or "sets" is not null or "reps" is not null or "total_reps" is not null
    or "duration_seconds" is not null or "prescription_text" is not null
  );

ALTER TABLE "training_exercise_assignments" DROP CONSTRAINT "training_assignments_meaningful";

-- Rollback (only while no CHECKLIST row without prescription exists):
--   ALTER TABLE "training_exercise_assignments" ADD CONSTRAINT "training_assignments_meaningful"
--     CHECK ("sets" is not null or "reps" is not null or "total_reps" is not null
--            or "duration_seconds" is not null or "prescription_text" is not null);
--   ALTER TABLE "training_exercise_assignments" DROP CONSTRAINT "training_assignments_meaningful_v2";
