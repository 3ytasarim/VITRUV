'use client';

import type { FieldErrors } from './editor-state';
import { FieldGroup, TextField } from './fields';

interface MethodHeading {
  eyebrow?: string;
  title: string;
  highlight?: string;
  intro?: string;
}

/**
 * Shared heading block of the method sections (Drei Säulen, Lebenssituationen, Neun Stufen):
 * eyebrow, title, gold highlight phrase and introduction — one implementation, three editors.
 */
export function MethodHeadingFields<T extends MethodHeading>({
  value,
  onChange,
  errors,
  titleMax = 120,
}: {
  value: T;
  onChange: (value: T) => void;
  errors: FieldErrors;
  titleMax?: number;
}) {
  return (
    <FieldGroup legend="Abschnitt">
      <TextField
        label="Eyebrow"
        maxLength={60}
        value={value.eyebrow}
        error={errors.eyebrow}
        onChange={(v) => onChange({ ...value, eyebrow: v })}
      />
      <TextField
        label="Titel"
        required
        maxLength={titleMax}
        value={value.title}
        error={errors.title}
        onChange={(v) => onChange({ ...value, title: v ?? '' })}
      />
      <TextField
        label="Hervorhebung im Titel (Gold, kursiv)"
        hint="Muss genau so im Titel vorkommen."
        maxLength={60}
        value={value.highlight}
        error={errors.highlight}
        onChange={(v) => onChange({ ...value, highlight: v })}
      />
      <TextField
        label="Einleitung"
        multiline
        maxLength={600}
        value={value.intro}
        error={errors.intro}
        onChange={(v) => onChange({ ...value, intro: v })}
      />
    </FieldGroup>
  );
}
