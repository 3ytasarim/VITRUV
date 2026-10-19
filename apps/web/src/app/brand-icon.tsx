import { tokens } from '@vitruv/design-tokens';
import { ImageResponse } from 'next/og';
import { buildNavigation } from '@/components/site/navigation';
import { getPublicHome } from '@/lib/public-site';

/**
 * Browser/app icon from the CMS logo (page settings → Logo), used UNCHANGED on a light rounded
 * tile so the dark brush mark stays visible on dark tab bars. Without a CMS logo: the wordmark
 * initial on the same tile. Shared by app/icon.tsx (favicon) and app/apple-icon.tsx.
 */
export async function brandIcon(size: number) {
  const home = await getPublicHome();
  const logo = home.ok ? buildNavigation(home.page).logo : null;
  const paper = tokens.colors.public.bg.hex;
  const ink = tokens.colors.public.fg.hex;
  const inner = Math.round(size * 0.84);
  // The image renderer refuses private/localhost URLs (SSRF protection) — load the published logo
  // here (our own API) and embed it as a data URL instead.
  const src = logo ? await asDataUrl(logo.desktop.url, logo.desktop.mimeType) : null;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: paper,
        borderRadius: Math.round(size * 0.22),
      }}
    >
      {src ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- rendered to PNG (decorative)
        <img src={src} width={inner} height={inner} style={{ objectFit: 'contain' }} />
      ) : (
        <div style={{ fontSize: size * 0.62, color: ink, fontWeight: 600 }}>V</div>
      )}
    </div>,
    { width: size, height: size },
  );
}

async function asDataUrl(url: string, mimeType: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > 2 * 1024 * 1024) return null; // not a sensible icon source
    return `data:${mimeType};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
