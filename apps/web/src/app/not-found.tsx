import { ButtonLink } from '@/components/ui';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto grid min-h-dvh max-w-measure-narrow place-content-center gap-6 px-4 text-center"
    >
      <p className="type-eyebrow text-accent-text">404</p>
      <h1 className="type-h2">Seite nicht gefunden.</h1>
      <ButtonLink href="/" variant="secondary" className="mx-auto">
        Zur Startseite
      </ButtonLink>
    </main>
  );
}
