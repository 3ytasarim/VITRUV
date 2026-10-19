'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { newItemId, scopeErrors } from './editor-state';
import { FieldGroup, TextField } from './fields';
import { RepeatableList } from './repeatable-list';
import type { EditorProps } from './section-editor';

/**
 * Results: section heading + up to 12 result items (headline figure, label, optional text and
 * image). Fictional/approved content only — never real client data without consent.
 */
export function ResultsEditor({ value, onChange, errors }: EditorProps<'results'>) {
  return (
    <div className="flex flex-col gap-6">
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
          label="Einleitung"
          multiline
          maxLength={400}
          value={value.intro}
          error={errors.intro}
          onChange={(v) => onChange({ ...value, intro: v })}
        />
      </FieldGroup>

      <RepeatableList
        heading="Ergebnisse"
        addLabel="Ergebnis hinzufügen"
        items={value.items}
        max={12}
        error={errors.items}
        emptyText="Noch keine Ergebnisse. Der Bereich zeigt dann nur Titel und Einleitung."
        onChange={(items) => onChange({ ...value, items })}
        createItem={(existing) => ({
          id: newItemId('ergebnis', existing),
          value: '',
          label: '',
          media: null,
        })}
        itemLabel={(item, index) => `Ergebnis ${index + 1}${item.value ? ` · ${item.value}` : ''}`}
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `items.${index}`);
          return (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <TextField
                  label="Kennzahl"
                  required
                  maxLength={24}
                  hint="Kurz, z. B. „8 Wochen“."
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
              <TextField
                label="Beschreibung"
                multiline
                maxLength={300}
                value={item.description}
                error={e.description}
                onChange={(v) => update({ description: v })}
              />
              <MediaSlotField
                legend={`Bild Ergebnis ${index + 1}`}
                kinds={SECTION_MEDIA_KINDS.results}
                value={item.media}
                errors={scopeErrors(e, 'media')}
                onChange={(media) => update({ media })}
              />
            </>
          );
        }}
      />
    </div>
  );
}
