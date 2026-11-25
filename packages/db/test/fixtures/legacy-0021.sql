-- Sprint 2.5 — synthetic LEGACY data in the schema state after 0021 (before Sprint 2).
-- Fictional people and values only (no real customer data). Used by the upgrade scenario:
-- migrate 0000–0021 → this file → migrate 0022–0023 → everything below must still be intact.
-- Only columns that exist up to 0021 are written.

insert into users (id, email, username, display_name, role) values
  ('10000000-0000-4000-8000-0000000000c1', 'coach.legacy@vitruv.invalid', null, 'Legacy Coach', 'COACH'),
  ('10000000-0000-4000-8000-0000000000a1', null, 'legacy.kundin', 'Legacy Kundin', 'CLIENT'),
  ('10000000-0000-4000-8000-0000000000b1', 'legacy.kunde@vitruv.invalid', null, 'Legacy Kunde', 'CLIENT');

insert into coach_client_assignments (coach_user_id, client_user_id) values
  ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000a1');

insert into exercises (id, name, description, code) values
  ('10000000-0000-4000-8000-0000000000e1', 'Legacy Kniebeuge', 'Fiktive Beschreibung', 'LG-01'),
  ('10000000-0000-4000-8000-0000000000e2', 'Legacy Klimmzug', null, 'LG-02'),
  ('10000000-0000-4000-8000-0000000000e3', 'Legacy Plank', null, 'LG-03'),
  ('10000000-0000-4000-8000-0000000000e4', 'Legacy Mobilisation', null, 'LG-04');

insert into training_programs (id, client_user_id, title, status, activated_at, created_by_user_id) values
  ('10000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000a1', 'Legacy Plan', 'ACTIVE', now(), '10000000-0000-4000-8000-0000000000c1');
insert into training_weeks (id, program_id, sort_order, title) values
  ('10000000-0000-4000-8000-000000000071', '10000000-0000-4000-8000-0000000000d1', 0, 'Woche 1');
insert into training_days (id, week_id, sort_order, title, scheduled_weekday) values
  ('10000000-0000-4000-8000-000000000081', '10000000-0000-4000-8000-000000000071', 0, 'Legacy Tag A', 1),
  ('10000000-0000-4000-8000-000000000082', '10000000-0000-4000-8000-000000000071', 1, 'Legacy Tag B', 3);
insert into training_sections (id, day_id, type, sort_order) values
  ('10000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000081', 'WARMUP', 0),
  ('10000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000081', 'MAIN', 1),
  ('10000000-0000-4000-8000-000000000093', '10000000-0000-4000-8000-000000000082', 'MAIN', 0);
-- Every pre-Sprint-2 prescription shape: sets x reps (+weight), reps only, total, duration, text only.
insert into training_exercise_assignments
  (id, section_id, exercise_id, sort_order, sets, reps, total_reps, duration_seconds, rest_seconds, target_weight, weight_unit, prescription_text) values
  ('10000000-0000-4000-8000-0000000001a1', '10000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-0000000000e4', 0, null, null, null, null, null, null, null, '2 Runden locker'),
  ('10000000-0000-4000-8000-0000000001a2', '10000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-0000000000e1', 0, 4, 8, null, null, 90, 60.5, 'KG', null),
  ('10000000-0000-4000-8000-0000000001a3', '10000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-0000000000e2', 1, null, null, 50, null, 60, null, null, null),
  ('10000000-0000-4000-8000-0000000001a4', '10000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-0000000000e3', 2, null, null, null, 45, 15, null, null, null),
  ('10000000-0000-4000-8000-0000000001a5', '10000000-0000-4000-8000-000000000093', '10000000-0000-4000-8000-0000000000e1', 0, null, 12, null, null, null, null, null, null);

-- A COMPLETED legacy session (snapshot + recorded results) of day A.
insert into workout_sessions (id, client_user_id, training_program_id, training_day_id, program_title_snapshot, day_title_snapshot,
  week_order_snapshot, day_order_snapshot, status, started_at, completed_at, client_note, client_note_updated_at) values
  ('10000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000d1',
   '10000000-0000-4000-8000-000000000081', 'Legacy Plan', 'Legacy Tag A', 0, 0, 'COMPLETED',
   '2026-11-01T08:00:00Z', '2026-11-01T09:00:00Z', 'Fiktive Notiz', '2026-11-01T09:00:00Z');
insert into workout_session_exercises (id, session_id, training_exercise_assignment_id, exercise_id, sort_order, section_type, section_order,
  exercise_name_snapshot, sets, reps, total_reps, duration_seconds, rest_seconds, target_weight, weight_unit, prescription_text, execution_mode,
  status, completed_at, actual_reps, actual_duration_seconds) values
  ('10000000-0000-4000-8000-0000000006a1', '10000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000001a1', '10000000-0000-4000-8000-0000000000e4', 0, 'WARMUP', 0,
   'Legacy Mobilisation', null, null, null, null, null, null, null, '2 Runden locker', 'CUSTOM', 'COMPLETED', '2026-11-01T08:05:00Z', null, null),
  ('10000000-0000-4000-8000-0000000006a2', '10000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000001a2', '10000000-0000-4000-8000-0000000000e1', 1, 'MAIN', 1,
   'Legacy Kniebeuge', 4, 8, null, null, 90, 60.5, 'KG', null, 'SETS_REPS', 'COMPLETED', '2026-11-01T08:30:00Z', null, null),
  ('10000000-0000-4000-8000-0000000006a3', '10000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000001a3', '10000000-0000-4000-8000-0000000000e2', 2, 'MAIN', 1,
   'Legacy Klimmzug', null, null, 50, null, 60, null, null, null, 'TOTAL_REPS', 'COMPLETED', '2026-11-01T08:45:00Z', 50, null),
  ('10000000-0000-4000-8000-0000000006a4', '10000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000001a4', '10000000-0000-4000-8000-0000000000e3', 3, 'MAIN', 1,
   'Legacy Plank', null, null, null, 45, 15, null, null, null, 'DURATION', 'SKIPPED', null, null, null);
insert into workout_exercise_sets (session_exercise_id, set_number, target_reps, target_weight, actual_reps, actual_weight, completed_at)
  select '10000000-0000-4000-8000-0000000006a2', n, 8, 60.5, 8, 60.5, timestamptz '2026-11-01 08:20:00+00' + make_interval(mins => n)
  from generate_series(1, 4) as n;

-- An IN_PROGRESS legacy session of client B (pre-Sprint-2 total recorded on the exercise).
insert into training_programs (id, client_user_id, title, status, activated_at) values
  ('10000000-0000-4000-8000-0000000000d2', '10000000-0000-4000-8000-0000000000b1', 'Legacy Plan B', 'ACTIVE', now());
insert into workout_sessions (id, client_user_id, training_program_id, training_day_id, program_title_snapshot, day_title_snapshot,
  week_order_snapshot, day_order_snapshot, status, started_at) values
  ('10000000-0000-4000-8000-0000000005b1', '10000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000d2', null,
   'Legacy Plan B', 'Legacy Tag', 0, 0, 'IN_PROGRESS', '2026-11-20T08:00:00Z');
insert into workout_session_exercises (id, session_id, exercise_id, sort_order, section_type, section_order, exercise_name_snapshot,
  total_reps, rest_seconds, execution_mode, actual_reps) values
  ('10000000-0000-4000-8000-0000000006b1', '10000000-0000-4000-8000-0000000005b1', '10000000-0000-4000-8000-0000000000e2', 0, 'MAIN', 0,
   'Legacy Klimmzug', 70, 60, 'TOTAL_REPS', 30);

-- The dated plan (PlanEditor) of client A — untouched by Sprint 2, must survive unchanged.
insert into client_plans (client_user_id, starts_on, ends_on) values
  ('10000000-0000-4000-8000-0000000000a1', '2026-11-01', '2026-12-31');
insert into client_plan_items (client_user_id, exercise_id, sort_order, note) values
  ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000e1', 0, 'Fiktiver Hinweis');
