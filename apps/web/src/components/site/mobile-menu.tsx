'use client';

import { ArrowUpRight, Menu, UserRound, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Button, ButtonLink } from '@/components/ui';
import { HarmonyMotif } from './harmony-motif';
import type { NavLink } from './navigation';

/**
 * Mobile navigation in a native modal <dialog>: the browser traps focus, makes the page behind
 * inert, closes on Escape and returns focus to the menu button. Page scrolling is locked while
 * open (CSS `:root:has(.vt-menu[open])`). Choosing a link closes the menu. Large numbered links
 * rise in sequence (CSS, --i; instant under reduced motion).
 */
export function MobileMenu({ items, cta }: { items: NavLink[]; cta: NavLink | null }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <div className="vt-menu-trigger">
      <Button
        variant="secondary"
        icon={<Menu />}
        aria-label="Menü öffnen"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(true)}
      />
      <dialog
        ref={dialogRef}
        id={menuId}
        aria-label="Menü"
        className="vt-menu"
        onClose={() => setOpen(false)}
      >
        <div className="vt-menu__inner">
          <HarmonyMotif className="vt-menu__motif" />
          <div className="flex h-16 items-center justify-between">
            <span className="vt-wordmark">VITRUV</span>
            <Button
              variant="secondary"
              icon={<X />}
              aria-label="Menü schließen"
              onClick={() => setOpen(false)}
            />
          </div>
          <nav
            aria-label="Hauptnavigation"
            className="flex flex-1 flex-col justify-between gap-10 py-10"
          >
            <ol className="vt-menu__list">
              {items.map((item, index) => (
                <li key={item.href + '-' + item.label} style={{ '--i': index } as CSSProperties}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    data-track="navigation_click"
                    data-track-section="mobile-menu"
                    className="vt-menu__link"
                  >
                    <span aria-hidden className="vt-menu__num">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-3">
              <ButtonLink
                href="/login"
                variant="secondary"
                size="lg"
                fullWidth
                icon={<UserRound />}
                onClick={() => setOpen(false)}
                data-track="login_click"
                data-track-section="mobile-menu"
              >
                Anmelden
              </ButtonLink>
              {cta && (
                <ButtonLink
                  href={cta.href}
                  size="lg"
                  fullWidth
                  icon={<ArrowUpRight />}
                  iconPosition="end"
                  onClick={() => setOpen(false)}
                  data-track="cta_click"
                  data-track-section="mobile-menu"
                >
                  {cta.label}
                </ButtonLink>
              )}
            </div>
          </nav>
        </div>
      </dialog>
    </div>
  );
}
