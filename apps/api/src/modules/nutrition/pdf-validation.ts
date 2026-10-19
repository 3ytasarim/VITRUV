import { NUTRITION_PDF_MAX_BYTES, NUTRITION_PDF_MIME_TYPE } from '@vitruv/shared';
import { AppError } from '../../lib/errors';
import { sanitizeFileName } from '../media/media.service';

/**
 * Nutrition PDF upload validation (Sprint 8). The CONTENT decides, never the name or the
 * client-declared type alone:
 *  1. declared type must be application/pdf (a mismatch is rejected, not "corrected")
 *  2. size within NUTRITION_PDF_MAX_BYTES (25 MiB) and not trivially small
 *  3. header `%PDF-<major>.<minor>` at byte 0 (an .exe renamed to .pdf starts with `MZ`)
 *  4. an `%%EOF` marker in the last 1 KiB (rejects random bytes that merely start with %PDF and
 *     truncated uploads)
 * The PDF is never parsed, rendered or executed on the server. The display name is sanitised and
 * never used for the storage path (server-generated key).
 */
const MIN_BYTES = 64;
const HEADER = /^%PDF-[12]\.\d/;
const EOF_MARKER = '%%EOF';

export interface ValidatedPdf {
  fileName: string;
  sizeBytes: number;
}

export function validatePdfUpload(input: {
  bytes: Uint8Array;
  declaredType: string;
  fileName: string | undefined;
  maxBytes?: number;
}): ValidatedPdf {
  const maxBytes = input.maxBytes ?? NUTRITION_PDF_MAX_BYTES;
  if (input.declaredType.trim().toLowerCase() !== NUTRITION_PDF_MIME_TYPE) {
    throw AppError.badRequest('Nur PDF-Dateien sind erlaubt.');
  }
  if (input.bytes.byteLength > maxBytes) {
    throw AppError.payloadTooLarge(
      `Datei zu groß (max. ${Math.floor(maxBytes / 1024 / 1024)} MB).`,
    );
  }
  if (input.bytes.byteLength < MIN_BYTES) {
    throw AppError.badRequest('Die Datei ist kein gültiges PDF.');
  }
  const head = new TextDecoder('latin1').decode(input.bytes.subarray(0, 16));
  const tail = new TextDecoder('latin1').decode(
    input.bytes.subarray(Math.max(0, input.bytes.byteLength - 1024)),
  );
  if (!HEADER.test(head) || !tail.includes(EOF_MARKER)) {
    throw AppError.badRequest('Die Datei ist kein gültiges PDF.');
  }
  const name = sanitizeFileName(input.fileName);
  return {
    fileName: /\.pdf$/i.test(name) ? name : `${name}.pdf`,
    sizeBytes: input.bytes.byteLength,
  };
}

/**
 * `Content-Disposition` for a private PDF: ASCII fallback + RFC 5987 UTF-8 name. Quotes, slashes,
 * control characters and CR/LF can never reach the header (no header injection).
 */
export function pdfContentDisposition(fileName: string): string {
  const safe = sanitizeFileName(fileName).replace(/["\\\r\n]/g, '');
  const ascii = safe.replace(/[^\x20-\x7E]/g, '_') || 'dokument.pdf';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
