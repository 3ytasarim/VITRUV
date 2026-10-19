'use server';

import {
  sectionKeySchema,
  type AdminMediaDetail,
  type AdminMediaList,
  type PublishResponse,
  type SaveDraftResponse,
} from '@vitruv/contracts';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminApi, type ApiResult } from '@/lib/admin-api';

/**
 * Server actions behind the admin CMS UI. They only forward to the API, which validates,
 * authorizes (permissions) and owns all business rules — the web app never writes data itself.
 * Inputs are re-validated here because server actions are callable HTTP endpoints.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; details: { path: string; message: string }[] };

function toAction<T>(result: ApiResult<T>): ActionResult<T> {
  return result.ok
    ? { ok: true, data: result.data }
    : { ok: false, message: result.error.message, details: result.error.details ?? [] };
}

const invalid = (message: string): ActionResult<never> => ({ ok: false, message, details: [] });
const contentSchema = z.record(z.string(), z.unknown());
const idSchema = z.uuid();

function refreshWebsiteAdmin() {
  revalidatePath('/admin/website', 'layout');
}

export async function saveDraftAction(
  key: string,
  content: unknown,
): Promise<ActionResult<SaveDraftResponse>> {
  const k = sectionKeySchema.safeParse(key);
  const c = contentSchema.safeParse(content);
  if (!k.success || !c.success) return invalid('Ungültige Anfrage.');
  const result = toAction(await adminApi.saveDraft(k.data, c.data));
  if (result.ok) refreshWebsiteAdmin();
  return result;
}

export async function publishAction(key: string): Promise<ActionResult<PublishResponse>> {
  const k = sectionKeySchema.safeParse(key);
  if (!k.success) return invalid('Ungültige Anfrage.');
  const result = toAction(await adminApi.publish(k.data));
  if (result.ok) refreshWebsiteAdmin();
  return result;
}

export async function discardDraftAction(key: string): Promise<ActionResult<null>> {
  const k = sectionKeySchema.safeParse(key);
  if (!k.success) return invalid('Ungültige Anfrage.');
  const result = toAction(await adminApi.discardDraft(k.data));
  if (result.ok) refreshWebsiteAdmin();
  return result.ok ? { ok: true, data: null } : result;
}

export async function listMediaAction(
  kind?: 'IMAGE' | 'VIDEO',
): Promise<ActionResult<AdminMediaList>> {
  const k = z.enum(['IMAGE', 'VIDEO']).optional().safeParse(kind);
  if (!k.success) return invalid('Ungültige Anfrage.');
  return toAction(await adminApi.mediaList(k.data));
}

export async function mediaDetailAction(id: string): Promise<ActionResult<AdminMediaDetail>> {
  const i = idSchema.safeParse(id);
  if (!i.success) return invalid('Ungültige Anfrage.');
  return toAction(await adminApi.media(i.data));
}

export async function updateMediaAltAction(
  id: string,
  altText: string | null,
): Promise<ActionResult<AdminMediaDetail>> {
  const i = idSchema.safeParse(id);
  const a = z.string().max(300).nullable().safeParse(altText);
  if (!i.success || !a.success) return invalid('Ungültige Anfrage.');
  const result = toAction(await adminApi.updateMedia(i.data, a.data));
  if (result.ok) revalidatePath('/admin/website/medien');
  return result;
}

export async function deleteMediaAction(id: string): Promise<ActionResult<null>> {
  const i = idSchema.safeParse(id);
  if (!i.success) return invalid('Ungültige Anfrage.');
  const result = toAction(await adminApi.deleteMedia(i.data));
  if (result.ok) revalidatePath('/admin/website/medien');
  return result.ok ? { ok: true, data: null } : result;
}
