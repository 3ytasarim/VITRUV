import type { NextRequest } from 'next/server';
import { proxyMediaUpload } from '@/lib/media-upload-proxy';

/** Website media library upload (API: /v1/admin/media, website.media.write). */
export function POST(request: NextRequest) {
  return proxyMediaUpload(request, '/v1/admin/media');
}
