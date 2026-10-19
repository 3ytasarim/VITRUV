'use client';

import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { Permission } from '@vitruv/shared';
import { cx } from '@/components/ui';
import { AdminNav } from './admin-nav';

const COLLAPSE_KEY = 'vitruv.admin.sidebar';

/** In-memory fallback when storage is blocked (private mode): the toggle still works. */
let memoryCollapsed = false;
const listeners = new Set<() => void>();

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === 'collapsed';
  } catch {
    return memoryCollapsed;
  }
}
function writeCollapsed(next: boolean) {
  memoryCollapsed = next;
  try {
    window.localStorage.setItem(COLLAPSE_KEY, next ? 'collapsed' : 'expanded');
  } catch {
    // Not persisted — kept in memory for this page view.
  }
  listeners.forEach((listener) => listener());
}
/** Sidebar preference as an external store: hydration-safe (server = expanded), synced across tabs. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * Admin panel frame (pattern adapted from MasaNova's DashboardShell + CleanServisi's collapsible
 * sidebar): sticky sidebar from md (collapsible to an icon rail, remembered per browser), a
 * native <dialog> drawer on phones (modal focus trap, Escape, focus returns to the trigger) and a
 * blurred sticky header. Presentation only — access is enforced by the layouts and the API.
 */
export function AdminShell({
  permissions,
  account,
  logout,
  headerEnd,
  children,
}: {
  permissions: readonly Permission[];
  /** Signed-in account (link to "Konto & Sicherheit"); rendered by the server layout. */
  account: ReactNode;
  /** Logout form (server action); rendered by the server layout. */
  logout: ReactNode;
  /** Right side of the header (date, website link, avatar); rendered by the server layout. */
  headerEnd?: ReactNode;
  children: ReactNode;
}) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggleCollapsed = () => writeCollapsed(!collapsed);

  const openDrawer = () => drawerRef.current?.showModal();
  const closeDrawer = useCallback(() => drawerRef.current?.close(), []);

  useEffect(() => {
    const dialog = drawerRef.current;
    if (!dialog) return;
    const restoreFocus = () => triggerRef.current?.focus();
    // Clicks on the backdrop hit the <dialog> element itself.
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener('close', restoreFocus);
    dialog.addEventListener('click', onClick);
    return () => {
      dialog.removeEventListener('close', restoreFocus);
      dialog.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div className="vt-admin" data-collapsed={collapsed ? 'true' : undefined}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-pill focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Zum Inhalt springen
      </a>
      <aside className="vt-admin__sidebar" aria-label="Seitenleiste">
        <div className="vt-admin__brand">
          <Link href="/admin" className="vt-admin__wordmark" aria-label="VITRUV Admin – Start">
            <span>VITRUV</span>
            <span className={cx('text-accent-text', collapsed && 'sr-only')}>Admin</span>
          </Link>
        </div>
        <div className="vt-admin__scroll">
          <AdminNav permissions={permissions} collapsed={collapsed} />
        </div>
        <div className={cx('vt-admin__account', collapsed && 'vt-admin__account--rail')}>
          {!collapsed && account}
          {logout}
        </div>
      </aside>

      <dialog ref={drawerRef} className="vt-admin__drawer" aria-label="Navigation">
        <div className="vt-admin__brand justify-between">
          <span className="vt-admin__wordmark">
            <span>VITRUV</span>
            <span className="text-accent-text">Admin</span>
          </span>
          <button
            type="button"
            onClick={closeDrawer}
            className="vt-icon-btn"
            aria-label="Navigation schließen"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="vt-admin__scroll">
          <AdminNav permissions={permissions} onNavigate={closeDrawer} />
        </div>
        <div className="vt-admin__account">
          {account}
          {logout}
        </div>
      </dialog>

      <div className="vt-admin__main">
        <header className="vt-admin__header">
          <button
            ref={triggerRef}
            type="button"
            onClick={openDrawer}
            className="vt-icon-btn md:hidden"
            aria-label="Navigation öffnen"
            aria-haspopup="dialog"
          >
            <Menu aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="vt-icon-btn max-md:hidden"
            aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
            aria-pressed={collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="size-5" strokeWidth={1.6} />
            ) : (
              <PanelLeftClose aria-hidden className="size-5" strokeWidth={1.6} />
            )}
          </button>
          <span className="vt-admin__wordmark md:hidden">
            <span>VITRUV</span>
            <span className="text-accent-text">Admin</span>
          </span>
          {headerEnd && <div className="ml-auto flex items-center gap-3">{headerEnd}</div>}
        </header>
        <main id="main" tabIndex={-1} className="vt-admin__content">
          {children}
        </main>
      </div>
    </div>
  );
}
