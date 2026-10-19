import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { proxyMediaUpload } from '@/lib/media-upload-proxy';

/** Meal-plan PDF upload for one client (API: nutrition.documents.write + client scope). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Nicht gefunden.' } },
      { status: 404 },
    );
  }
  return proxyMediaUpload(request, `/v1/admin/nutrition/clients/${clientId}/documents`);
}
