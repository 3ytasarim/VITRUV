import type { SectionContent } from '@vitruv/contracts';
import type { WebsiteSectionType } from '@vitruv/shared';

/**
 * Initial homepage content for development — neutral VITRUV copy only.
 *
 * Deliberately NOT included: biography details, health or family information, customer names,
 * results/testimonials, prices or any text from private source material. Results and packages
 * start empty; the coach fills them in the CMS. No media is referenced (no source photos).
 * The Journey stages use the four approved stage names and texts.
 */
export const HOME_PAGE = { slug: 'home', title: 'Startseite' } as const;

/**
 * Stable keys + order. `sortOrder` is explicit for sections added later so the idempotent seed
 * slots them between existing rows (existing rows keep their stored order).
 */
export const HOME_SECTIONS: readonly {
  key: string;
  type: WebsiteSectionType;
  sortOrder?: number;
}[] = [
  { key: 'hero', type: 'hero' },
  { key: 'results', type: 'results' },
  { key: 'journey', type: 'journey' },
  { key: 'coaching', type: 'coaching' },
  { key: 'packages', type: 'packages' },
  { key: 'about', type: 'about' },
  { key: 'faq', type: 'faq' },
  { key: 'cta', type: 'cta' },
  { key: 'footer', type: 'footer' },
  { key: 'seo', type: 'seo' },
  { key: 'situations', type: 'situations', sortOrder: 15 },
  { key: 'gallery', type: 'gallery', sortOrder: 12 },
  { key: 'pillars', type: 'pillars', sortOrder: 35 },
  { key: 'steps', type: 'steps', sortOrder: 45 },
  { key: 'theme', type: 'theme', sortOrder: 990 },
];

const hero: SectionContent<'hero'> = {
  eyebrow: 'Personal Coaching',
  title: 'Stärker. Beweglicher. Ausgeglichener.',
  highlight: 'Stärker.',
  body: 'Ganzheitliches Coaching für Ernährung, Mobilität, Balance und Kraft – strukturiert und auf dich abgestimmt.',
  primaryCta: { label: 'Erstgespräch vereinbaren', href: '/#kontakt' },
  secondaryCta: { label: 'Dein Weg', href: '#journey' },
  media: null,
};

const results: SectionContent<'results'> = {
  eyebrow: 'Ergebnisse',
  title: 'Fortschritt, der sichtbar wird.',
  intro: 'Ergebnisse werden im CMS gepflegt.',
  items: [],
};

const journey: SectionContent<'journey'> = {
  eyebrow: 'Dein Weg',
  title: 'Vier Etappen. Ein Ziel.',
  stages: [
    {
      id: 'ernaehrung',
      name: 'Ernährung',
      title: 'Tanke die richtige Energie.',
      description:
        'Ernährung ist das Fundament. Wir bringen Ordnung in das, was du isst, damit dein Körper versorgt ist und jedes Training wirklich ankommt.',
      media: null,
      enabled: true,
    },
    {
      id: 'mobilitaet',
      name: 'Mobilität',
      title: 'Bewege dich frei.',
      description:
        'Beweglichkeit zurückgewinnen, Verspannungen lösen, Bewegungen sauber ausführen. Damit dein Körper schmerzfrei und athletisch funktioniert.',
      media: null,
      enabled: true,
    },
    {
      id: 'balance',
      name: 'Balance',
      title: 'Finde deinen Rhythmus.',
      description:
        'Belastung und Erholung im Gleichgewicht. Schlaf, Regeneration und Stabilität, damit du Woche für Woche stärker zurückkommst.',
      media: null,
      enabled: true,
    },
    {
      id: 'kraft',
      name: 'Kraft',
      title: 'Durchbreche deine Grenzen.',
      description:
        'Mit klarer Progression baust du einen Körper auf, der Herausforderungen standhält und auf den du dich verlassen kannst.',
      media: null,
      enabled: true,
    },
  ],
};

const coaching: SectionContent<'coaching'> = {
  eyebrow: 'Coaching',
  title: 'So arbeiten wir zusammen.',
  intro: 'Ein klarer Ablauf statt Zufall.',
  features: [
    {
      id: 'analyse',
      title: 'Analyse',
      description: 'Wir klären Ausgangslage, Ziele und deinen Alltag.',
    },
    {
      id: 'plan',
      title: 'Plan',
      description: 'Du bekommst einen Plan, der zu deinem Alltag passt.',
    },
    {
      id: 'begleitung',
      title: 'Begleitung',
      description: 'Regelmäßige Rückmeldung und Anpassung auf dem Weg.',
    },
  ],
  media: null,
};

const packages: SectionContent<'packages'> = {
  eyebrow: 'Pakete',
  title: 'Das passende Paket für dich.',
  intro: 'Pakete werden im CMS gepflegt.',
  packages: [],
};

const about: SectionContent<'about'> = {
  eyebrow: 'Über Philipp',
  title: 'Dein Coach.',
  paragraphs: ['Die Vorstellung wird im CMS gepflegt.'],
  highlights: [],
  media: null,
};

const faq: SectionContent<'faq'> = {
  eyebrow: 'FAQ',
  title: 'Häufige Fragen.',
  items: [
    {
      id: 'erstgespraech',
      question: 'Wie beginnt die Zusammenarbeit?',
      answer:
        'Mit einem unverbindlichen Erstgespräch, in dem wir deine Ziele und Möglichkeiten klären.',
    },
    {
      id: 'vorkenntnisse',
      question: 'Brauche ich Trainingserfahrung?',
      answer: 'Nein. Der Plan richtet sich nach deinem aktuellen Stand.',
    },
  ],
};

const cta: SectionContent<'cta'> = {
  eyebrow: 'Nächster Schritt',
  title: 'Bereit für den ersten Schritt?',
  body: 'Vereinbare ein unverbindliches Erstgespräch.',
  action: { label: 'Erstgespräch vereinbaren', href: '/#kontakt' },
  media: null,
};

const footer: SectionContent<'footer'> = {
  tagline: 'VITRUV Coaching',
  navigation: [],
  legal: [
    { id: 'impressum', label: 'Impressum', href: '/impressum' },
    { id: 'datenschutz', label: 'Datenschutz', href: '/datenschutz' },
  ],
  contact: {},
  social: [],
};

const seo: SectionContent<'seo'> = {
  title: 'VITRUV Coaching – Ernährung, Mobilität, Balance und Kraft',
  description:
    'Ganzheitliches Personal Coaching für Ernährung, Mobilität, Balance und Kraft – strukturiert und auf dich abgestimmt.',
  siteName: 'VITRUV',
  ogImage: null,
  faqStructuredData: true,
};

/** Method sections (redesign 2026-10-16): neutral structure only; the coach writes the copy. */
const pillars: SectionContent<'pillars'> = {
  eyebrow: 'Drei Säulen',
  title: 'Körper. Seele. Geist.',
  highlight: 'Seele.',
  intro: 'Drei Ebenen, die aufeinander aufbauen.',
  pillars: [
    {
      id: 'koerper',
      name: 'Körper',
      title: 'Corpus',
      keywords: 'Vitalität · Kraft · Balance',
      lead: 'Der Weg beginnt dort, wo du dich unmittelbar spüren kannst.',
      paragraphs: [],
      facets: [],
      media: null,
    },
    {
      id: 'seele',
      name: 'Seele',
      title: 'Anima',
      keywords: 'Erkenntnis · Verbundenheit · Einklang',
      lead: 'Der Blick nach innen.',
      paragraphs: [],
      facets: [],
      media: null,
    },
    {
      id: 'geist',
      name: 'Geist',
      title: 'Mens',
      keywords: 'Bewusstsein · Selbstführung · Schöpfung',
      lead: 'Bewusst entscheiden, bewusst gestalten.',
      paragraphs: [],
      facets: [],
      media: null,
    },
  ],
};

const situations: SectionContent<'situations'> = {
  eyebrow: 'Ausgangspunkte',
  title: 'Lebenssituationen, in denen Menschen mit mir arbeiten.',
  highlight: 'in denen',
  items: [],
};

const gallery: SectionContent<'gallery'> = {
  eyebrow: 'Einblicke',
  title: 'Training draußen.',
  highlight: 'draußen',
  items: [],
  autoplay: true,
};

const steps: SectionContent<'steps'> = {
  eyebrow: 'Neun Stufen',
  title: 'Drei Säulen, je drei Schritte.',
  highlight: 'drei',
  items: [],
};
/** Website colours = the current Greek Harmony palette (design tokens), editable in the admin. */
const theme: SectionContent<'theme'> = {
  background: '#f2efe9',
  surface: '#faf8f4',
  surfaceSunken: '#e9e4db',
  heading: '#2b2825',
  text: '#2b2825',
  textMuted: '#57524c',
  textSubtle: '#6f6a64',
  eyebrow: '#7a6747',
  button: '#2b2825',
  buttonText: '#f2efe9',
  accent: '#a3906f',
  accentSecondary: '#cf5a3c',
  dark: '#2b2825',
};

export const HOME_SEED_CONTENT: { [K in WebsiteSectionType]: SectionContent<K> } = {
  hero,
  results,
  journey,
  coaching,
  packages,
  about,
  faq,
  cta,
  footer,
  pillars,
  situations,
  steps,
  gallery,
  theme,
  seo,
};
