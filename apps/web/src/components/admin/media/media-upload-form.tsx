'use client';

import { adminMediaAssetSchema, apiErrorSchema, type AdminMediaAsset } from '@vitruv/contracts';
import { FileUp, Upload } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { acceptAttribute, precheckUpload } from './media-format';

/**
 * Upload form shared by the media library and the media picker (one implementation).
 * Posts multipart to the same-origin proxy (/admin/api/media); the API validates everything.
 */
export function MediaUploadForm({
  kinds = ['IMAGE', 'VIDEO'],
  onUploaded,
  compact = false,
  endpoint = '/admin/api/media',
}: {
  kinds?: readonly ('IMAGE' | 'VIDEO')[];
  /** Same-origin upload proxy: website library (default) or training library. */
  endpoint?: '/admin/api/media' | '/admin/api/training-media';
  onUploaded: (asset: AdminMediaAsset) => void;
  compact?: boolean;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

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
    try {
      const form = new FormData();
      form.append('file', file);
      if (altText.trim()) form.append('altText', altText.trim());
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const body: unknown = await res.json().catch(() => null);
      const asset = adminMediaAssetSchema.safeParse(body);
      if (!res.ok || !asset.success) {
        const error = apiErrorSchema.safeParse(body);
        setMessage({
          tone: 'error',
          text: error.success ? error.data.error.message : 'Upload fehlgeschlagen.',
        });
        return;
      }
      setMessage({ tone: 'success', text: `„${asset.data.fileName}“ wurde hochgeladen.` });
      setAltText('');
      if (fileRef.current) fileRef.current.value = '';
      setFileName('');
      onUploaded(asset.data);
    } catch {
      setMessage({ tone: 'error', text: 'Upload fehlgeschlagen (keine Verbindung).' });
    } finally {
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
            {kinds.includes('VIDEO') && kinds.includes('IMAGE')
              ? 'Bilder: JPEG, PNG, WebP, AVIF (max. 20 MB) · Videos: MP4 (H.264), WebM (max. 100 MB)'
              : kinds.includes('VIDEO')
                ? 'MP4 (H.264) oder WebM, max. 100 MB'
                : 'JPEG, PNG, WebP oder AVIF, max. 20 MB'}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-alt`} className="type-body-sm font-semibold">
            Alt-Text <span className="type-caption ml-2 text-fg-subtle">für Bilder empfohlen</span>
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
          Hochladen
        </Button>
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
    </form>
  );
}
