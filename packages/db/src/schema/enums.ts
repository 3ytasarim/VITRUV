import {
  AUTH_CLIENT_TYPES,
  AUTH_EVENT_TYPES,
  COACHING_STATUSES,
  MEDIA_KINDS,
  MEDIA_PURPOSES,
  MEDIA_VISIBILITIES,
  NUTRITION_DOCUMENT_STATUSES,
  SESSION_REVOKE_REASONS,
  TRAINING_PROGRAM_STATUSES,
  TRAINING_SECTION_TYPES,
  USER_ROLES,
  USER_STATUSES,
  WEBSITE_LEAD_STATUSES,
  WEBSITE_SECTION_TYPES,
  WEBSITE_VERSION_STATUSES,
  WEIGHT_UNITS,
  WORKOUT_EXECUTION_MODES,
  WORKOUT_EXERCISE_STATUSES,
  WORKOUT_SESSION_STATUSES,
} from '@vitruv/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

// Enum values come from @vitruv/shared so DB, API and web can never drift apart.
export const userRole = pgEnum('user_role', USER_ROLES);
export const userStatus = pgEnum('user_status', USER_STATUSES);
export const mediaKind = pgEnum('media_kind', MEDIA_KINDS);
export const mediaVisibility = pgEnum('media_visibility', MEDIA_VISIBILITIES);
export const mediaPurpose = pgEnum('media_purpose', MEDIA_PURPOSES);
export const websiteSectionType = pgEnum('website_section_type', WEBSITE_SECTION_TYPES);
export const websiteVersionStatus = pgEnum('website_version_status', WEBSITE_VERSION_STATUSES);
export const websiteLeadStatus = pgEnum('website_lead_status', WEBSITE_LEAD_STATUSES);
export const authClientType = pgEnum('auth_client_type', AUTH_CLIENT_TYPES);
export const sessionRevokeReason = pgEnum('session_revoke_reason', SESSION_REVOKE_REASONS);
export const authEventType = pgEnum('auth_event_type', AUTH_EVENT_TYPES);
export const coachingStatus = pgEnum('coaching_status', COACHING_STATUSES);
export const trainingProgramStatus = pgEnum('training_program_status', TRAINING_PROGRAM_STATUSES);
export const trainingSectionType = pgEnum('training_section_type', TRAINING_SECTION_TYPES);
export const weightUnit = pgEnum('weight_unit', WEIGHT_UNITS);
export const workoutSessionStatus = pgEnum('workout_session_status', WORKOUT_SESSION_STATUSES);
export const workoutExecutionMode = pgEnum('workout_execution_mode', WORKOUT_EXECUTION_MODES);
export const workoutExerciseStatus = pgEnum('workout_exercise_status', WORKOUT_EXERCISE_STATUSES);
export const nutritionDocumentStatus = pgEnum(
  'nutrition_document_status',
  NUTRITION_DOCUMENT_STATUSES,
);
