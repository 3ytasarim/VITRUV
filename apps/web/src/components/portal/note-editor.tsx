'use client';

import { WORKOUT_NOTE_MAX_LENGTH } from '@vitruv/contracts';
import { Check } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { saveNoteAction } from '@/app/mein-training/actions';
import { Button } from '@/components/ui';

/**
 * The client's own note under one exercise (exerciseId) or on the whole session (null).
 * Saved explicitly ("Notiz speichern"); an emptied note is removed. The coach reads it only.
 */
export function NoteEditor({
  sessionId,
  exerciseId,
  initial,
  label,
  placeholder,
}: {
  sessionId: string;
  exerciseId: string | null;
  initial: string | null;
  label: string;
  placeholder: string;
}) {
  const id = useId();
  const [value, setValue] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');
  const [status, setStatus] = useState<'idle' | 'saved' | { error: string }>('idle');
  const [pending, start] = useTransition();
  const dirty = value.trim() !== saved.trim();
  const tooLong = value.length > WORKOUT_NOTE_MAX_LENGTH;

  const save = () =>
    start(async () => {
      const result = await saveNoteAction(sessionId, exerciseId, value);
      if (!result.ok) {
        setStatus({ error: result.message });
        return;
      }
      const stored = result.data.clientNote ?? '';
      setValue(stored);
      setSaved(stored);
      setStatus('saved');
    });

  return (
    <div className="vt-portal__note flex flex-col gap-2">
      <label htmlFor={id} className="type-body-sm font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        className="vt-input type-body-sm min-h-24"
        value={value}
        placeholder={placeholder}
        rows={3}
        aria-describedby={`${id}-hint`}
        aria-invalid={tooLong || undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus('idle');
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          id={`${id}-hint`}
          className={tooLong ? 'type-body-sm text-error' : 'type-body-sm text-fg-subtle'}
        >
          Dein Coach kann diese Notiz lesen. {value.length} / {WORKOUT_NOTE_MAX_LENGTH}
        </p>
        <div className="flex items-center gap-3">
          <span role="status" aria-live="polite" className="type-body-sm">
            {status === 'saved' && !dirty ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check aria-hidden className="size-4" /> Gespeichert
              </span>
            ) : typeof status === 'object' ? (
              <span className="text-error">{status.error}</span>
            ) : null}
          </span>
          <Button variant="secondary" loading={pending} disabled={!dirty || tooLong} onClick={save}>
            {saved && !value.trim() ? 'Notiz löschen' : 'Notiz speichern'}
          </Button>
        </div>
      </div>
    </div>
  );
}
