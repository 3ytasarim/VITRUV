'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { newItemId, scopeErrors } from './editor-state';
import { FieldGroup, TextField } from './fields';
import { RepeatableList } from './repeatable-list';
import type { EditorProps } from './section-editor';

/** Coaching: section heading, ordered feature cards (title + text) and one section medium. */
export function CoachingEditor({ value, onChange, errors }: EditorProps<'coaching'>) {
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
        heading="Leistungen"
        addLabel="Leistung hinzufügen"
        items={value.features}
        max={12}
        error={errors.features}
        onChange={(features) => onChange({ ...value, features })}
        createItem={(existing) => ({
          id: newItemId('leistung', existing),
          title: '',
          description: '',
        })}
        itemLabel={(item, index) => `Leistung ${index + 1}${item.title ? ` · ${item.title}` : ''}`}
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `features.${index}`);
          return (
            <>
              <TextField
                label="Titel"
                required
                maxLength={80}
                value={item.title}
                error={e.title}
                onChange={(v) => update({ title: v ?? '' })}
              />
              <TextField
                label="Beschreibung"
                required
                multiline
                maxLength={400}
                value={item.description}
                error={e.description}
                onChange={(v) => update({ description: v ?? '' })}
              />
              <MediaSlotField
                legend={'Icon Leistung ' + (index + 1) + ' (optional)'}
                kinds={['IMAGE']}
                value={item.icon ?? null}
                errors={scopeErrors(e, 'icon')}
                onChange={(icon) => update({ icon })}
              />
              <MediaSlotField
                legend={'Kartenbild Leistung ' + (index + 1) + ' (grau, farbig beim Hover)'}
                kinds={['IMAGE']}
                value={item.media ?? null}
                errors={scopeErrors(e, 'media')}
                onChange={(media) => update({ media })}
              />
            </>
          );
        }}
      />

      <MediaSlotField
        legend="Medium des Bereichs"
        kinds={SECTION_MEDIA_KINDS.coaching}
        value={value.media}
        errors={scopeErrors(errors, 'media')}
        onChange={(media) => onChange({ ...value, media })}
      />
    </div>
  );
}
