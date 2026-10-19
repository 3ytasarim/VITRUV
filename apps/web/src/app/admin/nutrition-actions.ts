'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { nutritionApi } from '@/lib/nutrition-api';

/**
 * Meal-plan document actions (activate / archive). They only forward to the API, which checks
 * `nutrition.documents.assign` and the client scope. Ids are validated again (public endpoints).
 */
export type NutritionResult = { ok: true } | { ok: false; message: string };

const id = z.uuid();

export async function setNutritionStatusAction(
  clientId: string,
  documentId: string,
  target: 'activate' | 'archive',
): Promise<NutritionResult> {
  if (!id.safeParse(clientId).success || !id.safeParse(documentId).success) {
    return { ok: false, message: 'Ungültige Anfrage.' };
  }
  if (target !== 'activate' && target !== 'archive')
    return { ok: false, message: 'Ungültige Anfrage.' };
  const result =
    target === 'activate'
      ? await nutritionApi.activate(documentId)
      : await nutritionApi.archive(documentId);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.status === 409
          ? result.error.message
          : result.status === 404
            ? 'Nicht gefunden oder kein Zugriff.'
            : result.status === 403
              ? 'Dafür fehlt dir die Berechtigung.'
              : 'Das hat nicht geklappt. Bitte versuche es erneut.',
    };
  }
  revalidatePath(`/admin/kunden/${clientId}/ernaehrung`);
  return { ok: true };
}
