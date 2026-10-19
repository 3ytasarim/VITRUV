import { ButtonLink, Container } from '@/components/ui';

/**
 * Shown when the published content can not be loaded (API temporarily unreachable). Structural
 * system UI only — it never substitutes hardcoded marketing content for the CMS.
 */
export function SiteUnavailable() {
  return (
    <Container className="grid place-content-center gap-6 py-(--section-space) text-center">
      <h1 className="type-h2">Die Seite ist gerade nicht erreichbar.</h1>
      <p className="type-body mx-auto max-w-measure text-fg-muted">
        Bitte versuche es in wenigen Minuten erneut.
      </p>
      <ButtonLink href="/" variant="secondary" className="mx-auto">
        Neu laden
      </ButtonLink>
    </Container>
  );
}
