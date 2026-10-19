'use client';

import type { Cta } from '@vitruv/contracts';
import type { FieldErrors } from './editor-state';
import { FieldGroup, TextField } from './fields';

/** Label + link of a call to action. The link is validated by the shared `ctaSchema`. */
export function CtaFields({
  legend,
  value,
  onChange,
  errors,
}: {
  legend: string;
  value: Cta;
  onChange: (value: Cta) => void;
  errors: FieldErrors;
}) {
  return (
    <FieldGroup legend={legend}>
      <LinkFields value={value} onChange={onChange} errors={errors} labelText="Beschriftung" />
    </FieldGroup>
  );
}

/** The two inputs of a link (used by CTAs and footer links). */
export function LinkFields<T extends { label: string; href: string }>({
  value,
  onChange,
  errors,
  labelText = 'Beschriftung',
}: {
  value: T;
  onChange: (value: T) => void;
  errors: FieldErrors;
  labelText?: string;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <TextField
        label={labelText}
        required
        maxLength={40}
        value={value.label}
        error={errors.label}
        onChange={(label) => onChange({ ...value, label: label ?? '' })}
      />
      <TextField
        label="Link"
        required
        inputMode="url"
        placeholder="/kontakt, #faq oder https://…"
        hint="Interne Pfade, #Anker, https://, mailto: oder tel:"
        value={value.href}
        error={errors.href}
        onChange={(href) => onChange({ ...value, href: href ?? '' })}
      />
    </div>
  );
}
