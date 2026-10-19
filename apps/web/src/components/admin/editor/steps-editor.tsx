'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { newItemId, scopeErrors } from './editor-state';
import { TextField } from './fields';
import { MethodHeadingFields } from './method-heading-fields';
import { RepeatableList } from './repeatable-list';
import type { EditorProps } from './section-editor';

/**
 * Neun Stufen: heading and ordered steps. Steps with the same "Säule" label form one column on
 * the website (order of first appearance), numbered 01–09 in list order.
 */
export function StepsEditor({ value, onChange, errors }: EditorProps<'steps'>) {
  return (
    <div className="flex flex-col gap-6">
      <MethodHeadingFields value={value} onChange={onChange} errors={errors} />
      <RepeatableList
        heading="Stufen"
        addLabel="Stufe hinzufügen"
        items={value.items}
        max={12}
        error={errors.items}
        onChange={(items) => onChange({ ...value, items })}
        createItem={(existing) => ({
          id: newItemId('stufe', existing),
          group: existing.at(-1)?.group ?? '',
          title: '',
          description: '',
          icon: null,
        })}
        itemLabel={(item, index) =>
          `Stufe ${index + 1}${item.group ? ` · ${item.group}` : ''}${item.title ? ` · ${item.title}` : ''}`
        }
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `items.${index}`);
          return (
            <>
              <TextField
                label="Säule (Gruppe)"
                hint="z. B. Körper, Seele oder Geist — gleiche Bezeichnung = gleiche Spalte."
                required
                maxLength={40}
                value={item.group}
                error={e.group}
                onChange={(v) => update({ group: v ?? '' })}
              />
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
                legend={`Icon Stufe ${index + 1}`}
                kinds={SECTION_MEDIA_KINDS.steps}
                value={item.icon}
                errors={scopeErrors(e, 'icon')}
                onChange={(icon) => update({ icon })}
              />
            </>
          );
        }}
      />
    </div>
  );
}
