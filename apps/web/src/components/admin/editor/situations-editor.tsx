'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { newItemId, scopeErrors } from './editor-state';
import { TextField } from './fields';
import { MethodHeadingFields } from './method-heading-fields';
import { RepeatableList } from './repeatable-list';
import type { EditorProps } from './section-editor';

/** Lebenssituationen: heading, icon cards (title, optional sentence, line icon), closing line. */
export function SituationsEditor({ value, onChange, errors }: EditorProps<'situations'>) {
  return (
    <div className="flex flex-col gap-6">
      <MethodHeadingFields value={value} onChange={onChange} errors={errors} titleMax={160} />
      <RepeatableList
        heading="Situationen"
        addLabel="Situation hinzufügen"
        items={value.items}
        max={16}
        error={errors.items}
        onChange={(items) => onChange({ ...value, items })}
        createItem={(existing) => ({
          id: newItemId('situation', existing),
          title: '',
          icon: null,
        })}
        itemLabel={(item, index) => `Situation ${index + 1}${item.title ? ` · ${item.title}` : ''}`}
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `items.${index}`);
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
                label="Kurzer Satz (optional)"
                multiline
                maxLength={300}
                value={item.description}
                error={e.description}
                onChange={(v) => update({ description: v })}
              />
              <MediaSlotField
                legend={`Icon Situation ${index + 1}`}
                kinds={SECTION_MEDIA_KINDS.situations}
                value={item.icon}
                errors={scopeErrors(e, 'icon')}
                onChange={(icon) => update({ icon })}
              />
            </>
          );
        }}
      />
      <TextField
        label="Abschlusssatz unter dem Raster (optional)"
        multiline
        maxLength={400}
        value={value.outro}
        error={errors.outro}
        onChange={(v) => onChange({ ...value, outro: v })}
      />
    </div>
  );
}
