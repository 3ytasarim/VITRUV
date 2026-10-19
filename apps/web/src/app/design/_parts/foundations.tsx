import { tokens, toCss } from '@vitruv/design-tokens';
import { Card, GlitchText, Reveal, chamfer, cx } from '@/components/ui';
import { PreviewGroup, PreviewItem } from './preview-block';

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export function Foundations() {
  const roles = Object.entries(tokens.colors.dark);
  const type = Object.entries(tokens.typeScale);
  const space = Object.entries(tokens.space).filter(([k]) => Number(k) > 0);

  return (
    <>
      <PreviewGroup
        id="colors"
        eyebrow="Foundations"
        title="Farben"
        note="Semantische Rollen aus packages/design-tokens (dunkles Master-Theme). Komponenten verwenden nur diese Rollen."
      >
        <ul className="vt-autogrid vt-autogrid--sm">
          {roles.map(([role, value]) => (
            <li key={role} className={chamfer('sm', 'vt-card vt-card--sunken p-3')}>
              <span
                aria-hidden
                className="block h-14 border border-border-subtle"
                style={{ background: `var(--color-${kebab(role)})` }}
              />
              <span className="type-caption mt-3 block text-fg">{kebab(role)}</span>
              <span className="type-body-sm block text-fg-subtle tabular-nums">{toCss(value)}</span>
            </li>
          ))}
        </ul>
      </PreviewGroup>

      <PreviewGroup
        id="typography"
        eyebrow="Foundations"
        title="Typografie"
        note="Chakra Petch (Überschriften), Barlow Condensed (Labels), Barlow (Text) — SIL OFL. Größen sind fluid (360 → 1440 px)."
      >
        <ul className="flex flex-col divide-y divide-border-subtle">
          {type.map(([name, role]) => (
            <li key={name} className="flex flex-col gap-2 py-5 md:flex-row md:gap-8">
              <span className="type-caption shrink-0 text-fg-subtle md:w-48">
                type-{kebab(name)}
                <span className="type-body-sm block normal-case tracking-normal">
                  {role.min === role.max ? `${role.min}px` : `${role.min}–${role.max}px`} ·{' '}
                  {role.weight}
                </span>
              </span>
              <span className={cx(`type-${kebab(name)}`, 'min-w-0 break-words')}>
                Stärke beginnt mit einem Plan
              </span>
            </li>
          ))}
        </ul>
      </PreviewGroup>

      <PreviewGroup
        id="spacing"
        eyebrow="Foundations"
        title="Abstände & Layout"
        note="4-px-Raster. Inhaltsbreite 1240 px, Gutter 20 → 44 px, Abschnittsrhythmus 72 → 110 px, Haupt-Breakpoint 820 px."
      >
        <ul className="flex flex-col gap-2">
          {space.map(([key, px]) => (
            <li key={key} className="flex items-center gap-4">
              <span className="type-caption w-20 shrink-0 text-fg-subtle">
                {key} · {px}px
              </span>
              <span
                aria-hidden
                className="h-3 bg-accent"
                style={{ width: `calc(var(--spacing) * ${key})` }}
              />
            </li>
          ))}
        </ul>
        <PreviewItem label="Layout-Tokens">
          <dl className="type-body-sm flex max-w-measure flex-col gap-2 text-fg-muted">
            {[
              ['Inhalt max.', `${tokens.layout.contentMax}px · max-w-content`],
              ['Gutter', `${tokens.layout.gutter.min}–${tokens.layout.gutter.max}px · --gutter`],
              [
                'Abschnitt',
                `${tokens.layout.section.min}–${tokens.layout.section.max}px · --section-space`,
              ],
              [
                'Breakpoints',
                Object.entries(tokens.layout.breakpoints)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(' · '),
              ],
            ].map(([term, value]) => (
              <div key={term} className="flex flex-wrap gap-x-6">
                <dt className="type-caption w-28 text-fg-subtle">{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </PreviewItem>
      </PreviewGroup>

      <PreviewGroup
        id="shapes"
        eyebrow="Foundations"
        title="Formen & Effekte"
        note="Chamfer = Markenzeichen. Rahmen bleiben an der Schräge vollständig sichtbar; Glow folgt der Silhouette (drop-shadow)."
      >
        <PreviewItem label="Chamfer-Größen (mit Rahmen)">
          <div className="flex flex-wrap gap-4">
            {(['xs', 'sm', 'md', 'lg'] as const).map((cut) => (
              <Card key={cut} tone="outline" cut={cut} padding="sm" className="w-32">
                <span className="type-caption">{cut}</span>
                <span className="type-body-sm block text-fg-subtle">
                  {tokens.shape.chamfer[cut]}px
                </span>
              </Card>
            ))}
          </div>
        </PreviewItem>
        <PreviewItem label="Glow">
          <div className="flex flex-wrap gap-6">
            <Card padding="sm" className="w-44">
              <span className="type-caption">ohne</span>
            </Card>
            <Card padding="sm" glow className="w-44">
              <span className="type-caption">glow (soft)</span>
            </Card>
            <Card padding="sm" tone="accent" glow className="w-44">
              <span className="type-caption">accent + glow-strong</span>
            </Card>
          </div>
        </PreviewItem>
        <PreviewItem label="Radius (große Medienflächen)">
          <div className="flex flex-wrap gap-4">
            {(['sm', 'md', 'lg', 'xl'] as const).map((r) => (
              <span
                key={r}
                className="type-caption flex size-20 items-center justify-center border border-border bg-surface"
                style={{ borderRadius: `var(--radius-${r})` }}
              >
                {r}
              </span>
            ))}
          </div>
        </PreviewItem>
      </PreviewGroup>

      <PreviewGroup
        id="motion"
        eyebrow="Foundations"
        title="Bewegung"
        note="Easing cubic-bezier(0.22, 1, 0.36, 1). Bei prefers-reduced-motion werden alle Dauern 0 ms; Glitch und Reveal entfallen, Inhalte bleiben sichtbar."
      >
        <PreviewItem label="Dauern">
          <ul className="type-body-sm flex flex-wrap gap-x-6 gap-y-2 text-fg-muted">
            {Object.entries(tokens.motion.duration).map(([name, ms]) => (
              <li key={name}>
                --duration-{name}: {ms}ms
              </li>
            ))}
          </ul>
        </PreviewItem>
        <PreviewItem label="Glitch-Akzent (einmalig beim Laden, erneut bei Hover — nur für kurze Display-Texte)">
          <p className="type-display">
            <GlitchText>Jede Woche.</GlitchText>
          </p>
        </PreviewItem>
        <PreviewItem label="Reveal (scroll-gesteuert, ohne JavaScript)">
          <div className="grid gap-4 sm:grid-cols-3">
            {['01', '02', '03'].map((n) => (
              <Reveal key={n}>
                <Card padding="md">
                  <span className="type-caption text-accent-text">{n}</span>
                  <p className="type-body mt-6 text-fg-muted">Erscheint beim Hineinscrollen.</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </PreviewItem>
      </PreviewGroup>
    </>
  );
}
