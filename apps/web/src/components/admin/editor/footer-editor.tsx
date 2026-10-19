'use client';

import type { LinkItem, SectionContent } from '@vitruv/contracts';
import { useId } from 'react';
import { LinkFields } from './cta-fields';
import { newItemId, scopeErrors, type FieldErrors } from './editor-state';
import { FieldGroup, TextField } from './fields';
import { RepeatableList } from './repeatable-list';
import type { EditorProps } from './section-editor';

type Social = SectionContent<'footer'>['social'][number];

const PLATFORMS: { value: Social['platform']; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X' },
];

function LinkList({
  heading,
  noun,
  prefix,
  items,
  max,
  errors,
  onChange,
}: {
  heading: string;
  noun: string;
  prefix: string;
  items: readonly LinkItem[];
  max: number;
  errors: FieldErrors;
  onChange: (items: LinkItem[]) => void;
}) {
  return (
    <RepeatableList
      heading={heading}
      addLabel={`${noun} hinzufügen`}
      items={items}
      max={max}
      error={errors._}
      onChange={onChange}
      createItem={(existing) => ({ id: newItemId(prefix, existing), label: '', href: '' })}
      itemLabel={(item, index) => `${noun} ${index + 1}${item.label ? ` · ${item.label}` : ''}`}
      renderItem={(item, index, update) => (
        <LinkFields
          value={item}
          errors={scopeErrors(errors, String(index))}
          onChange={(next) => update(next)}
        />
      )}
    />
  );
}

function PlatformSelect({
  value,
  onChange,
}: {
  value: Social['platform'];
  onChange: (platform: Social['platform']) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-body-sm font-semibold">
        Plattform
      </label>
      <select
        id={id}
        className="vt-input type-body-sm"
        value={value}
        onChange={(event) => onChange(event.target.value as Social['platform'])}
      >
        {PLATFORMS.map((platform) => (
          <option key={platform.value} value={platform.value}>
            {platform.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Footer: display text, navigation, legal links, contact details and social profiles.
 * Contact details must be the owner's approved public data — nothing is pre-filled.
 */
export function FooterEditor({ value, onChange, errors }: EditorProps<'footer'>) {
  const contactErrors = scopeErrors(errors, 'contact');
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup legend="Text">
        <TextField
          label="Zeile im Footer"
          hint="Kurzer Anzeigetext, z. B. Markenzeile oder Copyright-Hinweis."
          maxLength={200}
          value={value.tagline}
          error={errors.tagline}
          onChange={(v) => onChange({ ...value, tagline: v })}
        />
      </FieldGroup>

      <LinkList
        heading="Navigation"
        noun="Navigationslink"
        prefix="nav"
        items={value.navigation}
        max={12}
        errors={scopeErrors(errors, 'navigation')}
        onChange={(navigation) => onChange({ ...value, navigation })}
      />
      <LinkList
        heading="Rechtliches"
        noun="Rechtlicher Link"
        prefix="recht"
        items={value.legal}
        max={6}
        errors={scopeErrors(errors, 'legal')}
        onChange={(legal) => onChange({ ...value, legal })}
      />

      <FieldGroup
        legend="Kontakt"
        description="Nur freigegebene, öffentliche Kontaktdaten. Leer gelassene Felder werden nicht angezeigt."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="E-Mail"
            inputMode="email"
            maxLength={200}
            value={value.contact.email}
            error={contactErrors.email}
            onChange={(email) => onChange({ ...value, contact: { ...value.contact, email } })}
          />
          <TextField
            label="Telefon"
            maxLength={40}
            value={value.contact.phone}
            error={contactErrors.phone}
            onChange={(phone) => onChange({ ...value, contact: { ...value.contact, phone } })}
          />
        </div>
        <TextField
          label="Ort"
          maxLength={120}
          value={value.contact.location}
          error={contactErrors.location}
          onChange={(location) => onChange({ ...value, contact: { ...value.contact, location } })}
        />
      </FieldGroup>

      <RepeatableList
        heading="Social Media"
        addLabel="Profil hinzufügen"
        items={value.social}
        max={8}
        error={errors.social}
        onChange={(social) => onChange({ ...value, social })}
        createItem={(existing) => ({
          id: newItemId('social', existing),
          platform: 'instagram' as const,
          href: '',
        })}
        itemLabel={(item, index) =>
          `Profil ${index + 1} · ${PLATFORMS.find((p) => p.value === item.platform)?.label ?? ''}`
        }
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `social.${index}`);
          return (
            <div className="grid gap-5 md:grid-cols-[12rem_minmax(0,1fr)]">
              <PlatformSelect value={item.platform} onChange={(platform) => update({ platform })} />
              <TextField
                label="Profil-Adresse"
                required
                inputMode="url"
                placeholder="https://…"
                hint="Nur vollständige https://-Adressen."
                value={item.href}
                error={e.href}
                onChange={(v) => update({ href: v ?? '' })}
              />
            </div>
          );
        }}
      />
    </div>
  );
}
