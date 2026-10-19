'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { CtaFields } from './cta-fields';
import { newItemId, scopeErrors } from './editor-state';
import { CheckboxField, FieldGroup, TextField } from './fields';
import { RepeatableList, TextListField } from './repeatable-list';
import type { EditorProps } from './section-editor';

/**
 * Packages: editorial display content only. The price is free text shown as-is — there is no
 * pricing, checkout or payment logic behind it.
 */
export function PackagesEditor({ value, onChange, errors }: EditorProps<'packages'>) {
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
        heading="Pakete"
        addLabel="Paket hinzufügen"
        items={value.packages}
        max={6}
        error={errors.packages}
        onChange={(packages) => onChange({ ...value, packages })}
        createItem={(existing) => ({
          id: newItemId('paket', existing),
          name: '',
          features: [],
          cta: { label: '', href: '' },
          highlighted: false,
        })}
        itemLabel={(item, index) =>
          `Paket ${index + 1}${item.name ? ` · ${item.name}` : ''}${item.highlighted ? ' (hervorgehoben)' : ''}`
        }
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `packages.${index}`);
          return (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <TextField
                  label="Name"
                  required
                  maxLength={60}
                  value={item.name}
                  error={e.name}
                  onChange={(v) => update({ name: v ?? '' })}
                />
                <TextField
                  label="Preisangabe"
                  maxLength={40}
                  hint="Freitext, wird unverändert angezeigt (z. B. „auf Anfrage“)."
                  value={item.priceLabel}
                  error={e.priceLabel}
                  onChange={(v) => update({ priceLabel: v })}
                />
              </div>
              <TextField
                label="Kurzbeschreibung"
                maxLength={160}
                value={item.tagline}
                error={e.tagline}
                onChange={(v) => update({ tagline: v })}
              />
              <CheckboxField
                label="Als empfohlenes Paket hervorheben"
                checked={item.highlighted}
                onChange={(highlighted) => update({ highlighted })}
              />
              <TextListField
                legend={`Leistungen Paket ${index + 1}`}
                items={item.features}
                max={20}
                maxLength={160}
                addLabel="Leistung hinzufügen"
                itemLabel={(i) => `Paket ${index + 1} Leistung ${i + 1}`}
                errors={scopeErrors(e, 'features')}
                onChange={(features) => update({ features })}
              />
              <CtaFields
                legend={`Button Paket ${index + 1}`}
                value={item.cta}
                errors={scopeErrors(e, 'cta')}
                onChange={(cta) => update({ cta })}
              />
              <MediaSlotField
                legend={'Bild Paket ' + (index + 1) + ' (optional, Hochformat)'}
                kinds={SECTION_MEDIA_KINDS.packages}
                value={item.media ?? null}
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
