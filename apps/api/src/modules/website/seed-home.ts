import type { SectionContent } from '@vitruv/contracts';

/**
 * Initial content of the `home` section — the copy of the reference design
 * `Website Funktional.dc.html` (owner decision 2026-10-28). Fictional participant quotes as in
 * the prototype; no media (every slot is filled in the admin). The Bewerben channels point to
 * the contact form until the owner enters the real Instagram / WhatsApp / e-mail links.
 */
export const HOME_REFERENCE: SectionContent<'home'> = {
  hero: {
    eyebrow: '// Funktionales 1:1 Coaching',
    lines: ['Echter Plan.', 'Echte Begleitung.', 'Jede Woche.'],
    body: 'Ein persönlicher Trainings- und Ernährungsplan, ein Coach, der jede Woche mit dir nachjustiert, und eine direkte Antwort, wenn du feststeckst. Kein PDF, das du nie öffnest.',
    primary: {
      label: 'Jetzt bewerben',
      href: '#bewerben',
    },
    secondary: {
      label: 'Pakete ansehen',
      href: '#pakete',
    },
    note: 'Gecoacht von Philipp, Unternehmer und Vater, der selbst erlebt hat, wie es ist, wenn der Körper nur noch mitläuft. Online und vor Ort in Zypern und Deutschland.',
    media: null,
  },
  intro: {
    caption: 'So funktioniert das Coaching, in zwei Minuten erklärt',
    media: null,
  },
  results: {
    eyebrow: 'Ergebnisse',
    title: 'Die Ergebnisse sprechen für sich.',
    videos: [
      {
        id: 'video-1',
        quote: '„In sechs Wochen bin ich stärker geworden als in den zehn Jahren davor.“',
        who: 'Teilnehmer 01',
        media: null,
      },
      {
        id: 'video-2',
        quote: '„Mehr Kraft, besserer Schlaf und endlich ein Plan, der funktioniert.“',
        who: 'Teilnehmer 02',
        media: null,
      },
    ],
    swipeHint: 'Wischen →',
    gallery: [
      {
        id: 'ergebnis-1',
        who: 'Teilnehmer 01',
        media: null,
      },
      {
        id: 'ergebnis-2',
        who: 'Teilnehmer 02',
        media: null,
      },
      {
        id: 'ergebnis-3',
        who: 'Teilnehmer 03',
        media: null,
      },
      {
        id: 'ergebnis-4',
        who: 'Teilnehmer 04',
        media: null,
      },
      {
        id: 'ergebnis-5',
        who: 'Teilnehmer 05',
        media: null,
      },
      {
        id: 'ergebnis-6',
        who: 'Teilnehmer 06',
        media: null,
      },
      {
        id: 'ergebnis-7',
        who: 'Teilnehmer 07',
        media: null,
      },
      {
        id: 'ergebnis-8',
        who: 'Teilnehmer 08',
        media: null,
      },
    ],
  },
  journey: {
    eyebrow: 'Dein Weg',
    title: 'Vier Etappen. Ein Ziel.',
    stages: [
      {
        id: 'ernaehrung',
        name: 'Ernährung',
        title: 'Tanke die richtige Energie.',
        text: 'Ernährung ist das Fundament. Wir bringen Ordnung in das, was du isst, damit dein Körper versorgt ist und jedes Training wirklich ankommt.',
        media: null,
      },
      {
        id: 'mobilitaet',
        name: 'Mobilität',
        title: 'Bewege dich frei.',
        text: 'Beweglichkeit zurückgewinnen, Verspannungen lösen, Bewegungen sauber ausführen. Damit dein Körper schmerzfrei und athletisch funktioniert.',
        media: null,
      },
      {
        id: 'balance',
        name: 'Balance',
        title: 'Finde deinen Rhythmus.',
        text: 'Belastung und Erholung im Gleichgewicht. Schlaf, Regeneration und Stabilität, damit du Woche für Woche stärker zurückkommst.',
        media: null,
      },
      {
        id: 'kraft',
        name: 'Kraft',
        title: 'Durchbreche deine Grenzen.',
        text: 'Mit klarer Progression baust du einen Körper auf, der Herausforderungen standhält und auf den du dich verlassen kannst.',
        media: null,
      },
    ],
  },
  voices: {
    eyebrow: 'Das sagen Teilnehmer',
    items: [
      {
        id: 'stimme-1',
        quote:
          'Ich hätte nie gedacht, dass sich mein Körper in so kurzer Zeit so verändern kann. Ich bin stärker, beweglicher und habe endlich wieder Energie für meinen Alltag.',
        who: 'Teilnehmer 01',
      },
      {
        id: 'stimme-2',
        quote:
          'Der wöchentliche Check-in hat alles verändert. Zum ersten Mal habe ich nicht nach drei Wochen aufgehört, weil jemand drangeblieben ist, wenn ich es nicht war.',
        who: 'Teilnehmer 02',
      },
      {
        id: 'stimme-3',
        quote:
          'Ich wusste eigentlich, was zu tun ist, habe es aber nie umgesetzt. Mit einem klaren Plan und echter Begleitung lief es plötzlich fast von allein.',
        who: 'Teilnehmer 03',
      },
      {
        id: 'stimme-4',
        quote:
          'Training und Ernährung passen endlich in meinen Kalender. Keine Rückenschmerzen mehr und ich schlafe wieder durch.',
        who: 'Teilnehmer 04',
      },
    ],
  },
  doubts: {
    eyebrow: 'Wo die meisten starten',
    title: 'Du hast dich das selbst sagen hören.',
    items: [
      {
        id: 'satz-1',
        text: 'Ich habe keine Zeit für Sport.',
      },
      {
        id: 'satz-2',
        text: 'Ich habe es schon so oft versucht und immer wieder aufgehört.',
      },
      {
        id: 'satz-3',
        text: 'Ich bin gerade viel zu weit weg von fit.',
      },
    ],
    outro:
      'Jeder dieser Sätze ist ein ganz normaler Ausgangspunkt, kein Grund zu warten. Die meisten, die sich bewerben, haben seit Jahren nicht mehr regelmäßig trainiert. Das Coaching ist genau dafür gebaut: dich von null zu einem Körper zu bringen, der im Alltag funktioniert, und dann weiter.',
    outroHighlight: 'Ausgangspunkt',
  },
  included: {
    eyebrow: 'Was drin ist',
    title: 'Das ist kein Programm, das du vergisst.',
    lead: 'Coaching heißt: Ein echter Mensch prüft jede Woche deinen Fortschritt. Kein einmaliges PDF, keine App, die dich allein lässt.',
    items: [
      {
        id: 'leistung-1',
        title: 'Kostenloses Kennenlerngespräch',
        text: 'Bevor du dich festlegst, sprechen wir über deine Ziele, deinen Alltag und wo du körperlich gerade stehst.',
      },
      {
        id: 'leistung-2',
        title: 'Ein Plan für jeden Tag',
        text: 'Was du trainierst und was du isst, Tag für Tag. Keine Vorlage, sondern gebaut für dich.',
      },
      {
        id: 'leistung-3',
        title: 'Wöchentlicher Check-in',
        text: 'Jede Woche schauen wir, was passiert ist, und passen alles an: Übungen, Umfang, Ernährung, Erholung.',
      },
      {
        id: 'leistung-4',
        title: 'Direkter Draht',
        text: 'Fragen warten nicht bis zum nächsten Termin. Schreib mir jederzeit und du bekommst eine echte Antwort.',
      },
      {
        id: 'leistung-5',
        title: 'Übungen gezeigt, nicht nur beschrieben',
        text: 'Jede Bewegung per Video erklärt, damit du nie raten musst, ob deine Technik stimmt.',
      },
      {
        id: 'leistung-6',
        title: 'Passt in dein Leben',
        text: 'Studio, zu Hause oder im Hotelzimmer. Der Plan funktioniert mit dem, was du hast, und mit der Zeit, die du hast.',
      },
    ],
  },
  packages: {
    eyebrow: 'Pakete',
    title: 'Zwei Wege, mit mir zu arbeiten.',
    lead: 'Online, wenn du selbstständig trainierst. Mit Intensivwoche, wenn du den Durchbruch vor Ort willst.',
    items: [
      {
        id: 'paket-1',
        name: 'Online Coaching',
        label: '6 Wochen',
        featured: false,
        text: 'Training und Ernährung 1:1, komplett online. Für alle, die selbstständig trainieren und eng begleitet werden wollen.',
        features: [
          'Kennenlerngespräch + wöchentlicher Check-in',
          'Tagesgenauer Trainings- und Ernährungsplan',
          'Direkter Draht per Nachricht',
          'Übungsvideos zu jeder Bewegung',
        ],
        cta: {
          label: 'Bewerben →',
          href: '#bewerben',
        },
      },
      {
        id: 'paket-2',
        name: 'Coaching + Intensivwoche',
        label: 'Beliebt',
        featured: true,
        text: 'Alles aus dem Online Coaching, dazu eine Woche gemeinsames Training vor Ort in Zypern oder Deutschland.',
        features: [
          '6 Wochen Online Coaching',
          '1 Woche Training vor Ort',
          'Technik und Routinen direkt verankert',
        ],
        note: 'Reisekosten zusätzlich',
        cta: {
          label: 'Bewerben →',
          href: '#bewerben',
        },
      },
    ],
  },
  steps: {
    eyebrow: 'So läuft es ab',
    title: 'Von der Bewerbung zum ersten Check-in.',
    items: [
      {
        id: 'schritt-1',
        title: 'Bewerben',
        text: 'Erzähl mir, wo du stehst, wie viel Zeit du hast und was dein Körper wieder können soll.',
      },
      {
        id: 'schritt-2',
        title: 'Kennenlerngespräch',
        text: 'Wir sprechen über Ziele, Alltag und Ausgangslage, bevor irgendetwas geplant wird.',
      },
      {
        id: 'schritt-3',
        title: 'Dein Plan kommt',
        text: 'Ein tagesgenauer Trainings- und Ernährungsplan, gebaut um deinen Kalender.',
      },
      {
        id: 'schritt-4',
        title: 'Die Woche trainieren',
        text: 'Du folgst dem Plan und schickst Fragen oder Technikvideos, wann immer du willst.',
      },
      {
        id: 'schritt-5',
        title: 'Wöchentlicher Check-in',
        text: 'Wir werten die Woche aus und der Plan wird für die nächste angepasst.',
      },
    ],
  },
  training: {
    eyebrow: 'Im Training',
    title: 'Ein Körper, der im Alltag funktioniert.',
    lead: 'Nicht über Nacht und nicht durch Talent, sondern durch denselben wöchentlichen Prozess, dem auch dein Plan folgt.',
    items: [
      {
        id: 'training-1',
        label: 'Kraft',
        text: 'Belastbarkeit aus jedem Winkel.',
        media: null,
      },
      {
        id: 'training-2',
        label: 'Mobilität',
        text: 'Frei und schmerzfrei bewegen.',
        media: null,
      },
      {
        id: 'training-3',
        label: 'Kondition',
        text: 'Länger durchhalten, jeden Tag.',
        media: null,
      },
      {
        id: 'training-4',
        label: 'Regeneration',
        text: 'Stärker zurückkommen.',
        media: null,
      },
    ],
  },
  coach: {
    eyebrow: 'Dein Coach',
    name: 'Philipp',
    facts: ['Zypern · Deutschland', 'Unternehmer und Vater', 'Online und vor Ort'],
    paragraphs: [
      'Über ein Jahrzehnt habe ich mich über Leistung definiert und dabei jeden Bezug zu meinem Körper verloren. Mit 28 lebte ich neun Monate auf 30 m² in meinem eigenen Büro, die Beziehung zerbrochen, mein Sohn wenige Monate alt.',
      'Der Weg zurück begann mit Training. Nicht als Hobby, sondern als tägliche Entscheidung. Mit jeder Einheit kam ein Stück Kontrolle zurück, danach Ernährung, Schlaf und eine Energie, die ich jahrelang nicht mehr hatte.',
      'Ich bin nicht der stärkste Coach und will es auch nicht sein. Aber ich weiß, wie es ist, mit vollem Kalender bei null anzufangen. Genau dafür baue ich Pläne: funktional, alltagstauglich und so, dass sie auch nach dem Coaching bleiben.',
    ],
    closing: 'Ich coache online und vor Ort in Zypern und Deutschland.',
    media: null,
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Bevor du dich bewirbst.',
    items: [
      {
        id: 'frage-1',
        question: 'Was ist der Unterschied zwischen den Paketen?',
        answer:
          'Beide sind 1:1 Coaching für Training und Ernährung. Die Intensivwoche ergänzt eine Woche gemeinsames Training vor Ort.',
      },
      {
        id: 'frage-2',
        question: 'Brauche ich ein Fitnessstudio?',
        answer:
          'Nein. Der Plan richtet sich nach dem, was du hast: Studio, ein paar Gewichte zu Hause oder nur dein eigener Körper.',
      },
      {
        id: 'frage-3',
        question: 'Ich bin völlig untrainiert. Geht das trotzdem?',
        answer:
          'Genau das ist der normale Ausgangspunkt. Dein Plan startet dort, wo du wirklich stehst.',
      },
      {
        id: 'frage-4',
        question: 'Wie viel Zeit brauche ich pro Woche?',
        answer:
          'Die meisten starten mit drei Einheiten pro Woche. Wir planen um deinen Kalender herum, nicht dagegen.',
      },
      {
        id: 'frage-5',
        question: 'Wie oft sprechen wir?',
        answer:
          'Einmal zum Start, danach jede Woche ein Check-in. Dazwischen erreichst du mich jederzeit per Nachricht.',
      },
      {
        id: 'frage-6',
        question: 'Ist Ernährung wirklich enthalten?',
        answer:
          'Ja. Du bekommst nicht nur einen Trainingsplan, sondern auch, was du essen solltest, abgestimmt auf deinen Alltag.',
      },
    ],
  },
  cta: {
    eyebrow: 'Starte, wo du stehst',
    title: 'Dein stärkerer Körper beginnt mit einer Bewerbung.',
    body: 'Sag mir, wo du stehst und wo du hinwillst. Im kostenlosen Kennenlerngespräch klären wir den Rest.',
    action: {
      label: 'Jetzt bewerben',
      href: '#bewerben',
    },
    media: null,
  },
  apply: {
    eyebrow: 'Bewerben',
    title: 'Schreib mir, wie es dir passt.',
    lead: 'Nutze den Kanal, den du wirklich checkst. Erzähl mir kurz, wo du stehst, wie viel Zeit du hast und was du erreichen willst.',
    channels: [
      {
        id: 'instagram',
        tag: 'IG',
        title: 'Instagram',
        text: 'Schreib mir eine DM, der schnellste Weg zu mir im Alltag.',
        cta: 'Zu Instagram →',
        href: '/kontakt',
      },
      {
        id: 'whatsapp',
        tag: 'WA',
        title: 'WhatsApp',
        text: 'Direkt per Nachricht, meistens bekommst du noch am selben Tag eine Antwort.',
        cta: 'WhatsApp schreiben →',
        href: '/kontakt',
      },
      {
        id: 'email',
        tag: '@',
        title: 'E-Mail',
        text: 'Lieber ausführlich? Schick mir alles in Ruhe per Mail.',
        cta: 'E-Mail senden →',
        href: '/kontakt',
      },
    ],
  },
  headerCta: {
    label: 'Jetzt bewerben',
    href: '/#bewerben',
  },
  menu: [
    {
      id: 'leistung',
      label: 'Leistung',
      href: '/#leistung',
    },
    {
      id: 'pakete',
      label: 'Pakete',
      href: '/#pakete',
    },
    {
      id: 'ablauf',
      label: 'Ablauf',
      href: '/#ablauf',
    },
    {
      id: 'coach',
      label: 'Coach',
      href: '/#coach',
    },
    {
      id: 'faq',
      label: 'FAQ',
      href: '/#faq',
    },
  ],
};
