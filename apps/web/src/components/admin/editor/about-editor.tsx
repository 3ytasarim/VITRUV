'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { newItemId, scopeErrors } from './editor-state';
import { FieldGroup, TextField } from './fields';
import { RepeatableList, TextListField } from './repeatable-list';
import type { EditorProps } from './section-editor';

/**
 * About ("Über Philipp"): heading, plain-text paragraphs, short highlights, one medium.
 * Only owner-approved public content belongs here — nothing is imported from private source
 * documents, and the editor never pre-fills biography text.
 */
export function AboutEditor({ value, onChange, errors }: EditorProps<'about'>) {
  return (
    <div className="flex flex-col gap-6">
      <p className="type-body-sm rounded-xs border border-border-subtle px-4 py-3 text-fg-muted">
        Nur freigegebene, öffentliche Inhalte eintragen. Keine Gesundheits-, Familien- oder privaten
        Hintergrundinformationen und keine privaten Fotos.
      </p>
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
          maxLength={120}
          value={value.title}
          error={errors.title}
          onChange={(v) => onChange({ ...value, title: v ?? '' })}
        />
        <TextField
          label="Hervorhebung im Titel (Gold, kursiv)"
          hint="Muss genau so im Titel vorkommen, z. B. „dein“."
          maxLength={60}
          value={value.highlight}
          error={errors.highlight}
          onChange={(v) => onChange({ ...value, highlight: v })}
        />
      </FieldGroup>

      <TextListField
        legend="Text (Absätze)"
        items={value.paragraphs}
        min={1}
        max={8}
        maxLength={1200}
        multiline
        addLabel="Absatz hinzufügen"
        itemLabel={(i) => `Absatz ${i + 1}`}
        errors={scopeErrors(errors, 'paragraphs')}
        onChange={(paragraphs) => onChange({ ...value, paragraphs })}
      />

      <RepeatableList
        heading="Eckdaten"
        addLabel="Eckdatum hinzufügen"
        items={value.highlights}
        max={8}
        error={errors.highlights}
        onChange={(highlights) => onChange({ ...value, highlights })}
        createItem={(existing) => ({ id: newItemId('eckdatum', existing), value: '', label: '' })}
        itemLabel={(item, index) => `Eckdatum ${index + 1}${item.value ? ` · ${item.value}` : ''}`}
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `highlights.${index}`);
          return (
            <div className="grid gap-5 md:grid-cols-2">
              <TextField
                label="Wert"
                required
                maxLength={24}
                value={item.value}
                error={e.value}
                onChange={(v) => update({ value: v ?? '' })}
              />
              <TextField
                label="Bezeichnung"
                required
                maxLength={80}
                value={item.label}
                error={e.label}
                onChange={(v) => update({ label: v ?? '' })}
              />
            </div>
          );
        }}
      />

      <MediaSlotField
        legend="Porträt / Medium"
        kinds={SECTION_MEDIA_KINDS.about}
        value={value.media}
        errors={scopeErrors(errors, 'media')}
        onChange={(media) => onChange({ ...value, media })}
      />
      <MediaSlotField
        legend="Detailbild (optional: Training, Natur, Ritual)"
        kinds={['IMAGE']}
        value={value.detailMedia ?? null}
        errors={scopeErrors(errors, 'detailMedia')}
        onChange={(detailMedia) => onChange({ ...value, detailMedia })}
      />
    </div>
  );
}
