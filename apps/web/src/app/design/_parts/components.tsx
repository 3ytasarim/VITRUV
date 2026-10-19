import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { ArrowRight, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardLink,
  Eyebrow,
  MediaFrame,
  MetaRow,
  SectionIntro,
  type ButtonProps,
} from '@/components/ui';
import { PreviewGroup, PreviewItem } from './preview-block';

/** Neutral local test patterns (public/_design) — not editorial media. */
const testImage = (portrait: boolean): ResolvedMediaSlot => ({
  desktop: {
    assetId: portrait
      ? '00000000-0000-4000-8000-000000000002'
      : '00000000-0000-4000-8000-000000000001',
    kind: 'IMAGE',
    url: portrait ? '/_design/test-portrait.svg' : '/_design/test-landscape.svg',
    mimeType: 'image/svg+xml',
    width: portrait ? 1080 : 1600,
    height: portrait ? 1350 : 900,
    altText: 'Testmuster',
  },
});

const STATES = [
  { label: 'Default', state: undefined },
  { label: 'Hover', state: 'hover' },
  { label: 'Focus-visible', state: 'focus' },
  { label: 'Active', state: 'active' },
] as const;

const VARIANTS = ['primary', 'secondary', 'ghost'] as const;

function StateButton(props: ButtonProps & { 'data-preview-state'?: string }) {
  return <Button {...props} />;
}

export function Components() {
  return (
    <>
      <PreviewGroup
        id="buttons"
        eyebrow="Komponenten"
        title="Buttons"
        note="Hover/Focus/Active sind hier zur Ansicht erzwungen (data-preview-state); im Einsatz greifen :hover, :focus-visible und :active. Tab-Taste zum Prüfen des echten Fokus verwenden."
      >
        {VARIANTS.map((variant) => (
          <PreviewItem key={variant} label={variant}>
            <div className="flex flex-wrap items-center gap-4">
              {STATES.map(({ label, state }) => (
                <StateButton key={label} variant={variant} data-preview-state={state}>
                  {label}
                </StateButton>
              ))}
              <Button variant={variant} disabled>
                Disabled
              </Button>
              <Button variant={variant} loading>
                Lädt
              </Button>
            </div>
          </PreviewItem>
        ))}
        <PreviewItem label="Größen, Icons, Link, volle Breite">
          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg" icon={<ArrowRight />} iconPosition="end">
              Jetzt bewerben
            </Button>
            <ButtonLink href="#cards" variant="secondary" icon={<ArrowRight />} iconPosition="end">
              Als Link
            </ButtonLink>
            <Button variant="secondary" icon={<Plus />} aria-label="Hinzufügen" />
            <Button variant="ghost" icon={<Plus />} aria-label="Hinzufügen (ghost)" />
          </div>
          <div className="max-w-measure-narrow">
            <Button fullWidth>Volle Breite</Button>
          </div>
        </PreviewItem>
      </PreviewGroup>

      <PreviewGroup
        id="cards"
        eyebrow="Komponenten"
        title="Karten"
        note="Eine Fläche, vier Töne. Inhalte werden zusammengesetzt (Composition), nicht über Dutzende Props gesteuert."
      >
        <div className="vt-autogrid">
          <Card>
            <Eyebrow>Default</Eyebrow>
            <p className="type-title mt-4">Dunkle Fläche</p>
            <p className="type-body-sm mt-2 text-fg-muted">Haarlinie, Standard-Innenabstand.</p>
          </Card>
          <Card tone="outline">
            <Eyebrow>Outline</Eyebrow>
            <p className="type-title mt-4">Transparent</p>
            <p className="type-body-sm mt-2 text-fg-muted">
              Rahmen bleibt an der Schräge sichtbar.
            </p>
          </Card>
          <Card tone="sunken">
            <Eyebrow>Sunken</Eyebrow>
            <p className="type-title mt-4">Abgesenkt</p>
            <p className="type-body-sm mt-2 text-fg-muted">Für verschachtelte Bereiche.</p>
          </Card>
          <Card tone="accent" glow>
            <div className="flex items-start justify-between gap-4">
              <Eyebrow>Accent</Eyebrow>
              <Badge tone="accent">Beliebt</Badge>
            </div>
            <p className="type-title mt-4">Hervorgehoben</p>
            <p className="type-body-sm mt-2 text-fg-muted">Aktiver oder empfohlener Zustand.</p>
          </Card>
        </div>
        <PreviewItem label="Interaktiv (ganze Karte als Link — Tab zum Fokussieren)">
          <div className="vt-autogrid">
            <CardLink href="#cards">
              <Eyebrow>01 / 03</Eyebrow>
              <p className="type-h3 mt-6 italic">Beispiel-Etappe</p>
              <p className="type-body-sm mt-2 text-fg-muted">Ganze Fläche klickbar.</p>
            </CardLink>
            <CardLink href="#cards" tone="accent" data-preview-state="hover">
              <Eyebrow>Hover (erzwungen)</Eyebrow>
              <p className="type-h3 mt-6 italic">Zweite Etappe</p>
            </CardLink>
            <CardLink href="#cards" tone="outline" cut="lg" padding="lg">
              <Eyebrow>Padding lg · cut lg</Eyebrow>
              <p className="type-h3 mt-6 italic">Dritte Etappe</p>
            </CardLink>
          </div>
        </PreviewItem>
      </PreviewGroup>

      <PreviewGroup
        id="media"
        eyebrow="Komponenten"
        title="Media Frame"
        note="Feste Seitenverhältnisse (kein Layout-Shift), object-fit: cover, Chamfer- oder Rundrahmen. Inhalte kommen später aus dem CMS — hier nur lokale Testmuster."
      >
        <div className="vt-autogrid vt-autogrid--lg">
          <PreviewItem label="16:9 · Chamfer · Testbild">
            <MediaFrame ratio="16/9" slot={testImage(false)} />
          </PreviewItem>
          <PreviewItem label="4:5 · Porträt · Testbild">
            <MediaFrame ratio="4/5" slot={testImage(true)} cut="md" />
          </PreviewItem>
          <PreviewItem label="16:9 · Rund (Video-Panel) · leer">
            <MediaFrame ratio="16/9" shape="rounded" placeholderLabel="Video folgt" />
          </PreviewItem>
          <PreviewItem label="1:1 · leer">
            <MediaFrame ratio="1/1" />
          </PreviewItem>
          <PreviewItem label="9:16 · Story · leer">
            <MediaFrame ratio="9/16" cut="sm" className="max-w-56" />
          </PreviewItem>
          <PreviewItem label="21:9 · Testbild (Zuschnitt)">
            <MediaFrame ratio="21/9" slot={testImage(false)} cut="sm" />
          </PreviewItem>
        </div>
      </PreviewGroup>

      <PreviewGroup
        id="text-primitives"
        eyebrow="Komponenten"
        title="Text-Primitive"
        note="Überschriftenebene (h1–h4) ist unabhängig von der visuellen Größe — die Dokumentstruktur bleibt logisch."
      >
        <SectionIntro
          eyebrow="Beispiel-Eyebrow"
          title="Ein Abschnittstitel in zwei Zeilen"
          lead="Ein kurzer Einleitungstext. Inhalte kommen über Props und später aus dem CMS — nichts ist fest eingebaut."
          level={3}
          size="h2"
        />
        <SectionIntro
          eyebrow="Zentriert · Emphasis"
          title="Kursiver Akzenttitel"
          level={3}
          size="h1"
          emphasis
          align="center"
        />
      </PreviewGroup>

      <PreviewGroup
        id="small-ui"
        eyebrow="Komponenten"
        title="Badges & Metadaten"
        note="Status immer mit Text, nie nur über Farbe."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Neutral</Badge>
          <Badge tone="accent">6 Wochen</Badge>
          <Badge tone="success" dot>
            Aktiv
          </Badge>
          <Badge tone="warning" dot>
            Ausstehend
          </Badge>
          <Badge tone="error" dot>
            Fehler
          </Badge>
        </div>
        <MetaRow items={['Teilnehmer 01', '6 Wochen', 'Online']} />
      </PreviewGroup>

      <PreviewGroup
        id="responsive"
        eyebrow="Responsive"
        title="Kompositions-Beispiel"
        note="Prüfen bei 1440 / 820 / 390 / 320 px: Spalten brechen um, Buttons stapeln sich, keine horizontale Scrollbar."
      >
        <SectionIntro
          eyebrow="Beispiel"
          title="Zwei Wege, ein Ziel"
          lead="Neutraler Demo-Inhalt zur Prüfung des Layouts."
          level={3}
          size="h2"
        />
        <div className="vt-autogrid">
          {['Online', 'Vor Ort', 'Kombiniert'].map((name, i) => (
            <Card key={name} tone={i === 1 ? 'accent' : 'default'} glow={i === 1} as="article">
              <div className="flex items-start justify-between gap-4">
                <h4 className="type-title">{name}</h4>
                {i === 1 && <Badge tone="accent">Empfohlen</Badge>}
              </div>
              <MetaRow className="mt-3" items={['Beispiel', `${(i + 1) * 4} Wochen`]} />
              <p className="type-body-sm mt-4 text-fg-muted">
                Platzhaltertext für eine spätere Paketbeschreibung aus dem CMS.
              </p>
              <Button
                className="mt-6"
                fullWidth
                variant={i === 1 ? 'primary' : 'secondary'}
                icon={<ArrowRight />}
                iconPosition="end"
              >
                Auswählen
              </Button>
            </Card>
          ))}
        </div>
      </PreviewGroup>
    </>
  );
}
