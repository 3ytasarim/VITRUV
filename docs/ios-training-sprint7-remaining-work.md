# iOS Training — Sprint 7 remaining work

Date: 2026-11-23. Everything below is **open**. Nothing here was done or verified in Sprint 7.
**This is not release-ready.**

## iOS build and device tests (macOS + Xcode + real iPhone)

- **iOS build:** never compiled on macOS. Sprint 7 adds no native code (it uses the existing
  `video_player`), but the whole app is unverified on iOS.
- **Video playback on a real iPhone** (cannot be proven on Windows):
  - MP4/H.264 + AAC files from the TRAINING library play, seek and buffer (AVPlayer);
  - `moov` atom position / fast start — large files that keep it at the end may start slowly;
  - byte-range requests through the object-storage CDN;
  - 20 s open timeout and "Erneut versuchen" on a bad network / flight mode;
  - the rest timer, the Core routine and notifications keep running while the sheet is open;
  - VoiceOver: "Video ansehen: <Übung>", seek bar value, error + retry.
- **Existing WebM assets:** the app refuses them on iOS with a message. The owner decides whether
  to re-encode them to MP4 (H.264) **outside production storage** and replace them via the admin
  (no bulk conversion was done).
- Sprint 6 device items (Total-reps/Core notifications, background/kill, haptics) are still open.

## Apple Watch

- Native bridge and watchOS target still missing (fake transport only). Sprint 7 did not touch the
  watch interface.

## Security updates (not done — no dependency upgrades without approval)

- Next.js advisory (the build prints `SecurityFatalError` on the first run).
- hono, @hono/node-server, minimatch findings; `pg@9` deprecation warning.
- Training videos are **public, unsigned** object-storage URLs (existing architecture). Anyone
  with a URL can watch the file. Signed URLs would need a native player that sends no auth header
  but accepts short-lived URLs + refresh — an owner decision.

## Migration rehearsal

- Migrations **0022–0025 are NOT applied on Neon** (production or a branch).
- 0025 adds three nullable columns + FKs, one index and a snapshot backfill (UPDATE). Rehearse on
  a Neon branch first: read the SQL → `db:migrate` → `db:inspect`, measure the backfill and the
  index build on real data volume. Only with owner approval.
- `TRAINING_EXTENDED_TYPES` stays OFF in production; enabling it is a separate owner decision.

## E2E requirements

- Real-browser E2E for the coach pages (row video pick/replace/remove, Trainingsfortschritt,
  pagination, Einheit comparison + chart) — only component tests exist.
- Spec cases without a dedicated test: history after an app restart (24), several workouts on
  one day in the UI (33), timezone edge cases around midnight (34), coach page refresh in a real
  browser (35).

## Known gaps / follow-ups

- **No offline queue for reads.** History, comparison and progress load on open, on resume and
  on pull-to-refresh; failures show retry. Writes keep the Sprint 4–6 outbox behaviour. Nothing is
  cached for offline viewing.
- The coach chart shows one exercise at a time (`?verlauf=`), loaded on request.
- Comparison matches exercise id + execution mode + MAX flag; a changed Strength target (e.g. 10 →
  12 reps) is still compared (the target is shown per set).

## Sprint 8 dependencies

- Mac + iPhone for the iOS build and all device checks above.
- Neon branch rehearsal of 0022–0025 and owner approval for production.
- Owner decisions: WebM re-encoding, signed training URLs, `TRAINING_EXTENDED_TYPES` rollout,
  Apple signing / bundle id, production API URL.
- Dependency security updates (Next.js, hono, @hono/node-server, minimatch) with approval.
- Native watch bridge before any watch claim.
