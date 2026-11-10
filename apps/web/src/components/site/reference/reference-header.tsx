'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type MouseEvent } from 'react';
import { SHOW_THEME_TOGGLE, type ThemeMode } from '../theme-mode';
import { ThemeToggle } from '../theme-toggle';

export interface ReferenceLink {
  label: string;
  href: string;
}

/** Phone breakpoint of the prototype (logo opens the menu, smaller header CTA). */
const PHONE = 820;

/**
 * Header of the reference design (`Website Funktional`): fixed glass bar with logo + wordmark,
 * the section links in the centre and the light/dark switch at the end. The "Jetzt bewerben" CTA
 * is a sticky blue tab on the right edge (owner request 2026-11-09); it slides in once the intro
 * video section has scrolled under the header (on pages without it, always).
 * Below 820 px the logo opens the glitch menu (prototype behaviour); Escape or a link closes it.
 */
export function ReferenceHeader({
  logoSrc,
  cta,
  menu,
  links = [],
  mode,
}: {
  /** Logo image URL from the CMS page settings (used unchanged); wordmark alone if missing. */
  logoSrc: string | null;
  cta: ReferenceLink;
  menu: ReferenceLink[];
  /** Centre navigation: the blue section titles (eyebrows) of the page → their anchors. */
  links?: ReferenceLink[];
  mode: ThemeMode;
}) {
  const [open, setOpen] = useState(false);
  const [showCta, setShowCta] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const menuId = useId();

  useEffect(() => {
    const update = () => {
      const sec = document.querySelector('[data-video-sec]');
      // hidden again once the "Bewerben" section itself is on screen (it carries the channels)
      const apply = document.getElementById('bewerben');
      const atApply = apply ? apply.getBoundingClientRect().top < window.innerHeight * 0.6 : false;
      setShowCta((sec ? sec.getBoundingClientRect().bottom < 80 : true) && !atApply);
    };
    update();
    const late = window.setTimeout(update, 100);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.clearTimeout(late);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Scrollspy: the section in view is marked in the centre navigation.
  useEffect(() => {
    const ids = links.map((l) => l.href.split('#')[1]).filter((id): id is string => Boolean(id));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    sections.forEach((s) => spy.observe(s));
    return () => spy.disconnect();
  }, [links]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const close = () => {
      if (window.innerWidth > PHONE) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const onLogo = (e: MouseEvent<HTMLAnchorElement>) => {
    if (window.innerWidth <= PHONE) {
      e.preventDefault();
      setOpen((v) => !v);
    } else setOpen(false);
  };

  return (
    <>
    <header className="r-header">
      <div className="r-header__bar">
        <Link
          href="/#top"
          onClick={onLogo}
          aria-label="Menü / nach oben"
          aria-expanded={open}
          aria-controls={menuId}
          className="r-brand"
        >
          {logoSrc && (
            <img src={logoSrc} alt="VITRUV" className="r-brand__logo" width={75} height={46} />
          )}
          {/* the logo carries the wordmark; text only as fallback without a CMS logo */}
          {!logoSrc && <span className="r-brand__word">VITRUV</span>}
        </Link>
        {links.length > 0 && (
          <nav className="r-links" aria-label="Hauptnavigation">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="r-links__a"
                data-active={active && link.href.endsWith(`#${active}`) ? '' : undefined}
                aria-current={active && link.href.endsWith(`#${active}`) ? 'true' : undefined}
                data-track="navigation_click"
                data-track-section="header"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}
        {SHOW_THEME_TOGGLE && <ThemeToggle initial={mode} className="r-theme" />}
      </div>
      {open && (
        <nav id={menuId} className="r-mmenu" aria-label="Hauptnavigation">
          {menu.map((item, i) => (
            <a
              key={item.href}
              href={item.href}
              data-idx={`${String(i + 1).padStart(2, '0')} //`}
              onClick={() => setOpen(false)}
              data-track="navigation_click"
              data-track-section="mobile-menu"
            >
              {item.label}
            </a>
          ))}
          <a
            href={cta.href}
            className="r-mmenu__cta"
            onClick={() => setOpen(false)}
            data-track="cta_click"
            data-track-section="mobile-menu"
          >
            {cta.label}
          </a>
        </nav>
      )}
    </header>
    {/* sticky tabs on the right edge ("Jetzt bewerben" blue, "Login" white below) — outside the
        header, whose backdrop-filter would otherwise become the containing block of these fixed
        elements */}
    <div className="r-sticks" data-show={showCta ? '1' : '0'}>
      <a
        href={cta.href}
        className="r-stick"
        tabIndex={showCta ? undefined : -1}
        aria-hidden={showCta ? undefined : true}
        data-track="cta_click"
        data-track-section="sticky"
      >
        {cta.label}
      </a>
      <Link
        href="/login"
        className="r-stick r-stick--light"
        tabIndex={showCta ? undefined : -1}
        aria-hidden={showCta ? undefined : true}
        data-track="navigation_click"
        data-track-section="sticky"
      >
        Login
      </Link>
    </div>
    </>
  );
}
