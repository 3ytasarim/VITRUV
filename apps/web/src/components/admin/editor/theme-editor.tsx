'use client';

import type { SectionContent } from '@vitruv/contracts';
import { tokens } from '@vitruv/design-tokens';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui';
import { FieldGroup } from './fields';
import type { EditorProps } from './section-editor';

type Theme = SectionContent<'theme'>;
type Key = keyof Theme;

/** The original 'Greek Harmony' palette from the design tokens — "Originalfarben" restores it. */
const P = tokens.colors.public;
export const DEFAULT_THEME: Theme = {
  background: P.bg.hex,
  surface: P.surface.hex,
  surfaceSunken: P.surfaceSunken.hex,
  heading: P.fg.hex,
  text: P.fg.hex,
  textMuted: P.fgMuted.hex,
  textSubtle: P.fgSubtle.hex,
  eyebrow: P.accentText.hex,
  button: P.accent.hex,
  buttonText: P.onAccent.hex,
  accent: tokens.decorativeColors.brandGold.hex,
  accentSecondary: tokens.decorativeColors.route.hex,
  dark: P.fg.hex,
};

const GROUPS: { legend: string; fields: { key: Key; label: string; hint: string }[] }[] = [
  {
    legend: 'Hintergründe',
    fields: [
      { key: 'background', label: 'Seitenhintergrund', hint: 'Grundfarbe der ganzen Seite' },
      { key: 'surface', label: 'Karten & Flächen', hint: 'Karten, Header, Footer' },
      {
        key: 'surfaceSunken',
        label: 'Abgesetzte Bereiche',
        hint: 'Bänder, Hintergrund-Abschnitte',
      },
      { key: 'dark', label: 'Dunkle Bereiche', hint: 'CTA-Karte, Coaching-Karten, dunkle Akzente' },
    ],
  },
  {
    legend: 'Texte',
    fields: [
      { key: 'heading', label: 'Überschriften', hint: 'Abschnitts- und Kartentitel' },
      { key: 'text', label: 'Haupttext', hint: 'Wichtiger Text, Rahmenlinien' },
      { key: 'textMuted', label: 'Fließtext', hint: 'Beschreibungen, Absätze' },
      { key: 'textSubtle', label: 'Kleintext', hint: 'Meta-Angaben, Nummern' },
      { key: 'eyebrow', label: 'Kleine Titel & Links', hint: 'Eyebrows über Überschriften' },
    ],
  },
  {
    legend: 'Buttons & Akzente',
    fields: [
      { key: 'button', label: 'Button', hint: 'Hauptbuttons (Füllung)' },
      { key: 'buttonText', label: 'Button-Schrift', hint: 'Text auf Hauptbuttons' },
      { key: 'accent', label: 'Akzent (Gold)', hint: 'Kursive Akzentwörter, Linien, Shine' },
      { key: 'accentSecondary', label: 'Zweiter Akzent', hint: 'Journey-Route, Hervorhebungen' },
    ],
  },
];

/** WCAG relative-luminance contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}
const HEX = /^#[0-9a-fA-F]{6}$/;
/** The lighter of two colours — copy on dark areas (same rule as lib/theme.ts). */
const brightness = (hex: string) =>
  [1, 3, 5].reduce((sum, i, k) => sum + parseInt(hex.slice(i, i + 2), 16) * [299, 587, 114][k]!, 0);
const lighter = (a: string, b: string) =>
  HEX.test(a) && HEX.test(b) && brightness(b) > brightness(a) ? b : a;

const CHECKS: { fg: Key; bg: Key; label: string; min: number }[] = [
  { fg: 'text', bg: 'background', label: 'Haupttext auf Seitenhintergrund', min: 4.5 },
  { fg: 'textMuted', bg: 'background', label: 'Fließtext auf Seitenhintergrund', min: 4.5 },
  { fg: 'textSubtle', bg: 'surface', label: 'Kleintext auf Karten', min: 4.5 },
  { fg: 'heading', bg: 'background', label: 'Überschriften auf Seitenhintergrund', min: 3 },
  { fg: 'eyebrow', bg: 'background', label: 'Kleine Titel auf Seitenhintergrund', min: 4.5 },
  { fg: 'buttonText', bg: 'button', label: 'Button-Schrift auf Button', min: 4.5 },
];

/**
 * Website colours ("Farben & Design"): colour picker + hex field per role, grouped; a live mini
 * preview; contrast warnings (WCAG) that never block saving; "Zurücksetzen" restores the
 * original palette. Published like every section — the live site changes only on "Veröffentlichen".
 */
export function ThemeEditor({ value, onChange, errors }: EditorProps<'theme'>) {
  const id = useId();
  const set = (key: Key, v: string) => onChange({ ...value, [key]: v });
  const warnings = CHECKS.filter(
    (c) =>
      HEX.test(value[c.fg]) && HEX.test(value[c.bg]) && contrast(value[c.fg], value[c.bg]) < c.min,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body-sm max-w-measure text-fg-muted">
          Farben der öffentlichen Website. Änderungen werden erst nach „Veröffentlichen“ live; mit
          „Vorschau“ siehst du den Entwurf vorher.
        </p>
        <Button
          variant="secondary"
          icon={<RotateCcw aria-hidden />}
          onClick={() => onChange({ ...DEFAULT_THEME })}
        >
          Originalfarben
        </Button>
      </div>

      {/* Live mini preview of the chosen palette. */}
      <div
        aria-hidden
        className="vt-theme-preview"
        style={{
          background: value.background,
          color: value.text,
          borderColor: value.surfaceSunken,
        }}
      >
        <p style={{ color: value.eyebrow }} className="vt-theme-preview__eyebrow">
          KLEINER TITEL
        </p>
        <p style={{ color: value.heading }} className="vt-theme-preview__title">
          Überschrift mit <em style={{ color: value.accent }}>Akzent</em>
        </p>
        <p style={{ color: value.textMuted }}>Fließtext auf dem Seitenhintergrund.</p>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="vt-theme-preview__btn"
            style={{ background: value.button, color: value.buttonText }}
          >
            Button
          </span>
          <span
            className="vt-theme-preview__card"
            style={{ background: value.surface, color: value.textSubtle }}
          >
            Karte · Kleintext
          </span>
          <span
            className="vt-theme-preview__card"
            style={{ background: value.dark, color: lighter(value.background, value.text) }}
          >
            Dunkler Bereich
          </span>
          <span className="vt-theme-preview__dot" style={{ background: value.accentSecondary }} />
        </div>
      </div>

      {warnings.length > 0 && (
        <div
          role="status"
          className="flex gap-3 rounded-md border border-warning bg-surface px-4 py-3"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="type-body-sm">
            <p className="font-semibold">Geringer Kontrast — schwer lesbar:</p>
            <ul className="mt-1 list-disc pl-5 text-fg-muted">
              {warnings.map((w) => (
                <li key={w.label}>
                  {w.label} ({contrast(value[w.fg], value[w.bg]).toFixed(1)} : 1, empfohlen ≥{' '}
                  {w.min} : 1)
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {GROUPS.map((group) => (
        <FieldGroup key={group.legend} legend={group.legend}>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => {
              const fieldId = `${id}-${field.key}`;
              const error = errors[field.key];
              return (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <label htmlFor={fieldId} className="type-body-sm font-semibold">
                    {field.label}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      aria-label={`${field.label} wählen`}
                      value={
                        HEX.test(value[field.key]) ? value[field.key] : DEFAULT_THEME[field.key]
                      }
                      onChange={(e) => set(field.key, e.target.value)}
                      className="vt-color-swatch"
                    />
                    <input
                      id={fieldId}
                      className="vt-input type-body-sm font-mono"
                      value={value[field.key]}
                      maxLength={7}
                      spellCheck={false}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={`${fieldId}-hint`}
                      onChange={(e) => set(field.key, e.target.value.trim())}
                    />
                  </div>
                  <p
                    id={`${fieldId}-hint`}
                    className={error ? 'type-body-sm text-error' : 'type-caption text-fg-subtle'}
                  >
                    {error ?? field.hint}
                  </p>
                </div>
              );
            })}
          </div>
        </FieldGroup>
      ))}
    </div>
  );
}
