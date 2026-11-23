/**
 * Sprint 7.5 — real-browser E2E: local Next.js (production build) + local Hono API + ISOLATED
 * local PostgreSQL. Never the repo-root `.env` (that one points at the live database).
 *
 *   VITRUV_IT_DATABASE_URL='postgresql://vitruv_it@127.0.0.1:55433/vitruv_it_admin?sslmode=disable' \
 *   node apps/web/e2e/run.mjs            # build if needed, seed, start, run all flows, stop
 *   node apps/web/e2e/run.mjs --serve    # seed + start and keep running (manual exploration)
 *
 * Fail-closed:
 *  - child processes get a MINIMAL environment (system variables only) plus explicit values;
 *    DATABASE_URL & co. from the parent shell are never inherited, no `--env-file` is used
 *  - every key the web server would otherwise take from the root `.env` is set explicitly
 *  - the seed refuses anything that is not the `vitruv-it` loopback cluster (packages/db guard);
 *    the runner re-checks the returned URL before the API is started
 *  - users are fictional, the password is random per run and never printed
 * Artifacts (screenshots, results JSON) go to E2E_ARTIFACTS_DIR (default: OS temp), never git.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, '..');
const API = resolve(WEB, '..', 'api');
const WEB_PORT = 3291;
const API_PORT = 4291;
const SITE = `http://localhost:${WEB_PORT}`;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const serveOnly = process.argv.includes('--serve');
const ARTIFACTS = resolve(process.env.E2E_ARTIFACTS_DIR ?? join(tmpdir(), 'vitruv-e2e-artifacts'));
mkdirSync(ARTIFACTS, { recursive: true });

// --- guard: isolated database only ------------------------------------------------------------
const isolated = process.env.VITRUV_IT_DATABASE_URL ?? '';
const parsed = (() => {
  try {
    return new URL(isolated);
  } catch {
    return null;
  }
})();
if (
  !parsed ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
  parsed.searchParams.get('sslmode') !== 'disable' ||
  !/^\/vitruv_it_[a-z0-9_]+$/.test(parsed.pathname) ||
  /neon/i.test(isolated)
) {
  console.error('[e2e] refusing to run: VITRUV_IT_DATABASE_URL must be the isolated local cluster');
  process.exit(2);
}

/** System variables only — nothing from the developer shell that could point at real services. */
const SYSTEM_KEYS = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'SYSTEMROOT',
  'windir',
  'ComSpec',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'HOMEDRIVE',
  'HOMEPATH',
  'HOME',
  'OS',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'ProgramFiles',
  'ProgramData',
];
const baseEnv = () =>
  Object.fromEntries(
    SYSTEM_KEYS.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]),
  );

const password = randomBytes(24).toString('base64url');
const node = process.execPath;
const tsx = join(API, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const next = join(WEB, 'node_modules', 'next', 'dist', 'bin', 'next');
const children = [];

function stopAll() {
  for (const child of children) {
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else child.kill('SIGTERM');
    }
  }
}
process.on('exit', stopAll);
process.on('SIGINT', () => process.exit(130));

function run(cmd, args, opts) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (res.status !== 0) {
    console.error(`[e2e] ${args.slice(0, 2).join(' ')} failed (${res.status})`);
    console.error((res.stderr || '').split('\n').slice(-30).join('\n'));
    process.exit(1);
  }
  return res.stdout;
}

function start(name, args, cwd, env) {
  const child = spawn(node, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = join(ARTIFACTS, `${name}.log`);
  writeFileSync(log, '');
  const append = (chunk) => writeFileSync(log, chunk, { flag: 'a' });
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  children.push(child);
  return child;
}

async function waitFor(url, label, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not start`);
}

// --- 1. database ------------------------------------------------------------------------------
const seedOut = run(node, [tsx, 'scripts/e2e-seed.ts'], {
  cwd: API,
  env: { ...baseEnv(), VITRUV_IT_DATABASE_URL: isolated, E2E_PASSWORD: password },
});
const seed = JSON.parse(seedOut.trim().split('\n').pop());
const e2eDb = new URL(seed.url);
if (
  e2eDb.hostname !== parsed.hostname ||
  e2eDb.port !== parsed.port ||
  e2eDb.pathname !== '/vitruv_it_e2e'
) {
  console.error('[e2e] refusing: seed returned an unexpected database');
  process.exit(2);
}
console.log(`[e2e] isolated database vitruv_it_e2e ready (${seed.applied} migrations)`);

// --- 2. API -----------------------------------------------------------------------------------
const apiEnv = {
  ...baseEnv(),
  NODE_ENV: 'development',
  API_HOST: '127.0.0.1',
  API_PORT: String(API_PORT),
  API_PUBLIC_URL: API_URL,
  CORS_ORIGINS: SITE,
  DATABASE_URL: seed.url,
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: join(ARTIFACTS, 'storage'),
  DEV_AUTH: 'disabled',
  TRAINING_EXTENDED_TYPES:
    process.env.E2E_TRAINING_EXTENDED_TYPES === 'enabled' ? 'enabled' : 'disabled',
  LOG_LEVEL: 'warn',
};
start('api', [tsx, 'src/server.ts'], API, apiEnv);

// --- 3. web (production build, explicit env for every allow-listed key) ------------------------
const webEnv = {
  ...baseEnv(),
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  API_BASE_URL: API_URL,
  PUBLIC_SITE_URL: SITE,
  SITE_INDEXING: 'disabled',
  DESIGN_PREVIEW: 'disabled',
  TRUSTED_CLIENT_IP_HEADER: 'x-e2e-client-ip',
  REVALIDATE_SECRET: randomBytes(32).toString('base64url'),
  CMS_MEDIA_ORIGINS: API_URL,
  CMS_MEDIA_ALLOW_LOCAL: 'true',
  MEDIA_MAX_IMAGE_BYTES: String(15 * 1024 * 1024),
  MEDIA_MAX_VIDEO_BYTES: String(500 * 1024 * 1024),
};
const marker = join(WEB, '.next', 'e2e-build.json');
const wanted = JSON.stringify({ SITE, API_URL });
const fresh =
  existsSync(join(WEB, '.next', 'BUILD_ID')) &&
  existsSync(marker) &&
  readFileSync(marker, 'utf8') === wanted;
if (!fresh || process.argv.includes('--build')) {
  console.log('[e2e] building the web app for the E2E origin …');
  run(node, [next, 'build'], { cwd: WEB, env: webEnv });
  writeFileSync(marker, wanted);
}
start('web', [next, 'start', '--port', String(WEB_PORT), '--hostname', 'localhost'], WEB, webEnv);

await waitFor(`${API_URL}/health`, 'API');
await waitFor(`${SITE}/login`, 'web');
console.log(`[e2e] stack up: web ${SITE}, api ${API_URL} (logs + artifacts in ${ARTIFACTS})`);

const ctx = {
  site: SITE,
  api: API_URL,
  password,
  users: seed.users,
  artifacts: ARTIFACTS,
  extendedTypes: apiEnv.TRAINING_EXTENDED_TYPES,
};
if (serveOnly) {
  writeFileSync(
    join(ARTIFACTS, 'serve-context.json'),
    JSON.stringify({ site: SITE, api: API_URL }),
  );
  console.log('[e2e] --serve: running until interrupted');
  await new Promise(() => undefined);
}

if (process.argv.includes('--explore')) {
  // Development aid: aria snapshots of the given admin paths (as Coach Alpha) into ARTIFACTS.
  const { explore } = await import('./explore.mjs');
  await explore(ctx, process.argv.slice(process.argv.indexOf('--explore') + 1));
  stopAll();
  process.exit(0);
}

const { runFlows } = await import('./coach-flows.mjs');
const results = await runFlows(ctx);
writeFileSync(join(ARTIFACTS, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.status !== 'passed');
for (const r of results) {
  console.log(
    `${r.status === 'passed' ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms} ms)${r.error ? `\n      ${r.error}` : ''}`,
  );
}
console.log(`[e2e] ${results.length - failed.length}/${results.length} passed`);
stopAll();
process.exit(failed.length ? 1 : 0);
