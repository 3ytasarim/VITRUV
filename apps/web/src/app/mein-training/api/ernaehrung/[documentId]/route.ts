import { NextResponse } from 'next/server';
import { z } from 'zod';
import { proxyPrivateFile } from '@/lib/private-file-proxy';

/** The signed-in client's own ACTIVE meal-plan PDF (API: nutrition.self.read, self context). */
export async function GET(_: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!z.uuid().safeParse(documentId).success) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Nicht gefunden.' } },
      { status: 404 },
    );
  }
  return proxyPrivateFile(`/v1/client/nutrition/${documentId}/file`);
}
