import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../../config/env';
import { createMediaUrlResolver } from './media-url';
import {
  createTrainingMediaSigner,
  currentMediaViewer,
  runWithMediaViewer,
} from './training-media-access';

/** Sprint 8A — signed, user-bound, short-lived training media URLs (pure logic, no DB). */

const KEY = 'unit-test-key-0123456789abcdef-0123456789';
const signer = createTrainingMediaSigner({
  key: KEY,
  apiBaseUrl: 'https://api.example.invalid/',
  ttlSeconds: 900,
});
const asset = randomUUID();
const viewer = randomUUID();
const NOW = Date.UTC(2027, 0, 4, 10, 0, 0);
const query = (url: string) => {
  const params = new URL(url).searchParams;
  return { u: params.get('u') ?? '', e: params.get('e') ?? '', s: params.get('s') ?? '' };
};

describe('training media signer', () => {
  it('signs an asset for one viewer and verifies it until it expires', () => {
    const { url, expiresAt } = signer.sign(asset, viewer, NOW);
    expect(url.startsWith(`https://api.example.invalid/v1/media/training/${asset}?u=`)).toBe(true);
    expect(signer.verify(asset, query(url), NOW)).toBe(viewer);
    // lifetime between TTL and TTL + window (window = TTL / 4 = 225 s)
    const lifetime = (expiresAt.getTime() - NOW) / 1000;
    expect(lifetime).toBeGreaterThanOrEqual(900);
    expect(lifetime).toBeLessThanOrEqual(900 + 225);
    expect(signer.verify(asset, query(url), expiresAt.getTime() - 1)).toBe(viewer);
    expect(signer.verify(asset, query(url), expiresAt.getTime())).toBeNull();
    expect(signer.verify(asset, query(url), expiresAt.getTime() + 86_400_000)).toBeNull();
  });

  it('returns the same URL within one window (stable for players and caches)', () => {
    // NOW + TTL lies exactly on a window boundary; one second later starts a window
    const a = signer.sign(asset, viewer, NOW + 1000).url;
    const b = signer.sign(asset, viewer, NOW + 31_000).url;
    const next = signer.sign(asset, viewer, NOW + 1000 + 225_000).url;
    expect(next).not.toBe(a);
    expect(b).toBe(a);
  });

  it('binds asset, viewer and expiry: any change invalidates the signature', () => {
    const q = query(signer.sign(asset, viewer, NOW).url);
    expect(signer.verify(randomUUID(), q, NOW)).toBeNull();
    expect(signer.verify(asset, { ...q, u: randomUUID() }, NOW)).toBeNull();
    expect(signer.verify(asset, { ...q, e: String(Number(q.e) + 1) }, NOW)).toBeNull();
    expect(
      signer.verify(asset, { ...q, s: q.s.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) }, NOW),
    ).toBeNull();
  });

  it('refuses malformed input and far-future expiries without comparing', () => {
    const q = query(signer.sign(asset, viewer, NOW).url);
    for (const bad of [
      {},
      { ...q, s: '' },
      { ...q, s: 'short' },
      { ...q, e: '-1' },
      { ...q, e: '1e12' },
      { ...q, u: 'not-a-uuid' },
      { ...q, e: String(Math.floor(NOW / 1000) + 365 * 86400) },
    ]) {
      expect(signer.verify(asset, bad, NOW)).toBeNull();
    }
    expect(signer.verify('../etc/passwd', q, NOW)).toBeNull();
  });

  it('a different key (another environment) never verifies', () => {
    const other = createTrainingMediaSigner({
      key: 'k'.repeat(40),
      apiBaseUrl: 'https://x.invalid',
      ttlSeconds: 900,
    });
    expect(other.verify(asset, query(signer.sign(asset, viewer, NOW).url), NOW)).toBeNull();
  });

  it('refuses short keys and invalid ids at signing', () => {
    expect(() =>
      createTrainingMediaSigner({ key: 'short', apiBaseUrl: 'https://x.invalid', ttlSeconds: 900 }),
    ).toThrow();
    expect(() => signer.sign('x', viewer)).toThrow();
    expect(() => signer.sign(asset, 'x')).toThrow();
  });
});

describe('media URL resolver (Sprint 8A)', () => {
  const urls = createMediaUrlResolver('https://cdn.example.invalid', signer);
  const base = { id: asset, storageKey: 'private/training-video/2027/01/x.mp4' };

  it('PUBLIC assets keep their public URL; website media never get a signed URL', () => {
    expect(
      urls.assetUrl({
        ...base,
        storageKey: 'public/training-video/2027/01/x.mp4',
        visibility: 'PUBLIC',
        purpose: 'TRAINING_VIDEO',
      }),
    ).toBe('https://cdn.example.invalid/public/training-video/2027/01/x.mp4');
    expect(
      runWithMediaViewer(viewer, () =>
        urls.assetUrl({ ...base, visibility: 'PRIVATE', purpose: 'NUTRITION' }),
      ),
    ).toBeNull();
  });

  it('PRIVATE training media are signed for the current viewer only — none without a viewer', () => {
    const asset8a = { ...base, visibility: 'PRIVATE' as const, purpose: 'TRAINING_VIDEO' as const };
    expect(urls.assetUrl(asset8a)).toBeNull();
    expect(runWithMediaViewer(null, () => urls.assetUrl(asset8a))).toBeNull();
    const signed = runWithMediaViewer(viewer, () => urls.assetUrl(asset8a));
    expect(signed && new URL(signed).searchParams.get('u')).toBe(viewer);
    expect(currentMediaViewer()).toBeNull();
    // without a signer: no URL (fail closed)
    expect(
      runWithMediaViewer(viewer, () =>
        createMediaUrlResolver('https://cdn.example.invalid').assetUrl(asset8a),
      ),
    ).toBeNull();
  });
});

describe('env (Sprint 8A)', () => {
  const required = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' };
  it('defaults keep the previous behaviour: PUBLIC training uploads, 900 s', () => {
    const env = loadApiEnv(required);
    expect(env.TRAINING_MEDIA_VISIBILITY).toBe('PUBLIC');
    expect(env.TRAINING_MEDIA_URL_TTL_SECONDS).toBe(900);
    expect(env.MEDIA_URL_SIGNING_KEY).toBeUndefined();
  });
  it('PRIVATE without a signing key fails at startup (names only, never values)', () => {
    expect(() => loadApiEnv({ ...required, TRAINING_MEDIA_VISIBILITY: 'PRIVATE' })).toThrow(
      /MEDIA_URL_SIGNING_KEY/,
    );
    expect(() => loadApiEnv({ ...required, MEDIA_URL_SIGNING_KEY: 'short' })).toThrow(
      /MEDIA_URL_SIGNING_KEY/,
    );
    expect(() => loadApiEnv({ ...required, TRAINING_MEDIA_URL_TTL_SECONDS: '86400' })).toThrow(
      /TRAINING_MEDIA_URL_TTL_SECONDS/,
    );
    expect(
      loadApiEnv({ ...required, TRAINING_MEDIA_VISIBILITY: 'PRIVATE', MEDIA_URL_SIGNING_KEY: KEY })
        .TRAINING_MEDIA_VISIBILITY,
    ).toBe('PRIVATE');
  });
});
