import type { ApiFailure } from '@/lib/admin-api';

/**
 * Result shape + German error mapping shared by the training server actions (plain module: a
 * 'use server' file may only export async functions).
 */
export type TrainingResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors: Record<string, string>; status?: number };

export const GENERIC = 'Das hat nicht geklappt. Bitte versuche es erneut.';

/** API failure → message the coach can act on (field errors keyed by their first path part). */
export function failure(result: ApiFailure): Extract<TrainingResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string> = {};
  for (const detail of result.error.details ?? []) {
    // Full path for row-level errors ("sections.0.exercises.1.reps") + its first part.
    fieldErrors[detail.path] ??= detail.message;
    fieldErrors[detail.path.split('.')[0] ?? detail.path] ??= detail.message;
  }
  const message =
    result.status === 404
      ? 'Nicht gefunden oder kein Zugriff.'
      : result.status === 403
        ? 'Dafür fehlt dir die Berechtigung.'
        : result.status === 409
          ? /[äöüÄÖÜß]|Plan|Entw|Vorlage|Workout/.test(result.error.message)
            ? result.error.message
            : 'Konflikt mit bestehenden Daten.'
          : result.status === 400
            ? (result.error.details?.length ?? 0) > 0
              ? result.error.message === 'Request validation failed.'
                ? 'Bitte prüfe die Eingaben.'
                : result.error.message
              : 'Bitte prüfe die Eingaben.'
            : result.status === 401
              ? 'Bitte melde dich erneut an.'
              : result.status === 0 || result.status >= 500
                ? 'Keine Verbindung zum Server. Bitte versuche es erneut.'
                : GENERIC;
  return { ok: false, message, fieldErrors, status: result.status };
}

/** Local (contract) validation failure → same shape; paths are joined ("sections.0.exercises"). */
export function invalid(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Extract<TrainingResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    fieldErrors[issue.path.map(String).join('.') || 'form'] ??= issue.message;
  }
  return { ok: false, message: 'Bitte prüfe die Eingaben.', fieldErrors };
}
