import { NextResponse } from 'next/server';
import { z } from 'zod';
import { proxyPrivateFile } from '@/lib/private-file-proxy';

/** A client's meal-plan PDF for Coach/Admin (API: nutrition.documents.read + client scope). */
export async function GET(_: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!z.uuid().safeParse(documentId).success) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Nicht gefunden.' } },
      { status: 404 },
    );
  }
  return proxyPrivateFile(`/v1/admin/nutrition/documents/${documentId}/file`);
}
