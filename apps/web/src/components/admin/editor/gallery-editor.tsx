'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { newItemId, scopeErrors } from './editor-state';
import { CheckboxField, TextField } from './fields';
import { MethodHeadingFields } from './method-heading-fields';
import { RepeatableList } from './repeatable-list';
import type { EditorProps } from './section-editor';

/** Gallery (kinetic photo reel): heading, photos from the Media Library with an optional caption. */
export function GalleryEditor({ value, onChange, errors }: EditorProps<'gallery'>) {
  return (
    <div className="flex flex-col gap-6">
      <MethodHeadingFields value={value} onChange={onChange} errors={errors} titleMax={160} />
      <CheckboxField
        label="Automatisch weiterblättern (pausiert bei Maus/Fokus und bei reduzierter Bewegung)"
        checked={value.autoplay}
        onChange={(autoplay) => onChange({ ...value, autoplay })}
      />
      <RepeatableList
        heading="Fotos"
        addLabel="Foto hinzufügen"
        items={value.items}
        max={24}
        error={errors.items}
        onChange={(items) => onChange({ ...value, items })}
        createItem={(existing) => ({ id: newItemId('foto', existing), media: null })}
        itemLabel={(item, index) => `Foto ${index + 1}${item.title ? ` · ${item.title}` : ''}`}
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `items.${index}`);
          return (
            <>
              <MediaSlotField
                legend={`Foto ${index + 1}`}
                kinds={SECTION_MEDIA_KINDS.gallery}
                value={item.media}
                errors={scopeErrors(e, 'media')}
                onChange={(media) => update({ media })}
              />
              <TextField
                label="Titel auf dem Foto (optional)"
                maxLength={60}
                value={item.title}
                error={e.title}
                onChange={(v) => update({ title: v })}
              />
              <TextField
                label="Kleiner Text darunter (optional)"
                maxLength={160}
                value={item.caption}
                error={e.caption}
                onChange={(v) => update({ caption: v })}
              />
            </>
          );
        }}
      />
    </div>
  );
}
