'use client';

import type { AdminExercise, AdminMediaAsset } from '@vitruv/contracts';
import { ImageIcon, Video, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { TrainingResult } from '@/app/admin/training-actions';
import { FormField } from '@/components/admin/management/form-field';
import { MediaPicker } from '@/components/admin/media/media-picker';
import { Button } from '@/components/ui';

type Action = (
  prev: TrainingResult<AdminExercise> | null,
  form: FormData,
) => Promise<TrainingResult<AdminExercise>>;

/**
 * Exercise create/edit. Media comes from the TRAINING media library (same media system as the
 * website, separate permissions); only the asset id is stored on the exercise.
 */
export function ExerciseForm({
  action,
  exercise,
  submitLabel,
}: {
  action: Action;
  exercise?: AdminExercise;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<{ assetId: string; kind: string; fileName: string } | null>(
    exercise?.media ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state) statusRef.current?.focus();
  }, [state]);

  // Never lose typed changes silently.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const error = (field: string) => (state && !state.ok ? state.fieldErrors[field] : undefined);
  const choose = (asset: AdminMediaAsset) => {
    setMedia({ assetId: asset.id, kind: asset.kind, fileName: asset.fileName });
    setDirty(true);
  };

  // The picker contains its own upload <form>; it must not be nested inside this form.
  return (
    <>
      <form
        action={(form) => {
          setDirty(false);
          formAction(form);
        }}
        onInput={() => setDirty(true)}
        noValidate
        className="flex max-w-measure flex-col gap-5"
      >
        <div
          ref={statusRef}
          tabIndex={-1}
          role={state && !state.ok ? 'alert' : 'status'}
          className={
            state && !state.ok
              ? 'rounded-xs border border-error px-4 py-3'
              : state?.ok
                ? 'rounded-xs border border-success px-4 py-3'
                : 'sr-only'
          }
        >
          {state && !state.ok && <p className="type-body-sm font-semibold">{state.message}</p>}
          {state?.ok && <p className="type-body-sm font-semibold">Übung gespeichert.</p>}
          {!state && dirty && <p>Ungespeicherte Änderungen</p>}
        </div>
        <FormField
          label="Name"
          required
          error={error('name')}
          hint="Eindeutig in der gemeinsamen Übungsbibliothek, z. B. „Goblet Squat“."
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="name"
              required
              maxLength={120}
              defaultValue={exercise?.name}
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
        <FormField
          label="Beschreibung / Standard-Ausführung"
          error={error('description')}
          hint="Wird bei jeder Verwendung angezeigt, sofern der Plan keine eigene Anleitung vorgibt."
        >
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              name="description"
              rows={4}
              maxLength={4000}
              defaultValue={exercise?.description ?? ''}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="type-body-sm mb-1 font-semibold">
            Medium <span className="type-caption ml-2 text-fg-subtle">optional</span>
          </legend>
          <input type="hidden" name="mediaAssetId" value={media?.assetId ?? ''} />
          {media ? (
            <p className="type-body-sm flex items-center gap-2 break-all">
              {media.kind === 'VIDEO' ? (
                <Video aria-hidden className="size-4 shrink-0" />
              ) : (
                <ImageIcon aria-hidden className="size-4 shrink-0" />
              )}
              {media.fileName}
            </p>
          ) : (
            <p className="type-body-sm text-fg-muted">Kein Medium zugewiesen.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              {media ? 'Medium ändern' : 'Medium wählen'}
            </Button>
            {media && (
              <Button
                variant="ghost"
                icon={<X aria-hidden />}
                onClick={() => {
                  setMedia(null);
                  setDirty(true);
                }}
              >
                Medium entfernen
              </Button>
            )}
          </div>
          {error('mediaAssetId') && (
            <p className="type-body-sm text-error">{error('mediaAssetId')}</p>
          )}
        </fieldset>
        <Button type="submit" variant="primary" loading={pending} className="self-start">
          {submitLabel}
        </Button>
      </form>
      <MediaPicker
        open={pickerOpen}
        title="Trainings-Mediathek"
        kinds={['IMAGE', 'VIDEO']}
        library="TRAINING"
        selectedId={media?.assetId}
        onSelect={choose}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
