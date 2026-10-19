import type {
  ActivateNutritionDocumentResponse,
  AdminNutritionDocument,
  AdminNutritionDocumentList,
  ClientActiveNutritionResponse,
  UploadNutritionDocumentFields,
} from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { NUTRITION_PDF_MIME_TYPE } from '@vitruv/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Principal } from '../../auth/principal';
import { buildStorageKey, type ObjectStorage } from '../../infra/storage/index';
import { AppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { recordEvent } from '../auth/auth.service';
import { clientAccessible } from '../management/management.service';
import { pdfContentDisposition, validatePdfUpload } from './pdf-validation';

/**
 * Nutrition V1 — client-specific PDF documents (Sprint 8, docs/NUTRITION-ARCHITECTURE.md).
 *
 * OBJECT SCOPE: every coach/admin lookup — client, document, file — joins to the document's
 * client and applies clientAccessible() in SQL (ADMIN: all clients; COACH: actively assigned
 * clients). Out of scope = the same 404 as a missing id. Client reads are self context only.
 * PRIVATE FILES: assets are PRIVATE, purpose NUTRITION, key `private/nutrition/…`; bytes are
 * returned only by the file functions below after the scope check — there is no public URL.
 */
const { nutritionDocuments: N, mediaAssets: M, users, coachProfiles } = schema;

export interface NutritionDeps {
  db: DbExecutor;
  storage: ObjectStorage;
  logger: Logger;
  now?: () => Date;
  /** Overrides NUTRITION_PDF_MAX_BYTES (tests). */
  maxBytes?: number;
  /** Lifetime of signed download URLs (S3 driver), seconds. Default 60. */
  privateUrlTtlSeconds?: number;
}

type DocRow = typeof N.$inferSelect;
type AssetRow = typeof M.$inferSelect;

const notFound = () => AppError.notFound('Not found.');
const nowOf = (deps: Pick<NutritionDeps, 'now'>) => deps.now?.() ?? new Date();
const iso = (value: Date | null) => (value ? value.toISOString() : null);

const filePath = (audience: 'admin' | 'client', id: string) =>
  audience === 'admin'
    ? `/v1/admin/nutrition/documents/${id}/file`
    : `/v1/client/nutrition/${id}/file`;

function toAdminDto(doc: DocRow, asset: AssetRow, uploader: string | null): AdminNutritionDocument {
  return {
    id: doc.id,
    clientId: doc.clientUserId,
    title: doc.title,
    versionNumber: doc.versionNumber,
    versionLabel: doc.versionLabel,
    status: doc.status,
    effectiveFrom: doc.effectiveFrom,
    activatedAt: iso(doc.activatedAt),
    archivedAt: iso(doc.archivedAt),
    createdAt: doc.createdAt.toISOString(),
    uploadedBy: uploader ? { displayName: uploader } : null,
    file: {
      mimeType: NUTRITION_PDF_MIME_TYPE,
      sizeBytes: asset.sizeBytes,
      fileName: asset.fileName,
      fileApiPath: filePath('admin', doc.id),
    },
  };
}

/** Document rows with asset + uploader name; callers ALWAYS add the clientAccessible() scope. */
function scopedDocuments(db: DbExecutor) {
  return db
    .select({
      doc: N,
      asset: M,
      uploader: sql<
        string | null
      >`coalesce(${coachProfiles.displayName}, ${users.displayName}, ${users.email})`,
    })
    .from(N)
    .innerJoin(M, eq(M.id, N.mediaAssetId))
    .leftJoin(users, eq(users.id, N.assignedByUserId))
    .leftJoin(coachProfiles, eq(coachProfiles.userId, N.assignedByUserId))
    .$dynamic();
}

async function requireClientInScope(db: DbExecutor, actor: Principal, clientId: string) {
  const [client] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, clientId), clientAccessible(actor, users.id)))
    .limit(1);
  if (!client) throw notFound();
}

async function scopedDocument(db: DbExecutor, actor: Principal, documentId: string) {
  const [row] = await db
    .select({ doc: N })
    .from(N)
    .where(and(eq(N.id, documentId), clientAccessible(actor, N.clientUserId)))
    .limit(1);
  if (!row) throw notFound();
  return row.doc;
}

async function adminDto(db: DbExecutor, actor: Principal, documentId: string) {
  const [row] = await scopedDocuments(db)
    .where(and(eq(N.id, documentId), clientAccessible(actor, N.clientUserId)))
    .limit(1);
  if (!row) throw notFound();
  return toAdminDto(row.doc, row.asset, row.uploader);
}

const clientLock = (db: DbExecutor, clientId: string) =>
  db.execute(sql`select pg_advisory_xact_lock(hashtext(${`vitruv.nutrition:${clientId}`}))`);

// ---------------------------------------------------------------------------------------------
// Coach / Admin
// ---------------------------------------------------------------------------------------------

export async function listClientDocuments(
  deps: NutritionDeps,
  actor: Principal,
  clientId: string,
): Promise<AdminNutritionDocumentList> {
  await requireClientInScope(deps.db, actor, clientId);
  const rows = await scopedDocuments(deps.db)
    .where(and(eq(N.clientUserId, clientId), clientAccessible(actor, N.clientUserId)))
    .orderBy(desc(N.versionNumber));
  return { items: rows.map((row) => toAdminDto(row.doc, row.asset, row.uploader)) };
}

export function getDocument(deps: NutritionDeps, actor: Principal, documentId: string) {
  return adminDto(deps.db, actor, documentId);
}

/**
 * Upload a new version as DRAFT (never auto-activated — the client keeps seeing the current
 * ACTIVE plan until "Aktivieren"). Same media table and storage abstraction as all other media;
 * PRIVATE visibility and the `nutrition` key prefix.
 */
export async function uploadDocument(
  deps: NutritionDeps,
  actor: Principal,
  clientId: string,
  input: {
    bytes: Uint8Array;
    declaredType: string;
    fileName: string | undefined;
  } & UploadNutritionDocumentFields,
): Promise<AdminNutritionDocument> {
  await requireClientInScope(deps.db, actor, clientId);
  const pdf = validatePdfUpload({ ...input, maxBytes: deps.maxBytes });
  const storageKey = buildStorageKey({
    visibility: 'PRIVATE',
    purpose: 'nutrition',
    extension: 'pdf',
  });
  await deps.storage.put({
    key: storageKey,
    body: input.bytes,
    contentType: NUTRITION_PDF_MIME_TYPE,
    visibility: 'PRIVATE',
  });
  try {
    const documentId = await deps.db.transaction(async (tx) => {
      await requireClientInScope(tx, actor, clientId);
      await clientLock(tx, clientId);
      const [asset] = await tx
        .insert(M)
        .values({
          kind: 'DOCUMENT',
          purpose: 'NUTRITION',
          visibility: 'PRIVATE',
          storageKey,
          fileName: pdf.fileName,
          mimeType: NUTRITION_PDF_MIME_TYPE,
          sizeBytes: pdf.sizeBytes,
          uploadedByUserId: actor.userId,
        })
        .returning({ id: M.id });
      if (!asset) throw new Error('insert returned nothing');
      const [next] = await tx
        .select({ n: sql<number>`coalesce(max(${N.versionNumber}), 0)::int + 1` })
        .from(N)
        .where(eq(N.clientUserId, clientId));
      const [doc] = await tx
        .insert(N)
        .values({
          clientUserId: clientId,
          mediaAssetId: asset.id,
          title: input.title,
          versionNumber: next?.n ?? 1,
          versionLabel: input.versionLabel ?? null,
          effectiveFrom: input.effectiveFrom ?? null,
          assignedByUserId: actor.userId,
        })
        .returning({ id: N.id });
      if (!doc) throw new Error('insert returned nothing');
      await recordEvent(tx, 'NUTRITION_DOCUMENT_UPLOADED', {
        userId: clientId,
        actorUserId: actor.userId,
        entityId: doc.id,
      });
      return doc.id;
    });
    deps.logger.info({ documentId }, 'nutrition document uploaded');
    return adminDto(deps.db, actor, documentId);
  } catch (error) {
    // No metadata row → no orphaned private object.
    await deps.storage.delete(storageKey, 'PRIVATE').catch(() => undefined);
    throw error;
  }
}

/**
 * Explicit activation in ONE transaction (per-client advisory lock): the previous ACTIVE document
 * becomes ARCHIVED, this one ACTIVE. The partial unique index guarantees that no reader ever sees
 * two ACTIVE documents. A DRAFT or an ARCHIVED version (rollback) can be activated.
 */
export async function activateDocument(
  deps: NutritionDeps,
  actor: Principal,
  documentId: string,
): Promise<ActivateNutritionDocumentResponse> {
  const now = nowOf(deps);
  const archivedDocumentId = await deps.db.transaction(async (tx) => {
    const doc = await scopedDocument(tx, actor, documentId);
    await clientLock(tx, doc.clientUserId);
    const [current] = await tx
      .select({ id: N.id, status: N.status })
      .from(N)
      .where(eq(N.id, documentId))
      .for('update');
    if (!current) throw notFound();
    if (current.status === 'ACTIVE') return null;
    const [previous] = await tx
      .update(N)
      .set({ status: 'ARCHIVED', archivedAt: now })
      .where(and(eq(N.clientUserId, doc.clientUserId), eq(N.status, 'ACTIVE')))
      .returning({ id: N.id });
    await tx
      .update(N)
      .set({ status: 'ACTIVE', activatedAt: now, archivedAt: null })
      .where(eq(N.id, documentId));
    if (previous) {
      await recordEvent(tx, 'NUTRITION_DOCUMENT_ARCHIVED', {
        userId: doc.clientUserId,
        actorUserId: actor.userId,
        entityId: previous.id,
      });
    }
    await recordEvent(tx, 'NUTRITION_DOCUMENT_ACTIVATED', {
      userId: doc.clientUserId,
      actorUserId: actor.userId,
      entityId: documentId,
    });
    return previous?.id ?? null;
  });
  return { document: await adminDto(deps.db, actor, documentId), archivedDocumentId };
}

/** Withdraw an ACTIVE plan (the client then has none) or discard a DRAFT. History is kept. */
export async function archiveDocument(
  deps: NutritionDeps,
  actor: Principal,
  documentId: string,
): Promise<AdminNutritionDocument> {
  const now = nowOf(deps);
  await deps.db.transaction(async (tx) => {
    const doc = await scopedDocument(tx, actor, documentId);
    await clientLock(tx, doc.clientUserId);
    const [updated] = await tx
      .update(N)
      .set({ status: 'ARCHIVED', archivedAt: now })
      .where(and(eq(N.id, documentId), sql`${N.status} <> 'ARCHIVED'`))
      .returning({ id: N.id });
    if (!updated) throw AppError.conflict('Dieser Ernährungsplan ist bereits archiviert.');
    await recordEvent(tx, 'NUTRITION_DOCUMENT_ARCHIVED', {
      userId: doc.clientUserId,
      actorUserId: actor.userId,
      entityId: documentId,
    });
  });
  return adminDto(deps.db, actor, documentId);
}

/**
 * A private file after the authorisation check: on S3 a short-lived signed URL (the client is
 * redirected, the bytes never pass through the API); on the local development driver the bytes.
 */
export type PrivateFile =
  | { kind: 'redirect'; url: string; fileName: string }
  | { kind: 'body'; body: Uint8Array; fileName: string };

async function readPrivate(
  deps: NutritionDeps,
  asset: Pick<AssetRow, 'storageKey' | 'fileName' | 'visibility' | 'purpose'>,
) {
  // Defence in depth: only PRIVATE nutrition assets are ever streamed by these routes.
  if (asset.visibility !== 'PRIVATE' || asset.purpose !== 'NUTRITION') throw notFound();
  const url = await deps.storage.signedUrl(asset.storageKey, 'PRIVATE', {
    expiresInSeconds: deps.privateUrlTtlSeconds ?? 60,
    contentDisposition: pdfContentDisposition(asset.fileName),
    contentType: 'application/pdf',
  });
  if (url) return { kind: 'redirect', url, fileName: asset.fileName } satisfies PrivateFile;
  const object = await deps.storage.get(asset.storageKey, 'PRIVATE');
  if (!object) {
    deps.logger.error({}, 'nutrition document object missing in storage');
    throw notFound();
  }
  return { kind: 'body', body: object.body, fileName: asset.fileName } satisfies PrivateFile;
}

/** Coach/Admin download (any status, scoped). */
export async function documentFile(
  deps: NutritionDeps,
  actor: Principal,
  documentId: string,
): Promise<PrivateFile> {
  const [row] = await deps.db
    .select({ asset: M })
    .from(N)
    .innerJoin(M, eq(M.id, N.mediaAssetId))
    .where(and(eq(N.id, documentId), clientAccessible(actor, N.clientUserId)))
    .limit(1);
  if (!row) throw notFound();
  return readPrivate(deps, row.asset);
}

// ---------------------------------------------------------------------------------------------
// Client (self context)
// ---------------------------------------------------------------------------------------------

async function requireClientAccount(db: DbExecutor, actor: Principal) {
  const [client] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, actor.userId), eq(users.role, 'CLIENT')))
    .limit(1);
  if (!client) throw AppError.notFound('No client account.');
}

export async function clientActiveDocument(
  deps: NutritionDeps,
  actor: Principal,
): Promise<ClientActiveNutritionResponse> {
  await requireClientAccount(deps.db, actor);
  const [row] = await deps.db
    .select({ doc: N, asset: M })
    .from(N)
    .innerJoin(M, eq(M.id, N.mediaAssetId))
    .where(and(eq(N.clientUserId, actor.userId), eq(N.status, 'ACTIVE')))
    .limit(1);
  if (!row) return { document: null };
  return {
    document: {
      id: row.doc.id,
      title: row.doc.title,
      versionNumber: row.doc.versionNumber,
      versionLabel: row.doc.versionLabel,
      effectiveFrom: row.doc.effectiveFrom,
      activatedAt: (row.doc.activatedAt ?? row.doc.createdAt).toISOString(),
      createdAt: row.doc.createdAt.toISOString(),
      file: {
        mimeType: NUTRITION_PDF_MIME_TYPE,
        sizeBytes: row.asset.sizeBytes,
        fileName: row.asset.fileName,
        fileApiPath: filePath('client', row.doc.id),
      },
    },
  };
}

/**
 * The client's own ACTIVE document only. Another client's id, a draft, an archived version or an
 * unknown id are all the same 404.
 */
export async function clientDocumentFile(
  deps: NutritionDeps,
  actor: Principal,
  documentId: string,
): Promise<PrivateFile> {
  await requireClientAccount(deps.db, actor);
  const [row] = await deps.db
    .select({ asset: M })
    .from(N)
    .innerJoin(M, eq(M.id, N.mediaAssetId))
    .where(and(eq(N.id, documentId), eq(N.clientUserId, actor.userId), eq(N.status, 'ACTIVE')))
    .limit(1);
  if (!row) throw notFound();
  return readPrivate(deps, row.asset);
}
