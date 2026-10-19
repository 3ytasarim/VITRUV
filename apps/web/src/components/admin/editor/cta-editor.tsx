'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { CtaFields } from './cta-fields';
import { scopeErrors } from './editor-state';
import { FieldGroup, TextField } from './fields';
import type { EditorProps } from './section-editor';

/** Closing call to action: heading, short text, one action and an optional background medium. */
export function CtaEditor({ value, onChange, errors }: EditorProps<'cta'>) {
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup legend="Text">
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
          maxLength={120}
          value={value.title}
          error={errors.title}
          onChange={(v) => onChange({ ...value, title: v ?? '' })}
        />
        <TextField
          label="Text"
          multiline
          maxLength={400}
          value={value.body}
          error={errors.body}
          onChange={(v) => onChange({ ...value, body: v })}
        />
      </FieldGroup>
      <CtaFields
        legend="Button"
        value={value.action}
        errors={scopeErrors(errors, 'action')}
        onChange={(action) => onChange({ ...value, action })}
      />
      <MediaSlotField
        legend="Hintergrund-Medium"
        kinds={SECTION_MEDIA_KINDS.cta}
        value={value.media}
        errors={scopeErrors(errors, 'media')}
        onChange={(media) => onChange({ ...value, media })}
      />
    </div>
  );
}
