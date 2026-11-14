import { defineConfig } from 'tsup';

// Bundles the API and the internal @vitruv/* workspace packages (shipped as TS source) into
// dist/server.js. Third-party dependencies stay external and are installed in production —
// tsup only externalizes what THIS package.json lists, so runtime deps of workspace packages
// (pg, drizzle-orm) must be declared here too, or CommonJS modules get inlined into ESM and fail.
export default defineConfig({
  // heic-worker runs in a worker thread (HEIC → JPEG); it is loaded from dist/heic-worker.js.
  // Both files land directly in dist/ (heic-convert loads ./heic-worker.js next to itself).
  entry: { server: 'src/server.ts', 'heic-worker': 'src/modules/media/heic-worker.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@vitruv\//],
});
