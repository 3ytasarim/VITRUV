'use client';

import { adminMediaAssetSchema, apiErrorSchema, type AdminMediaAsset } from '@vitruv/contracts';
import { FileUp, Upload } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { acceptAttribute, formatBytes, precheckUpload, uploadLimitHint } from './media-format';

type UploadResult = { status: number; body: unknown };

/**
 * POST with upload progress. fetch() has no upload progress events, XMLHttpRequest does.
 * Same-origin request: the browser sends the HttpOnly session cookie and the Origin header.
 */
function postWithProgress(
  url: string,
  form: FormData,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/**
 * Upload form shared by the media library and the media picker (one implementation).
 * Posts multipart to the same-origin proxy (/admin/api/media); the API validates everything.
 */
export function MediaUploadForm({
  kinds = ['IMAGE', 'VIDEO'],
  onUploaded,
  compact = false,
  endpoint = '/admin/api/media',
  replaceId,
}: {
  kinds?: readonly ('IMAGE' | 'VIDEO')[];
  /** Same-origin upload proxy: website library (default) or training library. */
  endpoint?: '/admin/api/media' | '/admin/api/training-media';
  onUploaded: (asset: AdminMediaAsset) => void;
  compact?: boolean;
  /** Replace the FILE of this asset (same id, every reference shows the new file). */
  replaceId?: string;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  // Bytes sent so far; null = no upload running. "sent" = waiting for server-side processing.
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // React bubbles synthetic events along the component tree (also out of portals): never let
    // this upload submit reach an enclosing editor form.
    event.stopPropagation();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage({ tone: 'error', text: 'Bitte eine Datei auswählen.' });
      return;
    }
    const problem = precheckUpload(file, kinds);
    if (problem) {
      setMessage({ tone: 'error', text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    setProgress({ loaded: 0, total: file.size });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const form = new FormData();
      // Text fields first: the server reads the multipart stream in order.
      if (altText.trim()) form.append('altText', altText.trim());
      form.append('file', file);
      const res = await postWithProgress(
        replaceId ? `${endpoint}/${encodeURIComponent(replaceId)}/replace` : endpoint,
        form,
        (loaded, total) => setProgress({ loaded, total }),
        controller.signal,
      );
      const body = res.body;
      const asset = adminMediaAssetSchema.safeParse(body);
      if (res.status < 200 || res.status >= 300 || !asset.success) {
        const error = apiErrorSchema.safeParse(body);
        setMessage({
          tone: 'error',
          text: error.success
            ? error.data.error.message
            : res.status === 413
              ? 'Datei zu groß für den Server.'
              : 'Upload fehlgeschlagen.',
        });
        return;
      }
      setMessage({
        tone: 'success',
        text: replaceId
          ? `Datei ersetzt durch „${asset.data.fileName}“.`
          : `„${asset.data.fileName}“ wurde hochgeladen.`,
      });
      setAltText('');
      if (fileRef.current) fileRef.current.value = '';
      setFileName('');
      onUploaded(asset.data);
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Upload abgebrochen.'
            : 'Upload fehlgeschlagen (keine Verbindung).',
      });
    } finally {
      abortRef.current = null;
      setProgress(null);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={busy || undefined}>
      <div className={compact ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-2'}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-file`} className="type-body-sm font-semibold">
            Datei
          </label>
          {/* Drop zone (pattern from CleanServisi's DocumentDropzone): the real file input covers
              the zone, so click, keyboard, drag & drop and screen readers all use the native
              control; the zone only adds the visual target and the chosen file name. */}
          <div className="vt-dropzone" data-dragging={dragging || undefined}>
            <input
              ref={fileRef}
              id={`${id}-file`}
              name="file"
              type="file"
              accept={acceptAttribute(kinds)}
              className="vt-dropzone__input"
              aria-describedby={`${id}-file-hint`}
              onChange={(event) => {
                setFileName(event.target.files?.[0]?.name ?? '');
                setDragging(false);
              }}
              onDragEnter={() => setDragging(true)}
              onDragLeave={() => setDragging(false)}
              onDrop={() => setDragging(false)}
            />
            <span aria-hidden className="vt-state-icon">
              <FileUp className="size-5" strokeWidth={1.6} />
            </span>
            <span aria-hidden className="type-body-sm text-fg">
              <strong className="font-semibold">Datei auswählen</strong> oder hierher ziehen
            </span>
            <span aria-live="polite" className="type-body-sm max-w-full truncate text-fg-muted">
              {fileName ? `Ausgewählt: ${fileName}` : 'Noch keine Datei gewählt'}
            </span>
          </div>
          <p id={`${id}-file-hint`} className="type-caption text-fg-subtle">
            {uploadLimitHint(kinds)}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-alt`} className="type-body-sm font-semibold">
            Alt-Text{' '}
            <span className="type-caption ml-2 text-fg-subtle">
              {replaceId ? 'leer lassen = bisheriger bleibt' : 'für Bilder empfohlen'}
            </span>
          </label>
          <input
            id={`${id}-alt`}
            className="vt-input type-body-sm"
            value={altText}
            maxLength={300}
            onChange={(event) => setAltText(event.target.value)}
            placeholder="Was ist auf dem Bild zu sehen?"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="secondary" icon={<Upload />} loading={busy}>
          {replaceId ? 'Datei ersetzen' : 'Hochladen'}
        </Button>
        {busy && (
          <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>
            Abbrechen
          </Button>
        )}
        <p
          role="status"
          aria-live="polite"
          className={
            message?.tone === 'error' ? 'type-body-sm text-error' : 'type-body-sm text-success'
          }
        >
          {message?.text}
        </p>
      </div>
      {progress && (
        <div className="flex flex-col gap-1.5">
          <progress
            className="vt-upload-progress"
            max={progress.total || 1}
            value={progress.loaded}
            aria-label="Upload-Fortschritt"
          />
          <p className="type-caption text-fg-muted" aria-live="polite">
            {progress.loaded >= progress.total
              ? 'Hochgeladen – wird geprüft und gespeichert …'
              : `${Math.floor((progress.loaded / (progress.total || 1)) * 100)} % · ${formatBytes(progress.loaded)} von ${formatBytes(progress.total)}`}
          </p>
        </div>
      )}
    </form>
  );
}
