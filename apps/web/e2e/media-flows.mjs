/**
 * Sprint 8A — private training media in a real browser against the local stack (run.mjs starts
 * the API with TRAINING_MEDIA_VISIBILITY=PRIVATE and a random per-run signing key).
 *
 * The video is a SYNTHETIC MP4 header (H.264 sample entry, no frames) — enough for the upload
 * validation and for the browser's media stack to request it (Range), not for decoding. Real
 * decoding/seeking of H.264 is an iPhone/AVPlayer test (Mac stage); Playwright's Chromium has no
 * proprietary H.264 decoder either.
 */
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { EMAILS, loggedIn, shot } from './browser.mjs';

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (s) => [...s].map((ch) => ch.charCodeAt(0));
const zeros = (n) => Array(n).fill(0);
const box = (type, ...payload) => {
  const body = payload.flat();
  return [...u32(8 + body.length), ...text(type), ...body];
};

/** Synthetic MP4 (H.264 `avc1` sample entry), padded so Range requests have something to cut. */
export function syntheticMp4() {
  const mvhd = box('mvhd', [0, 0, 0, 0], zeros(8), u32(1000), u32(3000), zeros(80));
  const tkhd = box('tkhd', [0, 0, 0, 3], zeros(72), u32(320 * 65536), u32(180 * 65536));
  const hdlr = box('hdlr', zeros(4), zeros(4), text('vide'), zeros(12), [0]);
  const stsd = box('stsd', zeros(4), u32(1), box('avc1', zeros(78)));
  const trak = box('trak', tkhd, box('mdia', hdlr, box('minf', box('stbl', stsd))));
  const free = box('free', zeros(64 * 1024));
  return new Uint8Array([
    ...box('ftyp', text('isom'), u32(512), text('isom'), text('mp41')),
    ...box('moov', mvhd, trak),
    ...free,
  ]);
}

export async function mediaFlows({ ctx, browser, api, step }) {
  const state = {};
  const video = syntheticMp4();
  const file = join(ctx.artifacts, 'e2e-uebung.mp4');
  writeFileSync(file, video);
  let page;

  await step(
    '18. coach uploads an exercise video in the browser → stored PRIVATE, signed URL',
    async () => {
      ({ page } = await loggedIn(browser, ctx, 'coachA'));
      await page.goto('/admin/training/uebungen/neu');
      await page.getByRole('textbox', { name: /^Name/ }).fill('E2E Videoübung');
      await page.getByRole('button', { name: 'Medium wählen' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Datei', { exact: true }).setInputFiles(file);
      await dialog.getByRole('button', { name: 'Hochladen' }).click();
      await page.getByText('e2e-uebung.mp4').first().waitFor({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Übung anlegen' }).click();
      await page.waitForURL(/\/admin\/training\/uebungen\/[0-9a-f-]{36}/, { timeout: 30_000 });
      state.exerciseId = page.url().split('/').pop();
      const coach = await api.login(EMAILS.coachA, 'WEB');
      state.coachToken = coach;
      const exercise = await api.call(
        'GET',
        `/v1/admin/training/exercises/${state.exerciseId}`,
        coach,
      );
      const media = exercise.body.media;
      if (!media || media.kind !== 'VIDEO')
        throw new Error(`no video on the exercise (${exercise.status})`);
      state.assetId = media.assetId;
      state.url = media.url;
      if (!state.url.startsWith(`${ctx.api}/v1/media/training/${state.assetId}?u=`)) {
        throw new Error('exercise video URL is not a signed training media URL');
      }
      const detail = await api.call('GET', `/v1/admin/training/media/${state.assetId}`, coach);
      if (detail.body.visibility !== 'PRIVATE')
        throw new Error(`visibility ${detail.body.visibility}`);
      await shot(page, ctx, '18-video-uploaded');
    },
    { independent: true },
  );

  await step(
    '19. the browser plays from the protected route (media element, Range, CSP allows it)',
    async () => {
      if (!state.url) throw new Error('needs step 18');
      const seen = [];
      const blocked = [];
      page.on('response', (res) => {
        if (res.url().includes('/v1/media/training/')) {
          seen.push({ status: res.status(), ranges: res.headers()['accept-ranges'] ?? '' });
        }
      });
      page.on('console', (msg) => {
        if (/Content Security Policy/i.test(msg.text())) blocked.push(msg.text().slice(0, 120));
      });
      // The coach's library preview renders the private video as a <video> with its signed URL.
      await page.getByRole('button', { name: 'Medium ändern' }).click();
      const thumb = page.getByRole('dialog').locator('video').first();
      await thumb.waitFor({ timeout: 20_000 });
      const src = await thumb.getAttribute('src');
      if (!src?.includes('/v1/media/training/'))
        throw new Error(`preview src is not signed: ${src?.slice(0, 60)}`);
      // Ask the browser's media stack to (re)load it, as a player does.
      await thumb.evaluate((el) => {
        el.preload = 'auto';
        el.load();
      });
      const deadline = Date.now() + 15_000;
      while (!seen.some((r) => r.status === 200 || r.status === 206) && Date.now() < deadline) {
        await page.waitForTimeout(250);
      }
      if (blocked.length) throw new Error(`CSP blocked: ${blocked[0]}`);
      const okResponse = seen.find((r) => r.status === 200 || r.status === 206);
      if (!okResponse) throw new Error(`media route answers: ${JSON.stringify(seen)}`);
      if (okResponse.ranges !== 'bytes') throw new Error('no Accept-Ranges: bytes');
      state.browserStatuses = [...new Set(seen.map((r) => r.status))];
      await shot(page, ctx, '19-protected-preview');
      await page.keyboard.press('Escape');
    },
    { independent: true },
  );

  await step(
    '20. protected route over HTTP: Range/seek bytes exact; tampered/foreign/unsigned refused; no cache',
    async () => {
      if (!state.url) throw new Error('needs step 18');
      const get = (url, headers = {}) => fetch(url, { headers, redirect: 'manual' });
      const full = await get(state.url);
      const body = new Uint8Array(await full.arrayBuffer());
      if (full.status !== 200 || body.length !== video.length) {
        throw new Error(`full GET ${full.status}, ${body.length} bytes`);
      }
      if (full.headers.get('cache-control') !== 'private, no-store') throw new Error('cacheable');
      const mid = Math.floor(video.length / 2);
      const seek = await get(state.url, { Range: `bytes=${mid}-${mid + 99}` });
      const part = new Uint8Array(await seek.arrayBuffer());
      if (
        seek.status !== 206 ||
        seek.headers.get('content-range') !== `bytes ${mid}-${mid + 99}/${video.length}`
      ) {
        throw new Error(`seek → ${seek.status} ${seek.headers.get('content-range')}`);
      }
      if (part.some((b, i) => b !== video[mid + i])) throw new Error('seek bytes differ');
      const u = new URL(state.url);
      const variants = {
        unsigned: `${u.origin}${u.pathname}`,
        'other user': (() => {
          const x = new URL(state.url);
          x.searchParams.set('u', ctx.users.clientB);
          return x.toString();
        })(),
        'longer expiry': (() => {
          const x = new URL(state.url);
          x.searchParams.set('e', String(Number(x.searchParams.get('e')) + 3600));
          return x.toString();
        })(),
        expired: (() => {
          const x = new URL(state.url);
          x.searchParams.set('e', String(Math.floor(Date.now() / 1000) - 60));
          return x.toString();
        })(),
      };
      for (const [label, url] of Object.entries(variants)) {
        const res = await get(url);
        if (res.status !== 403) throw new Error(`${label} → ${res.status}`);
      }
      // the storage key is not reachable through the public media route
      const publicTry = await get(`${ctx.api}/media/public/training-video/${state.assetId}.mp4`);
      if (publicTry.status !== 404) throw new Error(`public route → ${publicTry.status}`);
    },
    { independent: true },
  );

  await step(
    '21. renewal + access rules: coach renews; client without a reference → 404; client token refused on admin route',
    async () => {
      if (!state.assetId) throw new Error('needs step 18');
      const renewed = await api.call(
        'GET',
        `/v1/admin/training/media/${state.assetId}/url`,
        state.coachToken,
      );
      if (renewed.status !== 200 || !renewed.body.expiresAt)
        throw new Error(`renew ${renewed.status}`);
      if ((await fetch(renewed.body.url)).status !== 200)
        throw new Error('renewed URL does not play');
      const ben = await api.login(EMAILS.clientB);
      const benRenew = await api.call('GET', `/v1/client/training/media/${state.assetId}/url`, ben);
      if (benRenew.status !== 404) throw new Error(`client without reference → ${benRenew.status}`);
      const benAdmin = await api.call('GET', `/v1/admin/training/media/${state.assetId}/url`, ben);
      if (benAdmin.status !== 403) throw new Error(`client on admin renewal → ${benAdmin.status}`);
      const anon = await api.call('GET', `/v1/client/training/media/${state.assetId}/url`);
      if (anon.status !== 401) throw new Error(`anonymous renewal → ${anon.status}`);
    },
    { independent: true },
  );

  await step(
    '22. public website media stay public (upload as admin, served without signature, cacheable)',
    async () => {
      const admin = await api.login(EMAILS.admin, 'WEB');
      const png = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        ...u32(13),
        ...text('IHDR'),
        ...u32(4),
        ...u32(4),
        8,
        2,
        0,
        0,
        0,
        ...u32(0),
      ]);
      const form = new FormData();
      form.append('file', new File([png], 'e2e-website.png', { type: 'image/png' }));
      const res = await fetch(`${ctx.api}/v1/admin/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin}` },
        body: form,
      });
      const asset = await res.json();
      if (res.status !== 201 || asset.visibility !== 'PUBLIC')
        throw new Error(`website upload ${res.status}`);
      if (!asset.url.startsWith(`${ctx.api}/media/public/website/`))
        throw new Error('website URL not public');
      const served = await fetch(asset.url);
      if (served.status !== 200 || !served.headers.get('cache-control')?.includes('public')) {
        throw new Error(`public media → ${served.status} ${served.headers.get('cache-control')}`);
      }
    },
    { independent: true },
  );

  await page?.context().close();
  return state;
}
