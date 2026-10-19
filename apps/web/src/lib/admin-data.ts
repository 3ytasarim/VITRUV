import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { adminApi } from './admin-api';

/**
 * Per-request deduplicated loaders for admin detail pages (layout + page share one API call).
 * 404 from the API — including "not in your scope" — becomes the Next.js not-found page, so a
 * coach probing foreign ids sees exactly what a non-existent id shows.
 */
export const loadClient = cache(async (id: string) => {
  const result = await adminApi.client(id);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  return result;
});

export const loadCoach = cache(async (id: string) => {
  const result = await adminApi.coach(id);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  return result;
});
