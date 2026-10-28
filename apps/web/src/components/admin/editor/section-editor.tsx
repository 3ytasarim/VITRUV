'use client';

import type { AdminMediaAsset, SectionContent, WebsiteSectionSummary } from '@vitruv/contracts';
import type { WebsiteSectionType } from '@vitruv/shared';
import { Eye, Save, Send, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { discardDraftAction, publishAction, saveDraftAction } from '@/app/admin/website-actions';
import { Badge, Button, ButtonLink } from '@/components/ui';
import { MediaIndexProvider } from '../media/media-index';
import { formatDateTime } from '../section-registry';
import {
  errorsFromDetails,
  isEqualContent,
  validateContent,
  type FieldErrors,
} from './editor-state';
import { AboutEditor } from './about-editor';
import { CoachingEditor } from './coaching-editor';
import { CtaEditor } from './cta-editor';
import { FaqEditor } from './faq-editor';
import { FooterEditor } from './footer-editor';
import { HeroEditor } from './hero-editor';
import { JourneyEditor } from './journey-editor';
import { PackagesEditor } from './packages-editor';
import { PillarsEditor } from './pillars-editor';
import { ResultsEditor } from './results-editor';
import { SeoEditor } from './seo-editor';
import { SituationsEditor } from './situations-editor';
import { GalleryEditor } from './gallery-editor';
import { HomeEditor } from './home-editor';
import { StepsEditor } from './steps-editor';
import { DEFAULT_THEME, ThemeEditor } from './theme-editor';

export interface EditorProps<T extends WebsiteSectionType> {
  value: SectionContent<T>;
  onChange: (value: SectionContent<T>) => void;
  errors: FieldErrors;
}

type AnyEditor = ComponentType<EditorProps<WebsiteSectionType>>;

/**
 * Section-specific editors (sharing field primitives) — no single giant form.
 * A complete Record: a new section type does not compile until it has an editor.
 */
const EDITORS: Record<WebsiteSectionType, AnyEditor> = {
  hero: HeroEditor as AnyEditor,
  results: ResultsEditor as AnyEditor,
  journey: JourneyEditor as AnyEditor,
  coaching: CoachingEditor as AnyEditor,
  packages: PackagesEditor as AnyEditor,
  about: AboutEditor as AnyEditor,
  faq: FaqEditor as AnyEditor,
  cta: CtaEditor as AnyEditor,
  footer: FooterEditor as AnyEditor,
  pillars: PillarsEditor as AnyEditor,
  situations: SituationsEditor as AnyEditor,
  steps: StepsEditor as AnyEditor,
  gallery: GalleryEditor as AnyEditor,
  home: HomeEditor as AnyEditor,
  theme: ThemeEditor as AnyEditor,
  seo: SeoEditor as AnyEditor,
};

/** Starting point when a section has no content yet (minimal valid shape, empty text). */
const EMPTY: Record<WebsiteSectionType, Record<string, unknown>> = {
  hero: { title: '', primaryCta: { label: '', href: '' }, media: null },
  journey: {
    eyebrow: '',
    title: '',
    stages: [{ id: 'etappe-1', name: '', title: '', description: '', media: null, enabled: true }],
  },
  faq: { title: '', items: [{ id: 'frage-1', question: '', answer: '' }] },
  results: { title: '', items: [] },
  coaching: { title: '', features: [], media: null },
  packages: { title: '', packages: [] },
  about: { title: '', paragraphs: [''], highlights: [], media: null },
  cta: { title: '', action: { label: '', href: '' }, media: null },
  footer: { navigation: [], legal: [], contact: {}, social: [] },
  pillars: {
    title: '',
    pillars: [{ id: 'saeule-1', name: '', title: '', paragraphs: [], facets: [], media: null }],
  },
  situations: { title: '', items: [] },
  steps: { title: '', items: [] },
  gallery: { title: '', items: [], autoplay: true },
  home: {
    hero: { lines: [''], primary: { label: '', href: '' }, media: null },
    intro: { media: null },
    results: { title: '', videos: [], gallery: [] },
    journey: {
      title: '',
      stages: [{ id: 'etappe-1', name: '', title: '', text: '', media: null }],
    },
    voices: { items: [] },
    doubts: { title: '', items: [] },
    included: { title: '', items: [] },
    packages: { title: '', items: [] },
    steps: { title: '', items: [] },
    training: { title: '', items: [] },
    coach: { name: '', facts: [], paragraphs: [], media: null },
    faq: { title: '', items: [] },
    cta: { title: '', action: { label: '', href: '' }, media: null },
    apply: { title: '', channels: [] },
    headerCta: { label: '', href: '' },
    menu: [],
  },
  theme: { ...DEFAULT_THEME },
  seo: { title: '', description: '', siteName: '', ogImage: null, faqStructuredData: false },
};

type Feedback = { tone: 'error' | 'success' | 'warning'; text: string; items?: string[] };

/**
 * Editing workflow for one section: Edit → Save draft → Preview → Publish.
 * The public website keeps the published version until "Veröffentlichen" is pressed; all
 * validation is repeated by the API (the client check only gives faster feedback).
 */
export function SectionEditor({
  sectionKey,
  type,
  summary,
  draft,
  published,
  media,
  previewable = true,
}: {
  sectionKey: string;
  type: WebsiteSectionType;
  summary: WebsiteSectionSummary;
  draft: Record<string, unknown> | null;
  published: Record<string, unknown> | null;
  media: readonly AdminMediaAsset[];
  /** Page settings (SEO) have nothing to preview visually. */
  previewable?: boolean;
}) {
  const router = useRouter();
  const Editor = EDITORS[type];
  const initial = draft ?? published ?? EMPTY[type];
  const [value, setValue] = useState<Record<string, unknown>>(initial);
  const [saved, setSaved] = useState<Record<string, unknown>>(initial);
  const [hasDraft, setHasDraft] = useState(summary.hasDraft);
  const [hasPublished, setHasPublished] = useState(summary.hasPublished);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | 'discard' | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const dirty = !isEqualContent(value, saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const show = (next: Feedback) => {
    setFeedback(next);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  };

  async function save() {
    const clientErrors = validateContent(type, value);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      show({
        tone: 'error',
        text: 'Bitte die markierten Felder korrigieren.',
        items: Object.values(clientErrors),
      });
      return;
    }
    setBusy('save');
    const result = await saveDraftAction(sectionKey, value);
    setBusy(null);
    if (!result.ok) {
      setErrors(errorsFromDetails(result.details));
      show({ tone: 'error', text: result.message, items: result.details.map((d) => d.message) });
      return;
    }
    setSaved(value);
    setHasDraft(true);
    setErrors({});
    const warnings = result.data.warnings;
    show(
      warnings.length > 0
        ? {
            tone: 'warning',
            text: 'Entwurf gespeichert — vor dem Veröffentlichen beachten:',
            items: warnings.map((w) => w.message),
          }
        : { tone: 'success', text: 'Entwurf gespeichert. Die Website ist unverändert.' },
    );
  }

  async function publish() {
    setBusy('publish');
    const result = await publishAction(sectionKey);
    setBusy(null);
    if (!result.ok) {
      setErrors(errorsFromDetails(result.details));
      show({ tone: 'error', text: result.message, items: result.details.map((d) => d.message) });
      return;
    }
    setHasDraft(false);
    setHasPublished(true);
    show({ tone: 'success', text: 'Veröffentlicht. Die Website zeigt jetzt diese Version.' });
    router.refresh();
  }

  async function discard() {
    setBusy('discard');
    const result = await discardDraftAction(sectionKey);
    setBusy(null);
    if (!result.ok) {
      show({ tone: 'error', text: result.message });
      return;
    }
    const restored = published ?? EMPTY[type];
    setValue(restored);
    setSaved(restored);
    setHasDraft(false);
    setErrors({});
    show({ tone: 'success', text: 'Entwurf verworfen.' });
    router.refresh();
  }

  const feedbackClass =
    feedback?.tone === 'error'
      ? 'border-error'
      : feedback?.tone === 'warning'
        ? 'border-warning'
        : 'border-success';

  return (
    <MediaIndexProvider initial={media}>
      <div className="flex flex-col gap-6">
        <div className="z-10 -mx-(--gutter) flex flex-wrap md:sticky md:top-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg px-(--gutter) py-3">
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            {hasPublished && <Badge tone="success">Veröffentlicht</Badge>}
            {hasDraft && <Badge tone="warning">Entwurf gespeichert</Badge>}
            {dirty && <Badge tone="accent">Ungespeicherte Änderungen</Badge>}
            {!hasPublished && !hasDraft && !dirty && <Badge>Kein Inhalt</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            {previewable && (hasDraft || hasPublished) && (
              <ButtonLink
                variant="ghost"
                icon={<Eye />}
                href={`/admin/website/vorschau/${sectionKey}`}
                target="_blank"
              >
                Vorschau
              </ButtonLink>
            )}
            {hasDraft && (
              <Button
                variant="ghost"
                icon={<Undo2 />}
                loading={busy === 'discard'}
                disabled={busy !== null}
                onClick={discard}
              >
                Entwurf verwerfen
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<Save />}
              loading={busy === 'save'}
              disabled={busy !== null || !dirty}
              onClick={save}
            >
              Entwurf speichern
            </Button>
            <Button
              icon={<Send />}
              loading={busy === 'publish'}
              disabled={busy !== null || dirty || !hasDraft}
              onClick={publish}
              title={
                dirty
                  ? 'Zuerst speichern'
                  : !hasDraft
                    ? 'Keine Änderungen zum Veröffentlichen'
                    : undefined
              }
            >
              Veröffentlichen
            </Button>
          </div>
        </div>

        <p className="type-caption text-fg-subtle">
          Veröffentlicht: {formatDateTime(summary.publishedAt)} · Entwurf zuletzt gespeichert:{' '}
          {formatDateTime(summary.draftUpdatedAt)}
        </p>

        <div
          ref={feedbackRef}
          tabIndex={-1}
          role={feedback?.tone === 'error' ? 'alert' : 'status'}
          className={feedback ? `rounded-xs border px-4 py-3 ${feedbackClass}` : 'sr-only'}
        >
          {feedback && (
            <>
              <p className="type-body-sm font-semibold">{feedback.text}</p>
              {feedback.items && feedback.items.length > 0 && (
                <ul className="type-body-sm mt-2 list-disc pl-5 text-fg-muted">
                  {[...new Set(feedback.items)].slice(0, 8).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <Editor
          value={value as SectionContent<WebsiteSectionType>}
          onChange={(next) => setValue(next as Record<string, unknown>)}
          errors={errors}
        />
      </div>
    </MediaIndexProvider>
  );
}
