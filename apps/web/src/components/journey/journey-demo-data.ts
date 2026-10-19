import type { JourneyContent } from './journey-types';

/**
 * Current public demo content for the Journey section. Same shape as the CMS contract (seeded into the CMS as initial content);
 * no personal or customer information. Media are placeholders until production assets exist.
 */
export const JOURNEY_DEMO: JourneyContent = {
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
