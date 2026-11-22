# iOS Training — Sprint 4 remaining work and release blockers

**Not release-ready.** Nothing was pushed, deployed or migrated in production.

## Release blockers (unchanged from Sprint 3 — not hidden)

| Blocker                                                                          | Status                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| Next.js 16.4.1 security findings (fix in 16.4.5)                                 | open — no major upgrade done in Sprint 4    |
| `hono` < 4.13.16 findings                                                        | open                                        |
| `@hono/node-server` < 2.1.6 findings                                             | open                                        |
| `minimatch` advisory (dev tooling)                                               | open                                        |
| `pg@9` deprecation warning (`focused()` with `Promise.all` inside a transaction) | open, warning only                          |
| Production migrations 0022–0024 not applied to Neon                              | open — needs owner approval + backup        |
| `TRAINING_EXTENDED_TYPES` production rollout                                     | not before Sprint 8 (per plan)              |
| Real-browser E2E (coach web → client app)                                        | missing                                     |
| Apple iOS build, signing, TestFlight, real-device test                           | impossible on Windows — needs macOS + Xcode |

## Known gaps from Sprint 4

1. **Completed day can be started again on the server.** `POST /v1/client/workouts` does not
   refuse a day that already has a COMPLETED session; only the app prevents it (disabled
   "Abgeschlossen"). Decide in a later sprint whether repeating a workout is allowed and enforce
   it server-side.
2. **ADMIN on client self endpoints answers 404, not 403.** ADMIN holds every permission but is no
   client account (`requireClient`). No data leaks; the app refuses non-CLIENT logins anyway.
3. **No offline queue.** A tick without network is rolled back and offered for retry
   (SnackBar "Erneut versuchen"); it is not stored for later.
4. **Capability header is informational.** `X-Vitruv-App-Capability: 2` is sent but the server
   gates extended types only by the flag. Server-side gating per app version belongs to the
   rollout sprint.
5. **Video on iOS:** WebM/Ogg show a "kann auf diesem Gerät nicht abgespielt werden" message.
   Coaches need MP4/H.264 (or a server-side transcode, Sprint 7 pipeline) for iPhone playback.
6. **Week view is based on `startsOn` + weekday.** Plans without a start date get no calendar
   (honest "Ohne festen Termin"); coaches must set a start date for the weekly view.
7. Coach-side preview of the client week (web) is not part of this sprint.

## Dependencies for Sprint 5

- Owner decision on items 1 and 4 above.
- Real iPhone test on macOS/Xcode (layout, haptics, video playback, safe areas).
- Production migration plan for 0022–0024 (only after approval; never during development).
- Security dependency upgrades (Next.js, hono, @hono/node-server) as a separate, tested change.

## Apple Watch timer (additional requirement, 2026-11-22)

The iPhone side of the timer sync is prepared and tested with a fake link; the native iPhone
bridge, the watchOS target, signing, haptics and device validation are **Sprint 5.5 on
macOS/Xcode**. Switched off by default (`VITRUV_WATCH_TIMER_SYNC`). Interface, wire format and the
task list: [`apple-watch-timer-sync.md`](apple-watch-timer-sync.md). Real Apple Watch integration
is **not validated**.
