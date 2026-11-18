'use server';

import {
  createWelcomeVideoRequestSchema,
  updateWelcomeVideoRequestSchema,
  welcomeCategoryRequestSchema,
  welcomeOrderRequestSchema,
  type AdminWelcome,
} from '@vitruv/contracts';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ApiResult } from '@/lib/admin-api';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { welcomeApi } from '@/lib/welcome-api';

/**
 * "Willkommen" server actions. They only forward to the API, which authorises every call
 * (`welcome.manage`, ADMIN only). Inputs are validated again with the shared contracts because
 * server actions are public HTTP endpoints. Every success returns the complete overview.
 */
export type WelcomeResult =
  | { ok: true; data: AdminWelcome }
  | { ok: false; message: string; fieldErrors: Record<string, string> };

const id = z.uuid();
const GENERIC = 'Das hat nicht geklappt. Bitte versuche es erneut.';

const invalid = (issues: { path: PropertyKey[]; message: string }[]): WelcomeResult => {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) fieldErrors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return { ok: false, message: 'Bitte prüfe die Eingaben.', fieldErrors };
};

function done(result: ApiResult<AdminWelcome>): WelcomeResult {
  if (result.ok) {
    revalidatePath('/admin/willkommen');
    revalidatePath(`${PORTAL_PATH}/willkommen`);
    return { ok: true, data: result.data };
  }
  const fieldErrors: Record<string, string> = {};
  for (const detail of result.error.details ?? []) fieldErrors[detail.path] ??= detail.message;
  const message =
    result.status === 403
      ? 'Dafür fehlt dir die Berechtigung.'
      : result.status === 404
        ? 'Nicht gefunden – bitte Seite neu laden.'
        : result.status === 401
          ? 'Bitte melde dich erneut an.'
          : result.status === 409 || result.status === 400
            ? (Object.values(fieldErrors)[0] ??
              (/[äöüÄÖÜß]|Kategorie|Video/.test(result.error.message)
                ? result.error.message
                : 'Bitte prüfe die Eingaben.'))
            : GENERIC;
  return { ok: false, message, fieldErrors };
}

export async function createWelcomeCategoryAction(name: string): Promise<WelcomeResult> {
  const input = welcomeCategoryRequestSchema.safeParse({ name });
  if (!input.success) return invalid(input.error.issues);
  return done(await welcomeApi.createCategory(input.data.name));
}

export async function renameWelcomeCategoryAction(
  categoryId: string,
  name: string,
): Promise<WelcomeResult> {
  const input = welcomeCategoryRequestSchema.safeParse({ name });
  if (!id.safeParse(categoryId).success) return invalid([{ path: ['id'], message: GENERIC }]);
  if (!input.success) return invalid(input.error.issues);
  return done(await welcomeApi.renameCategory(categoryId, input.data.name));
}

export async function deleteWelcomeCategoryAction(categoryId: string): Promise<WelcomeResult> {
  if (!id.safeParse(categoryId).success) return invalid([{ path: ['id'], message: GENERIC }]);
  return done(await welcomeApi.deleteCategory(categoryId));
}

export async function orderWelcomeCategoriesAction(ids: string[]): Promise<WelcomeResult> {
  const input = welcomeOrderRequestSchema.safeParse({ ids });
  if (!input.success) return invalid(input.error.issues);
  return done(await welcomeApi.orderCategories(input.data.ids));
}

export async function orderWelcomeVideosAction(
  categoryId: string,
  ids: string[],
): Promise<WelcomeResult> {
  const input = welcomeOrderRequestSchema.safeParse({ ids });
  if (!id.safeParse(categoryId).success) return invalid([{ path: ['id'], message: GENERIC }]);
  if (!input.success) return invalid(input.error.issues);
  return done(await welcomeApi.orderVideos(categoryId, input.data.ids));
}

export async function createWelcomeVideoAction(raw: {
  categoryId: string;
  mediaAssetId: string;
  title: string;
  description: string;
}): Promise<WelcomeResult> {
  const input = createWelcomeVideoRequestSchema.safeParse(raw);
  if (!input.success) return invalid(input.error.issues);
  // the API validates again; send the raw (checked) strings, not the transformed output
  return done(await welcomeApi.createVideo(raw));
}

export async function updateWelcomeVideoAction(
  videoId: string,
  raw: { categoryId?: string; mediaAssetId?: string; title?: string; description?: string },
): Promise<WelcomeResult> {
  const input = updateWelcomeVideoRequestSchema.safeParse(raw);
  if (!id.safeParse(videoId).success) return invalid([{ path: ['id'], message: GENERIC }]);
  if (!input.success) return invalid(input.error.issues);
  return done(await welcomeApi.updateVideo(videoId, raw));
}

export async function deleteWelcomeVideoAction(videoId: string): Promise<WelcomeResult> {
  if (!id.safeParse(videoId).success) return invalid([{ path: ['id'], message: GENERIC }]);
  return done(await welcomeApi.deleteVideo(videoId));
}
