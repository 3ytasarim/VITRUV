'use client';

import type { AdminMediaAsset, ExerciseMedia } from '@vitruv/contracts';
import { ImageIcon, TriangleAlert, Video, X } from 'lucide-react';
import { useState } from 'react';
import { MediaPicker } from '@/components/admin/media/media-picker';
import { Button } from '@/components/ui';

/**
 * Sprint 7 — the optional video/image of ONE plan row (template exercise or one client's
 * assignment). Only the asset id is sent (`mediaAssetId`); without a row medium the app shows the
 * exercise's library medium. Picking/uploading uses the TRAINING media library (same picker as
 * the exercise library); removing here only unlinks — the file itself is never deleted.
 */

/** Formats an iPhone (AVPlayer) cannot play. MP4 with H.264 is the safe choice. */
export function iphoneIncompatible(media: Pick<ExerciseMedia, 'kind' | 'mimeType'>): boolean {
  return media.kind === 'VIDEO' && media.mimeType !== undefined && media.mimeType !== 'video/mp4';
}

export function mediaOfAsset(asset: AdminMediaAsset): ExerciseMedia {
  return {
    assetId: asset.id,
    kind: asset.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
    url: asset.url,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
  };
}

export function RowMediaField({
  exerciseName,
  media,
  libraryHasMedia,
  disabled = false,
  error,
  onChange,
}: {
  exerciseName: string;
  /** This row's own medium; null = none (the library medium applies, if any). */
  media: ExerciseMedia | null;
  libraryHasMedia: boolean;
  disabled?: boolean;
  error?: string;
  onChange: (media: ExerciseMedia | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={`Video für ${exerciseName}`}>
      <span className="type-body-sm font-semibold">
        Video / Bild <span className="type-caption ml-2 text-fg-subtle">optional</span>
      </span>
      {media ? (
        <p className="type-body-sm flex items-center gap-2 break-all">
          {media.kind === 'VIDEO' ? (
            <Video aria-hidden className="size-4 shrink-0" />
          ) : (
            <ImageIcon aria-hidden className="size-4 shrink-0" />
          )}
          {media.kind === 'VIDEO' ? (
            <a href={media.url} target="_blank" rel="noreferrer" className="underline">
              {media.fileName}
            </a>
          ) : (
            media.fileName
          )}
        </p>
      ) : (
        <p className="type-body-sm text-fg-muted">
          {libraryHasMedia
            ? 'Kein eigenes Video — die App zeigt das Medium aus der Übungsbibliothek.'
            : 'Kein Video zugewiesen.'}
        </p>
      )}
      {media && iphoneIncompatible(media) && (
        <p role="note" className="type-body-sm flex items-start gap-2 text-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Dieses Video kann auf dem iPhone nicht abgespielt werden. Bitte als MP4 (H.264) hochladen.
        </p>
      )}
      {!disabled && (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            aria-label={`${media ? 'Video ersetzen' : 'Video wählen'}: ${exerciseName}`}
            onClick={() => setPickerOpen(true)}
          >
            {media ? 'Video ersetzen' : 'Video wählen'}
          </Button>
          {media && (
            <Button
              type="button"
              variant="ghost"
              icon={<X aria-hidden />}
              aria-label={`Video entfernen: ${exerciseName}`}
              onClick={() => onChange(null)}
            >
              Video entfernen
            </Button>
          )}
        </div>
      )}
      {error && <p className="type-body-sm text-error">{error}</p>}
      <MediaPicker
        open={pickerOpen}
        title={`Video für ${exerciseName}`}
        kinds={['VIDEO', 'IMAGE']}
        library="TRAINING"
        selectedId={media?.assetId}
        onSelect={(asset) => {
          onChange(mediaOfAsset(asset));
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
