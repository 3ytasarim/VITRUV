import { getImageProps } from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HarmonyMotif } from '@/components/site/harmony-motif';
import { publicFontVariables } from '@/lib/fonts';
import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { buildNavigation } from '@/components/site/navigation';
import { getPublicHome } from '@/lib/public-site';

/**
 * Shared frame for every account page (login, activation, access denied, disabled account).
 * Same light 'Greek Harmony' surface as the public site so the hand-over from website to panel
 * feels like one brand: desktop is a split (calm visual panel | form), phones get a short accent
 * band above the form. The visual panel shows the brand logo from the CMS (page settings → Logo,
 * used unchanged, never redrawn); without a CMS logo it falls back to the decorative geometry.
 */
export function AuthShell({
  children,
  eyebrow = 'VITRUV Coaching',
  statement,
  logo = null,
}: {
  children: ReactNode;
  eyebrow?: string;
  /** Short line on the visual panel; the emphasised part is set in gold Bodoni italic. */
  statement?: { before: string; em: string };
  /** CMS logo for the visual panel (from authLogo); null → decorative geometry. */
  logo?: ResolvedMediaSlot | null;
}) {
  const line = statement ?? { before: 'Struktur für deinen ', em: 'Weg.' };
  // Large display size (≈ the former motif, up to 520 px) → request a sharp source.
  const logoImg = logo
    ? getImageProps({
        src: logo.desktop.url,
        alt: '',
        width: 1040,
        height:
          logo.desktop.width && logo.desktop.height
            ? Math.round((1040 * logo.desktop.height) / logo.desktop.width)
            : 1040,
        quality: 90,
        priority: true,
      }).props
    : null;
  return (
    <div className={`vt-site ${publicFontVariables}`} data-surface="public">
      <main id="main" className="vt-auth">
        <aside aria-hidden className="vt-auth__visual">
          {logoImg ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- decorative (aside is aria-hidden), alt=""
            <img {...logoImg} className="vt-auth__motif vt-auth__logo" />
          ) : (
            <HarmonyMotif float className="vt-auth__motif" />
          )}
          <div className="vt-auth__visual-copy">
            <p className="type-eyebrow text-accent-text">{eyebrow}</p>
            <p className="vt-auth__statement">
              {line.before}
              <em className="vt-em">{line.em}</em>
            </p>
          </div>
        </aside>
        <div className="vt-auth__panel">
          <Link href="/" className="vt-wordmark self-start" aria-label="VITRUV – zur Startseite">
            VITRUV
          </Link>
          <div className="vt-auth__content vt-rise">{children}</div>
          <p className="type-caption text-fg-subtle">© VITRUV Coaching</p>
        </div>
      </main>
    </div>
  );
}

/** The published CMS logo for account pages (cached public content; null when unavailable). */
export async function authLogo(): Promise<ResolvedMediaSlot | null> {
  const home = await getPublicHome();
  return home.ok ? buildNavigation(home.page).logo : null;
}
