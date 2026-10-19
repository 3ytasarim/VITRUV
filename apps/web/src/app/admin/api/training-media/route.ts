import type { NextRequest } from 'next/server';
import { proxyMediaUpload } from '@/lib/media-upload-proxy';

/** Training (exercise) media upload (API: /v1/admin/training/media, training.exercises.write). */
export function POST(request: NextRequest) {
  return proxyMediaUpload(request, '/v1/admin/training/media');
}
