'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { CtaFields } from './cta-fields';
import { scopeErrors } from './editor-state';
import { CheckboxField, FieldGroup, TextField } from './fields';
import type { EditorProps } from './section-editor';

/** Hero: headline block, two calls to action, background image/video (desktop/mobile/poster). */
export function HeroEditor({ value, onChange, errors }: EditorProps<'hero'>) {
  const set = <K extends keyof typeof value>(key: K, next: (typeof value)[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup legend="Text">
        <TextField
          label="Eyebrow"
          maxLength={60}
          value={value.eyebrow}
          error={errors.eyebrow}
          onChange={(v) => set('eyebrow', v)}
        />
        <TextField
          label="Titel"
          required
          maxLength={120}
          value={value.title}
          error={errors.title}
          onChange={(v) => set('title', v ?? '')}
        />
        <TextField
          label="Hervorhebung"
          hint="Teil des Titels, der betont dargestellt wird."
          maxLength={60}
          value={value.highlight}
          error={errors.highlight}
          onChange={(v) => set('highlight', v)}
        />
        <TextField
          label="Text"
          multiline
          maxLength={400}
          value={value.body}
          error={errors.body}
          onChange={(v) => set('body', v)}
        />
      </FieldGroup>

      <CtaFields
        legend="Primärer Button"
        value={value.primaryCta}
        errors={scopeErrors(errors, 'primaryCta')}
        onChange={(cta) => set('primaryCta', cta)}
      />

      <CheckboxField
        label="Zweiten Button anzeigen"
        checked={Boolean(value.secondaryCta)}
        onChange={(checked) => set('secondaryCta', checked ? { label: '', href: '' } : undefined)}
      />
      {value.secondaryCta && (
        <CtaFields
          legend="Zweiter Button"
          value={value.secondaryCta}
          errors={scopeErrors(errors, 'secondaryCta')}
          onChange={(cta) => set('secondaryCta', cta)}
        />
      )}

      <MediaSlotField
        legend="Hintergrund-Medium"
        kinds={SECTION_MEDIA_KINDS.hero}
        value={value.media}
        errors={scopeErrors(errors, 'media')}
        onChange={(media) => set('media', media)}
      />
    </div>
  );
}
