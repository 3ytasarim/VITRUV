'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { newItemId, scopeErrors } from './editor-state';
import { TextField } from './fields';
import { MethodHeadingFields } from './method-heading-fields';
import { RepeatableList, TextListField } from './repeatable-list';
import type { EditorProps } from './section-editor';

/**
 * Drei Säulen: heading and up to three pillars — name, display title, keyword line, lead,
 * paragraphs, facets (label + text) and the illustration shown in the sticky stage.
 */
export function PillarsEditor({ value, onChange, errors }: EditorProps<'pillars'>) {
  return (
    <div className="flex flex-col gap-6">
      <MethodHeadingFields value={value} onChange={onChange} errors={errors} />
      <RepeatableList
        heading="Säulen"
        addLabel="Säule hinzufügen"
        items={value.pillars}
        max={3}
        error={errors.pillars}
        onChange={(pillars) => onChange({ ...value, pillars })}
        createItem={(existing) => ({
          id: newItemId('saeule', existing),
          name: '',
          title: '',
          paragraphs: [],
          facets: [],
          media: null,
        })}
        itemLabel={(item, index) => `Säule ${index + 1}${item.name ? ` · ${item.name}` : ''}`}
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `pillars.${index}`);
          const n = index + 1;
          return (
            <>
              <TextField
                label="Name (Umschalter)"
                hint="z. B. Körper"
                required
                maxLength={40}
                value={item.name}
                error={e.name}
                onChange={(v) => update({ name: v ?? '' })}
              />
              <TextField
                label="Titel"
                hint="z. B. Corpus"
                required
                maxLength={80}
                value={item.title}
                error={e.title}
                onChange={(v) => update({ title: v ?? '' })}
              />
              <TextField
                label="Schlagworte"
                hint="z. B. Vitalität · Kraft · Balance"
                maxLength={120}
                value={item.keywords}
                error={e.keywords}
                onChange={(v) => update({ keywords: v })}
              />
              <TextField
                label="Leitsatz"
                multiline
                maxLength={400}
                value={item.lead}
                error={e.lead}
                onChange={(v) => update({ lead: v })}
              />
              <TextListField
                legend={`Absätze Säule ${n}`}
                items={item.paragraphs}
                max={6}
                maxLength={1200}
                multiline
                addLabel="Absatz hinzufügen"
                itemLabel={(i) => `Säule ${n} Absatz ${i + 1}`}
                errors={scopeErrors(e, 'paragraphs')}
                onChange={(paragraphs) => update({ paragraphs })}
              />
              <RepeatableList
                heading={`Facetten Säule ${n}`}
                addLabel="Facette hinzufügen"
                items={item.facets}
                max={6}
                error={e.facets}
                onChange={(facets) => update({ facets })}
                createItem={(existing) => ({
                  id: newItemId('facette', existing),
                  label: '',
                  description: '',
                })}
                itemLabel={(facet, i) =>
                  `Säule ${n} Facette ${i + 1}${facet.label ? ` · ${facet.label}` : ''}`
                }
                renderItem={(facet, i, updateFacet) => {
                  const fe = scopeErrors(e, `facets.${i}`);
                  return (
                    <>
                      <TextField
                        label="Bezeichnung"
                        required
                        maxLength={40}
                        value={facet.label}
                        error={fe.label}
                        onChange={(v) => updateFacet({ label: v ?? '' })}
                      />
                      <TextField
                        label="Beschreibung"
                        required
                        multiline
                        maxLength={400}
                        value={facet.description}
                        error={fe.description}
                        onChange={(v) => updateFacet({ description: v ?? '' })}
                      />
                    </>
                  );
                }}
              />
              <MediaSlotField
                legend={`Illustration Säule ${n}`}
                kinds={SECTION_MEDIA_KINDS.pillars}
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
