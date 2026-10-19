import { ArrowRight, UserRound } from 'lucide-react';
import Link from 'next/link';

/**
 * "Anmelden" in the public header — the entrance to the client area ("Mein Training") and the
 * panel. A system link (not CMS content): /login routes every account by its role. Animated
 * gold ring + fill sweep and a sliding arrow on hover (CSS only; static under reduced motion).
 * Below 768px only the icon shows (the label stays the accessible name).
 */
export function LoginLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/login"
      className={className ? `vt-login ${className}` : 'vt-login'}
      data-track="login_click"
      data-track-section="header"
    >
      <span aria-hidden className="vt-login__ring" />
      <span aria-hidden className="vt-login__icon">
        <UserRound />
      </span>
      <span className="vt-login__label">Anmelden</span>
      <span aria-hidden className="vt-login__arrow">
        <ArrowRight />
      </span>
    </Link>
  );
}
