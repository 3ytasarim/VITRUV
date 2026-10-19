'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { newItemId, scopeErrors } from './editor-state';
import { CheckboxField, FieldGroup, TextField } from './fields';
import { RepeatableList } from './repeatable-list';
import type { EditorProps } from './section-editor';

/**
 * Journey ("Dein Weg"): section heading + an ordered list of stages. Order = display order
 * ("01", "02" … are derived from position). Stage IDs are stable and never shown or edited.
 */
export function JourneyEditor({ value, onChange, errors }: EditorProps<'journey'>) {
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup legend="Abschnitt">
        <TextField
          label="Eyebrow"
          required
          maxLength={60}
          value={value.eyebrow}
          error={errors.eyebrow}
          onChange={(v) => onChange({ ...value, eyebrow: v ?? '' })}
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
          value={value.lead}
          error={errors.lead}
          onChange={(v) => onChange({ ...value, lead: v })}
        />
      </FieldGroup>

      <RepeatableList
        heading="Etappen"
        addLabel="Etappe hinzufügen"
        items={value.stages}
        min={1}
        max={8}
        error={errors.stages}
        onChange={(stages) => onChange({ ...value, stages })}
        createItem={(existing) => ({
          id: newItemId('etappe', existing),
          name: '',
          title: '',
          description: '',
          media: null,
          enabled: true,
        })}
        itemLabel={(stage, index) =>
          `Etappe ${String(index + 1).padStart(2, '0')}${stage.name ? ` · ${stage.name}` : ''}${stage.enabled ? '' : ' (ausgeblendet)'}`
        }
        renderItem={(stage, index, update) => {
          const e = scopeErrors(errors, `stages.${index}`);
          return (
            <>
              <CheckboxField
                label="Auf der Website anzeigen"
                checked={stage.enabled}
                onChange={(enabled) => update({ enabled })}
              />
              <div className="grid gap-5 md:grid-cols-2">
                <TextField
                  label="Name"
                  required
                  maxLength={40}
                  value={stage.name}
                  error={e.name}
                  onChange={(v) => update({ name: v ?? '' })}
                />
                <TextField
                  label="Titel"
                  required
                  maxLength={120}
                  value={stage.title}
                  error={e.title}
                  onChange={(v) => update({ title: v ?? '' })}
                />
              </div>
              <TextField
                label="Beschreibung"
                required
                multiline
                maxLength={600}
                value={stage.description}
                error={e.description}
                onChange={(v) => update({ description: v ?? '' })}
              />
              <MediaSlotField
                legend={`Medium Etappe ${String(index + 1).padStart(2, '0')}`}
                kinds={SECTION_MEDIA_KINDS.journey}
                value={stage.media}
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
