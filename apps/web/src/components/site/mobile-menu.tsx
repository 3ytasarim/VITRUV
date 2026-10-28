'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { NavLink } from './navigation';

/**
 * Mobile navigation (reference 'Website Funktional' phone menu: numbered "01 //" links in a
 * dark scanline panel, the call to action as the chamfered blue button at the end) in a native
 * modal <dialog>: the browser traps focus, makes the page behind inert, closes on Escape and
 * returns focus to the menu button. Page scrolling is locked while open
 * (CSS `:root:has(.vf-menu[open])`). Choosing a link closes the menu. Links rise in sequence
 * (CSS, --i; instant under reduced motion).
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
    <div className="vf-menu-trigger">
      <button
        type="button"
        className="vf-menu-btn"
        aria-label="Menü öffnen"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden className="size-5" strokeWidth={1.6} />
      </button>
      <dialog
        ref={dialogRef}
        id={menuId}
        aria-label="Menü"
        className="vf-menu"
        onClose={() => setOpen(false)}
      >
        <div className="vf-menu__head">
          <span className="vf-wordmark">VITRUV</span>
          <button
            type="button"
            className="vf-menu-btn"
            aria-label="Menü schließen"
            onClick={() => setOpen(false)}
          >
            <X aria-hidden className="size-5" strokeWidth={1.6} />
          </button>
        </div>
        <nav aria-label="Hauptnavigation" className="vf-menu__nav">
          <ol className="vf-menu__list">
            {items.map((item, index) => (
              <li key={item.href + '-' + item.label} style={{ '--i': index } as CSSProperties}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  data-track="navigation_click"
                  data-track-section="mobile-menu"
                  className="vf-menu__link"
                >
                  <span aria-hidden className="vf-menu__num">
                    {String(index + 1).padStart(2, '0')} {'//'}
                  </span>
                  {item.label}
                </a>
              </li>
            ))}
            <li style={{ '--i': items.length } as CSSProperties}>
              <a
                href="/login"
                onClick={() => setOpen(false)}
                data-track="login_click"
                data-track-section="mobile-menu"
                className="vf-menu__link"
              >
                <span aria-hidden className="vf-menu__num">
                  {String(items.length + 1).padStart(2, '0')} {'//'}
                </span>
                Anmelden
              </a>
            </li>
          </ol>
          {cta && (
            <a
              href={cta.href}
              onClick={() => setOpen(false)}
              data-track="cta_click"
              data-track-section="mobile-menu"
              className="vf-btn vf-btn--primary vf-btn--block"
            >
              {cta.label}
            </a>
          )}
        </nav>
      </dialog>
    </div>
  );
}
