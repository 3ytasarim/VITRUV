import type { NextRequest } from 'next/server';
import { mediaUploadBodyLimit } from '@/lib/env';
import { proxyMediaUpload } from '@/lib/media-upload-proxy';

/** Training (exercise) media upload (API: /v1/admin/training/media, training.exercises.write). */
export function POST(request: NextRequest) {
  // Excluded from src/proxy.ts (no body buffering): streamed straight through to the API.
  return proxyMediaUpload(request, '/v1/admin/training/media', {
    maxBodyBytes: mediaUploadBodyLimit(),
  });
}
