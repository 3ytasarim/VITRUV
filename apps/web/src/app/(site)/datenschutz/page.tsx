import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';

// Placeholder until the owner-approved privacy policy exists: keep it out of search indexes.
export const metadata: Metadata = {
  title: 'Datenschutz',
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <Container className="py-(--section-space)">
      <h1 className="type-h1">Datenschutz</h1>
      <p className="type-body mt-6 max-w-measure text-fg-muted">
        Platzhalter. Die Datenschutzerklärung wird vom Inhaber rechtlich geprüft und vor dem Start
        der Website hier veröffentlicht.
      </p>
    </Container>
  );
}
