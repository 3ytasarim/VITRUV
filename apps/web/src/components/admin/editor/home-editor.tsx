'use client';

import { SECTION_MEDIA_KINDS, type MediaSlot, type SectionContent } from '@vitruv/contracts';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { MediaSlotField } from '../media/media-slot-field';
import { CtaFields, LinkFields } from './cta-fields';
import { newItemId, scopeErrors, type FieldErrors } from './editor-state';
import { CheckboxField, FieldGroup, TextField } from './fields';
import { RepeatableList } from './repeatable-list';
import type { EditorProps } from './section-editor';

type Home = SectionContent<'home'>;
const KINDS = SECTION_MEDIA_KINDS.home;

/** One text area, one entry per line (headline lines, features, facts). */
const toLines = (v: string | undefined) =>
  (v ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
/** Paragraphs separated by an empty line. */
const toParagraphs = (v: string | undefined) =>
  (v ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** A page block of the reference design, collapsible so the long form stays navigable. */
function Block({
  title,
  hint,
  open = false,
  children,
}: {
  title: string;
  hint?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="vt-home-block" open={open}>
      <summary className="vt-home-block__head">
        <span className="type-title">{title}</span>
        {hint && <span className="type-caption text-fg-subtle">{hint}</span>}
      </summary>
      <div className="flex flex-col gap-5 pt-5">{children}</div>
    </details>
  );
}

function Media({
  legend,
  value,
  errors,
  onChange,
}: {
  legend: string;
  value: MediaSlot | null;
  errors: FieldErrors;
  onChange: (media: MediaSlot | null) => void;
}) {
  return (
    <MediaSlotField
      legend={legend}
      kinds={KINDS}
      value={value}
      errors={scopeErrors(errors, 'media')}
      onChange={onChange}
    />
  );
}

/** Eyebrow + title (+ lead) of a block. */
function Heading<T extends { eyebrow?: string; title: string; lead?: string }>({
  value,
  errors,
  onChange,
  lead = false,
  titleMax = 120,
}: {
  value: T;
  errors: FieldErrors;
  onChange: (v: T) => void;
  lead?: boolean;
  titleMax?: number;
}) {
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          label="Kleiner Titel (Eyebrow)"
          maxLength={60}
          value={value.eyebrow}
          error={errors.eyebrow}
          onChange={(v) => onChange({ ...value, eyebrow: v })}
        />
        <TextField
          label="Überschrift"
          required
          maxLength={titleMax}
          value={value.title}
          error={errors.title}
          onChange={(v) => onChange({ ...value, title: v ?? '' })}
        />
      </div>
      {lead && (
        <TextField
          label="Einleitung"
          multiline
          maxLength={400}
          value={value.lead}
          error={errors.lead}
          onChange={(v) => onChange({ ...value, lead: v })}
        />
      )}
    </>
  );
}

/**
 * Editor of the homepage (reference design 'Website Funktional'): every block of the page in
 * page order — texts, links and every image/video slot (Media Library). Saving keeps a draft;
 * "Veröffentlichen" puts it live.
 */
export function HomeEditor({ value: v, onChange, errors }: EditorProps<'home'>) {
  const set = <K extends keyof Home>(key: K, part: Home[K]) => onChange({ ...v, [key]: part });
  const e = (path: string) => scopeErrors(errors, path);

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Hero ---- */}
      <Block title="Hero" hint="Video, Überschrift, Buttons" open>
        <Media
          legend="Hero-Video / Bild (Hintergrund)"
          value={v.hero.media}
          errors={e('hero')}
          onChange={(media) => set('hero', { ...v.hero, media })}
        />
        <TextField
          label="Kleiner Titel (Eyebrow)"
          maxLength={80}
          value={v.hero.eyebrow}
          error={e('hero').eyebrow}
          onChange={(eyebrow) => set('hero', { ...v.hero, eyebrow })}
        />
        <TextField
          label="Überschrift — eine Zeile pro Zeile"
          required
          multiline
          hint="Die letzte Zeile erscheint blau leuchtend. Höchstens 4 Zeilen."
          value={v.hero.lines.join('\n')}
          error={e('hero').lines}
          onChange={(text) => set('hero', { ...v.hero, lines: toLines(text) })}
        />
        <TextField
          label="Text"
          multiline
          maxLength={400}
          value={v.hero.body}
          error={e('hero').body}
          onChange={(body) => set('hero', { ...v.hero, body })}
        />
        <CtaFields
          legend="Button 1 (blau)"
          value={v.hero.primary}
          errors={e('hero.primary')}
          onChange={(primary) => set('hero', { ...v.hero, primary })}
        />
        {v.hero.secondary ? (
          <FieldGroup
            legend="Button 2 (Glas)"
            actions={
              <Button
                type="button"
                variant="ghost"
                onClick={() => set('hero', { ...v.hero, secondary: undefined })}
              >
                Entfernen
              </Button>
            }
          >
            <LinkFields
              value={v.hero.secondary}
              errors={e('hero.secondary')}
              onChange={(secondary) => set('hero', { ...v.hero, secondary })}
            />
          </FieldGroup>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => set('hero', { ...v.hero, secondary: { label: '', href: '' } })}
          >
            + Zweiten Button hinzufügen
          </Button>
        )}
        <TextField
          label="Hinweis unter den Buttons"
          multiline
          maxLength={400}
          value={v.hero.note}
          error={e('hero').note}
          onChange={(note) => set('hero', { ...v.hero, note })}
        />
      </Block>

      {/* ---- Intro video ---- */}
      <Block title="Video-Bereich" hint="großes Video unter dem Hero">
        <Media
          legend="Video / Bild"
          value={v.intro.media}
          errors={e('intro')}
          onChange={(media) => set('intro', { ...v.intro, media })}
        />
        <TextField
          label="Bildunterschrift"
          maxLength={160}
          value={v.intro.caption}
          error={e('intro').caption}
          onChange={(caption) => set('intro', { ...v.intro, caption })}
        />
      </Block>

      {/* ---- Ergebnisse ---- */}
      <Block title="Ergebnisse" hint="Video-Stimmen + Vorher/Nachher-Reihe">
        <Heading
          value={v.results}
          errors={e('results')}
          onChange={(results) => set('results', results)}
        />
        <RepeatableList
          heading="Video-Stimmen"
          addLabel="Video-Stimme hinzufügen"
          items={v.results.videos}
          max={4}
          onChange={(videos) => set('results', { ...v.results, videos })}
          createItem={(existing) => ({
            id: newItemId('video', existing),
            quote: '',
            who: '',
            media: null,
          })}
          itemLabel={(item, i) => `Video ${i + 1}${item.who ? ` · ${item.who}` : ''}`}
          renderItem={(item, i, update) => {
            const ie = e(`results.videos.${i}`);
            return (
              <>
                <Media
                  legend={`Video ${i + 1}`}
                  value={item.media}
                  errors={ie}
                  onChange={(media) => update({ media })}
                />
                <TextField
                  label="Zitat"
                  required
                  multiline
                  maxLength={300}
                  value={item.quote}
                  error={ie.quote}
                  onChange={(quote) => update({ quote: quote ?? '' })}
                />
                <TextField
                  label="Name / Bezeichnung"
                  required
                  maxLength={60}
                  value={item.who}
                  error={ie.who}
                  onChange={(who) => update({ who: who ?? '' })}
                />
              </>
            );
          }}
        />
        <TextField
          label="Hinweis über der Reihe"
          maxLength={40}
          value={v.results.swipeHint}
          error={e('results').swipeHint}
          onChange={(swipeHint) => set('results', { ...v.results, swipeHint })}
        />
        <RepeatableList
          heading="Vorher / Nachher (Wisch-Reihe)"
          addLabel="Bild hinzufügen"
          items={v.results.gallery}
          max={24}
          onChange={(gallery) => set('results', { ...v.results, gallery })}
          createItem={(existing) => ({ id: newItemId('ergebnis', existing), who: '', media: null })}
          itemLabel={(item, i) => `Bild ${i + 1}${item.who ? ` · ${item.who}` : ''}`}
          renderItem={(item, i, update) => {
            const ie = e(`results.gallery.${i}`);
            return (
              <>
                <Media
                  legend={`Bild ${i + 1}`}
                  value={item.media}
                  errors={ie}
                  onChange={(media) => update({ media })}
                />
                <TextField
                  label="Bezeichnung"
                  required
                  maxLength={60}
                  value={item.who}
                  error={ie.who}
                  onChange={(who) => update({ who: who ?? '' })}
                />
              </>
            );
          }}
        />
      </Block>

      {/* ---- Dein Weg ---- */}
      <Block title="Dein Weg" hint="Etappen der Routen-Karte">
        <Heading
          value={v.journey}
          errors={e('journey')}
          onChange={(journey) => set('journey', journey)}
        />
        <RepeatableList
          heading="Etappen"
          addLabel="Etappe hinzufügen"
          items={v.journey.stages}
          min={1}
          max={8}
          error={e('journey').stages}
          onChange={(stages) => set('journey', { ...v.journey, stages })}
          createItem={(existing) => ({
            id: newItemId('etappe', existing),
            name: '',
            title: '',
            text: '',
            media: null,
          })}
          itemLabel={(item, i) => `Etappe ${i + 1}${item.name ? ` · ${item.name}` : ''}`}
          renderItem={(item, i, update) => {
            const ie = e(`journey.stages.${i}`);
            return (
              <>
                <Media
                  legend={`Bild / Video Etappe ${i + 1}`}
                  value={item.media}
                  errors={ie}
                  onChange={(media) => update({ media })}
                />
                <div className="grid gap-5 md:grid-cols-2">
                  <TextField
                    label="Name"
                    required
                    maxLength={40}
                    value={item.name}
                    error={ie.name}
                    onChange={(name) => update({ name: name ?? '' })}
                  />
                  <TextField
                    label="Überschrift"
                    required
                    maxLength={120}
                    value={item.title}
                    error={ie.title}
                    onChange={(title) => update({ title: title ?? '' })}
                  />
                </div>
                <TextField
                  label="Text"
                  required
                  multiline
                  maxLength={600}
                  value={item.text}
                  error={ie.text}
                  onChange={(text) => update({ text: text ?? '' })}
                />
              </>
            );
          }}
        />
      </Block>

      {/* ---- Das sagen Teilnehmer ---- */}
      <Block title="Das sagen Teilnehmer" hint="Text-Zitate">
        <TextField
          label="Kleiner Titel (Eyebrow)"
          maxLength={60}
          value={v.voices.eyebrow}
          error={e('voices').eyebrow}
          onChange={(eyebrow) => set('voices', { ...v.voices, eyebrow })}
        />
        <RepeatableList
          heading="Zitate"
          addLabel="Zitat hinzufügen"
          items={v.voices.items}
          max={12}
          onChange={(items) => set('voices', { ...v.voices, items })}
          createItem={(existing) => ({ id: newItemId('stimme', existing), quote: '', who: '' })}
          itemLabel={(item, i) => `Zitat ${i + 1}${item.who ? ` · ${item.who}` : ''}`}
          renderItem={(item, i, update) => {
            const ie = e(`voices.items.${i}`);
            return (
              <>
                <TextField
                  label="Zitat"
                  required
                  multiline
                  maxLength={600}
                  value={item.quote}
                  error={ie.quote}
                  onChange={(quote) => update({ quote: quote ?? '' })}
                />
                <TextField
                  label="Name / Bezeichnung"
                  required
                  maxLength={60}
                  value={item.who}
                  error={ie.who}
                  onChange={(who) => update({ who: who ?? '' })}
                />
              </>
            );
          }}
        />
      </Block>

      {/* ---- Wo die meisten starten ---- */}
      <Block title="Wo die meisten starten" hint="Sätze + Abschlusstext">
        <Heading
          value={v.doubts}
          errors={e('doubts')}
          titleMax={160}
          onChange={(doubts) => set('doubts', doubts)}
        />
        <RepeatableList
          heading="Sätze"
          addLabel="Satz hinzufügen"
          items={v.doubts.items}
          max={12}
          onChange={(items) => set('doubts', { ...v.doubts, items })}
          createItem={(existing) => ({ id: newItemId('satz', existing), text: '' })}
          itemLabel={(_item, i) => `Satz ${i + 1}`}
          renderItem={(item, i, update) => (
            <TextField
              label="Satz"
              required
              maxLength={200}
              value={item.text}
              error={e(`doubts.items.${i}`).text}
              onChange={(text) => update({ text: text ?? '' })}
            />
          )}
        />
        <TextField
          label="Abschlusstext"
          multiline
          maxLength={800}
          value={v.doubts.outro}
          error={e('doubts').outro}
          onChange={(outro) => set('doubts', { ...v.doubts, outro })}
        />
        <TextField
          label="Hervorgehobenes Wort im Abschlusstext"
          maxLength={60}
          hint="Muss genau so im Abschlusstext vorkommen; erscheint blau leuchtend."
          value={v.doubts.outroHighlight}
          error={e('doubts').outroHighlight}
          onChange={(outroHighlight) => set('doubts', { ...v.doubts, outroHighlight })}
        />
      </Block>

      {/* ---- Was drin ist ---- */}
      <Block title="Was drin ist" hint="nummerierte Leistungen">
        <Heading
          value={v.included}
          errors={e('included')}
          lead
          onChange={(included) => set('included', included)}
        />
        <RepeatableList
          heading="Leistungen"
          addLabel="Leistung hinzufügen"
          items={v.included.items}
          max={12}
          onChange={(items) => set('included', { ...v.included, items })}
          createItem={(existing) => ({ id: newItemId('leistung', existing), title: '', text: '' })}
          itemLabel={(item, i) => `${String(i + 1).padStart(2, '0')} ${item.title}`}
          renderItem={(item, i, update) => {
            const ie = e(`included.items.${i}`);
            return (
              <>
                <TextField
                  label="Titel"
                  required
                  maxLength={80}
                  value={item.title}
                  error={ie.title}
                  onChange={(title) => update({ title: title ?? '' })}
                />
                <TextField
                  label="Text"
                  required
                  multiline
                  maxLength={400}
                  value={item.text}
                  error={ie.text}
                  onChange={(text) => update({ text: text ?? '' })}
                />
              </>
            );
          }}
        />
      </Block>

      {/* ---- Pakete ---- */}
      <Block title="Pakete">
        <Heading
          value={v.packages}
          errors={e('packages')}
          lead
          onChange={(packages) => set('packages', packages)}
        />
        <RepeatableList
          heading="Pakete"
          addLabel="Paket hinzufügen"
          items={v.packages.items}
          max={4}
          onChange={(items) => set('packages', { ...v.packages, items })}
          createItem={(existing) => ({
            id: newItemId('paket', existing),
            name: '',
            featured: false,
            features: [],
            cta: { label: 'Bewerben →', href: '#bewerben' },
          })}
          itemLabel={(item, i) => `Paket ${i + 1}${item.name ? ` · ${item.name}` : ''}`}
          renderItem={(item, i, update) => {
            const ie = e(`packages.items.${i}`);
            return (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  <TextField
                    label="Name"
                    required
                    maxLength={60}
                    value={item.name}
                    error={ie.name}
                    onChange={(name) => update({ name: name ?? '' })}
                  />
                  <TextField
                    label="Label oben rechts"
                    maxLength={40}
                    hint="z. B. „6 Wochen“; beim hervorgehobenen Paket als blaues Abzeichen."
                    value={item.label}
                    error={ie.label}
                    onChange={(label) => update({ label })}
                  />
                </div>
                <CheckboxField
                  label="Hervorheben (blauer Rahmen + Leuchten)"
                  checked={item.featured}
                  onChange={(featured) => update({ featured })}
                />
                <TextField
                  label="Text"
                  multiline
                  maxLength={400}
                  value={item.text}
                  error={ie.text}
                  onChange={(text) => update({ text })}
                />
                <TextField
                  label="Leistungen — eine pro Zeile"
                  multiline
                  hint="Erscheinen mit „+“ davor."
                  value={item.features.join('\n')}
                  error={ie.features}
                  onChange={(text) => update({ features: toLines(text) })}
                />
                <TextField
                  label="Hinweis (grau, letzte Zeile)"
                  maxLength={160}
                  value={item.note}
                  error={ie.note}
                  onChange={(note) => update({ note })}
                />
                <CtaFields
                  legend="Button"
                  value={item.cta}
                  errors={scopeErrors(ie, 'cta')}
                  onChange={(cta) => update({ cta })}
                />
              </>
            );
          }}
        />
      </Block>

      {/* ---- So läuft es ab ---- */}
      <Block title="So läuft es ab" hint="Schritte">
        <Heading value={v.steps} errors={e('steps')} onChange={(steps) => set('steps', steps)} />
        <RepeatableList
          heading="Schritte"
          addLabel="Schritt hinzufügen"
          items={v.steps.items}
          max={12}
          onChange={(items) => set('steps', { ...v.steps, items })}
          createItem={(existing) => ({ id: newItemId('schritt', existing), title: '', text: '' })}
          itemLabel={(item, i) => `${String(i + 1).padStart(2, '0')} ${item.title}`}
          renderItem={(item, i, update) => {
            const ie = e(`steps.items.${i}`);
            return (
              <>
                <TextField
                  label="Titel"
                  required
                  maxLength={80}
                  value={item.title}
                  error={ie.title}
                  onChange={(title) => update({ title: title ?? '' })}
                />
                <TextField
                  label="Text"
                  required
                  multiline
                  maxLength={400}
                  value={item.text}
                  error={ie.text}
                  onChange={(text) => update({ text: text ?? '' })}
                />
              </>
            );
          }}
        />
      </Block>

      {/* ---- Im Training ---- */}
      <Block title="Im Training" hint="Bildkarten">
        <Heading
          value={v.training}
          errors={e('training')}
          lead
          onChange={(training) => set('training', training)}
        />
        <RepeatableList
          heading="Bildkarten"
          addLabel="Karte hinzufügen"
          items={v.training.items}
          max={8}
          onChange={(items) => set('training', { ...v.training, items })}
          createItem={(existing) => ({
            id: newItemId('training', existing),
            label: '',
            text: '',
            media: null,
          })}
          itemLabel={(item, i) => `Karte ${i + 1}${item.label ? ` · ${item.label}` : ''}`}
          renderItem={(item, i, update) => {
            const ie = e(`training.items.${i}`);
            return (
              <>
                <Media
                  legend={`Bild Karte ${i + 1}`}
                  value={item.media}
                  errors={ie}
                  onChange={(media) => update({ media })}
                />
                <div className="grid gap-5 md:grid-cols-2">
                  <TextField
                    label="Kleiner Titel"
                    required
                    maxLength={40}
                    value={item.label}
                    error={ie.label}
                    onChange={(label) => update({ label: label ?? '' })}
                  />
                  <TextField
                    label="Text"
                    required
                    maxLength={160}
                    value={item.text}
                    error={ie.text}
                    onChange={(text) => update({ text: text ?? '' })}
                  />
                </div>
              </>
            );
          }}
        />
      </Block>

      {/* ---- Coach ---- */}
      <Block title="Coach" hint="Porträt + Geschichte">
        <Media
          legend="Porträt"
          value={v.coach.media}
          errors={e('coach')}
          onChange={(media) => set('coach', { ...v.coach, media })}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="Kleiner Titel (Eyebrow)"
            maxLength={60}
            value={v.coach.eyebrow}
            error={e('coach').eyebrow}
            onChange={(eyebrow) => set('coach', { ...v.coach, eyebrow })}
          />
          <TextField
            label="Name"
            required
            maxLength={80}
            value={v.coach.name}
            error={e('coach').name}
            onChange={(name) => set('coach', { ...v.coach, name: name ?? '' })}
          />
        </div>
        <TextField
          label="Kurzinfos unter dem Porträt — eine pro Zeile"
          multiline
          value={v.coach.facts.join('\n')}
          error={e('coach').facts}
          onChange={(text) => set('coach', { ...v.coach, facts: toLines(text) })}
        />
        <TextField
          label="Geschichte — Absätze durch eine Leerzeile trennen"
          multiline
          value={v.coach.paragraphs.join('\n\n')}
          error={e('coach').paragraphs}
          onChange={(text) => set('coach', { ...v.coach, paragraphs: toParagraphs(text) })}
        />
        <TextField
          label="Letzte Zeile (hervorgehoben)"
          maxLength={400}
          value={v.coach.closing}
          error={e('coach').closing}
          onChange={(closing) => set('coach', { ...v.coach, closing })}
        />
      </Block>

      {/* ---- FAQ ---- */}
      <Block title="FAQ">
        <Heading value={v.faq} errors={e('faq')} onChange={(faq) => set('faq', faq)} />
        <RepeatableList
          heading="Fragen"
          addLabel="Frage hinzufügen"
          items={v.faq.items}
          max={40}
          onChange={(items) => set('faq', { ...v.faq, items })}
          createItem={(existing) => ({
            id: newItemId('frage', existing),
            question: '',
            answer: '',
          })}
          itemLabel={(item, i) => `Frage ${i + 1}${item.question ? ` · ${item.question}` : ''}`}
          renderItem={(item, i, update) => {
            const ie = e(`faq.items.${i}`);
            return (
              <>
                <TextField
                  label="Frage"
                  required
                  maxLength={200}
                  value={item.question}
                  error={ie.question}
                  onChange={(question) => update({ question: question ?? '' })}
                />
                <TextField
                  label="Antwort"
                  required
                  multiline
                  maxLength={2000}
                  value={item.answer}
                  error={ie.answer}
                  onChange={(answer) => update({ answer: answer ?? '' })}
                />
              </>
            );
          }}
        />
      </Block>

      {/* ---- CTA ---- */}
      <Block title="Abschluss (Bild + Button)">
        <Media
          legend="Hintergrundbild / Video"
          value={v.cta.media}
          errors={e('cta')}
          onChange={(media) => set('cta', { ...v.cta, media })}
        />
        <Heading
          value={v.cta}
          errors={e('cta')}
          titleMax={160}
          onChange={(cta) => set('cta', cta)}
        />
        <TextField
          label="Text"
          multiline
          maxLength={400}
          value={v.cta.body}
          error={e('cta').body}
          onChange={(body) => set('cta', { ...v.cta, body })}
        />
        <CtaFields
          legend="Button"
          value={v.cta.action}
          errors={e('cta.action')}
          onChange={(action) => set('cta', { ...v.cta, action })}
        />
      </Block>

      {/* ---- Bewerben ---- */}
      <Block title="Bewerben" hint="Kontakt-Kanäle (Instagram, WhatsApp, E-Mail)">
        <Heading
          value={v.apply}
          errors={e('apply')}
          lead
          onChange={(apply) => set('apply', apply)}
        />
        <RepeatableList
          heading="Kanäle"
          addLabel="Kanal hinzufügen"
          items={v.apply.channels}
          max={6}
          onChange={(channels) => set('apply', { ...v.apply, channels })}
          createItem={(existing) => ({
            id: newItemId('kanal', existing),
            tag: '',
            title: '',
            cta: '',
            href: '',
          })}
          itemLabel={(item, i) => `Kanal ${i + 1}${item.title ? ` · ${item.title}` : ''}`}
          renderItem={(item, i, update) => {
            const ie = e(`apply.channels.${i}`);
            return (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  <TextField
                    label="Kürzel im Quadrat"
                    required
                    maxLength={4}
                    hint="z. B. IG, WA, @"
                    value={item.tag}
                    error={ie.tag}
                    onChange={(tag) => update({ tag: tag ?? '' })}
                  />
                  <TextField
                    label="Titel"
                    required
                    maxLength={40}
                    value={item.title}
                    error={ie.title}
                    onChange={(title) => update({ title: title ?? '' })}
                  />
                </div>
                <TextField
                  label="Text"
                  multiline
                  maxLength={300}
                  value={item.text}
                  error={ie.text}
                  onChange={(text) => update({ text })}
                />
                <LinkFields
                  value={{ label: item.cta, href: item.href }}
                  labelText="Link-Text"
                  errors={{
                    ...(ie.cta ? { label: ie.cta } : {}),
                    ...(ie.href ? { href: ie.href } : {}),
                  }}
                  onChange={(link) => update({ cta: link.label, href: link.href })}
                />
              </>
            );
          }}
        />
      </Block>

      {/* ---- Header ---- */}
      <Block title="Header & Handy-Menü">
        <CtaFields
          legend="Button in der Mitte (erscheint nach dem Video)"
          value={v.headerCta}
          errors={e('headerCta')}
          onChange={(headerCta) => set('headerCta', headerCta)}
        />
        <RepeatableList
          heading="Handy-Menü (öffnet sich über das Logo)"
          addLabel="Menüpunkt hinzufügen"
          items={v.menu}
          max={5}
          onChange={(menu) => set('menu', menu)}
          createItem={(existing) => ({ id: newItemId('menu', existing), label: '', href: '' })}
          itemLabel={(item, i) => `${String(i + 1).padStart(2, '0')} ${item.label}`}
          renderItem={(item, i, update) => (
            <LinkFields
              value={item}
              errors={e(`menu.${i}`)}
              onChange={(link) => update({ label: link.label, href: link.href })}
            />
          )}
        />
      </Block>
    </div>
  );
}
