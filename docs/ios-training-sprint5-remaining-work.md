# iOS Training — Sprint 5 remaining work

Date: 2026-11-22. Everything below is **open**. Nothing here was done or verified in Sprint 5.

## Not verifiable on Windows (needs macOS + Xcode + a real iPhone)

- iOS build of the app (Runner) — never compiled; `AppDelegate.swift` change unverified.
- Rest-end notification on iOS: permission prompt, sound on a locked screen, foreground
  presentation, no duplicate after "+30 Sek.", cancellation on pause/skip/leave.
- Rest restore after an app kill on a real device (secure storage / Keychain read after reboot).
- Background → foreground timer accuracy on a device (only tested with a fake clock).
- VoiceOver pass over the new reps field, "Pause starten" and the history detail.

## Android

- No end-of-rest notification on Android (no-op scheduler by design). An exact alarm needs
  `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` and a decision by the owner. The in-app visual
  signal and haptics work on both platforms.
- The debug APK builds on Windows (with an ASCII `TEMP`, see test results). Not installed on a
  device.

## Apple Watch (Sprint 5.5)

- Native WatchConnectivity bridge and the watchOS target were deliberately NOT created (Sprint 5
  instruction). The Dart side (`CountdownSync`, flags off) is ready; see `apple-watch-timer-sync.md`.

## Release blockers carried over (unchanged by Sprint 5)

- Migrations 0022–0024 are **not applied on Neon**; the training v2 / per-set features need them.
  Apply only with owner approval (read SQL → migrate → inspect).
- Dependency advisories: Next.js 16.4.1, hono, @hono/node-server, minimatch; `pg@9` deprecation
  warning. Not upgraded (no large upgrades without approval).
- No real-browser E2E of the web portal; no iOS build; no device tests.
- Production feature flags stay OFF.

## Product questions for the owner

- Should a client be able to repeat a completed day on purpose (e.g. "Nochmal trainieren")?
  Sprint 5 locks it (API 409) as required; a repeat would need an explicit new flow.
- Should the web portal open the completed session instead of showing the 409 message?
- Android exact-alarm permission: yes / no.
