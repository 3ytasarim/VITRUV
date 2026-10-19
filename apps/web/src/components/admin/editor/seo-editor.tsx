'use client';

import { SECTION_MEDIA_KINDS } from '@vitruv/contracts';
import { MediaSlotField } from '../media/media-slot-field';
import { scopeErrors } from './editor-state';
import { CheckboxField, FieldGroup, TextField } from './fields';
import type { EditorProps } from './section-editor';

/** Usual visible length in search results — guidance only, not a validation rule. */
function lengthHint(value: string | undefined, recommended: number, base: string) {
  const length = value?.length ?? 0;
  return `${base} ${length} Zeichen · Suchergebnisse zeigen meist ca. ${recommended}.`;
}

/**
 * Page settings for search engines and link previews (published like a section). The canonical
 * address is configured per environment (PUBLIC_SITE_URL), not here.
 */
export function SeoEditor({ value, onChange, errors }: EditorProps<'seo'>) {
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup legend="Suchmaschinen">
        <TextField
          label="Seitentitel"
          required
          maxLength={120}
          hint={lengthHint(value.title, 60, 'Titel im Browser-Tab und in Suchergebnissen.')}
          value={value.title}
          error={errors.title}
          onChange={(v) => onChange({ ...value, title: v ?? '' })}
        />
        <TextField
          label="Beschreibung"
          required
          multiline
          maxLength={320}
          hint={lengthHint(value.description, 155, 'Kurzbeschreibung unter dem Titel.')}
          value={value.description}
          error={errors.description}
          onChange={(v) => onChange({ ...value, description: v ?? '' })}
        />
        <TextField
          label="Website-Name"
          required
          maxLength={80}
          hint="Für Link-Vorschauen und strukturierte Daten (z. B. „VITRUV“)."
          value={value.siteName}
          error={errors.siteName}
          onChange={(v) => onChange({ ...value, siteName: v ?? '' })}
        />
        <CheckboxField
          label="FAQ als strukturierte Daten ausgeben"
          hint="Nur die veröffentlichten, sichtbaren Fragen."
          checked={value.faqStructuredData}
          onChange={(faqStructuredData) => onChange({ ...value, faqStructuredData })}
        />
      </FieldGroup>
      <MediaSlotField
        legend="Vorschaubild für geteilte Links (Open Graph)"
        kinds={SECTION_MEDIA_KINDS.seo}
        value={value.ogImage}
        errors={scopeErrors(errors, 'ogImage')}
        onChange={(ogImage) => onChange({ ...value, ogImage })}
      />
      <MediaSlotField
        legend="Logo im Header (optional — sonst Schriftzug VITRUV)"
        kinds={['IMAGE']}
        value={value.logo ?? null}
        errors={scopeErrors(errors, 'logo')}
        onChange={(logo) => onChange({ ...value, logo })}
      />
    </div>
  );
}
