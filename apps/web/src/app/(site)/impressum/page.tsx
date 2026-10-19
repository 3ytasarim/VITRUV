import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';

// Placeholder until the owner-approved legal text exists: keep it out of search indexes.
export const metadata: Metadata = { title: 'Impressum', robots: { index: false, follow: true } };

export default function ImpressumPage() {
  return (
    <Container className="py-(--section-space)">
      <h1 className="type-h1">Impressum</h1>
      <p className="type-body mt-6 max-w-measure text-fg-muted">
        Platzhalter. Die rechtlich verbindlichen Angaben werden aus der Quelle „Impressum.dc.html“
        übernommen und vom Inhaber geprüft, bevor die Seite live geht.
      </p>
    </Container>
  );
}
