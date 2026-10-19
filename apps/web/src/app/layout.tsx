import { tokens } from '@vitruv/design-tokens';
import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { isIndexingEnabled, publicSiteUrl } from '@/lib/env';
import { fontVariables, publicFontVariables } from '@/lib/fonts';
import '@/styles/globals.css';

/**
 * Site-wide metadata defaults. Page copy (title/description/Open Graph) comes from the published
 * CMS SEO settings in the homepage's generateMetadata — nothing editorial is hardcoded here.
 * The brand name is only the fallback title.
 */
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(`${publicSiteUrl()}/`),
    title: { default: 'VITRUV', template: '%s · VITRUV' },
    ...(isIndexingEnabled() ? {} : { robots: { index: false, follow: false } }),
  };
}

export const viewport: Viewport = {
  // Light 'Greek Harmony' is the default surface (owner decision 2026-10-16).
  themeColor: tokens.colors.public.bg.hex,
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every response gets a per-request CSP nonce (src/proxy.ts); dynamic rendering lets Next.js
  // attach it to its scripts.
  await connection();
  return (
    // data-surface="public" is the default for every page (404, errors, account pages); the admin
    // shell overrides it with data-surface="admin".
    <html
      lang="de"
      data-theme="dark"
      data-surface="public"
      className={`${fontVariables} ${publicFontVariables}`}
    >
      <body className="bg-bg text-fg">{children}</body>
    </html>
  );
}
