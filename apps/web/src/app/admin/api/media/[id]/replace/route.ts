import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { mediaUploadBodyLimit } from '@/lib/env';
import { proxyMediaUpload } from '@/lib/media-upload-proxy';

/**
 * Replace the file of a website media asset (API: /v1/admin/media/:id/replace,
 * website.media.write + website.media.delete). Excluded from src/proxy.ts like the upload route.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Nicht gefunden.' } },
      { status: 404 },
    );
  }
  return proxyMediaUpload(request, `/v1/admin/media/${id}/replace`, {
    maxBodyBytes: mediaUploadBodyLimit(),
  });
}
