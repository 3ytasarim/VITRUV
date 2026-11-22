# iOS Training — Sprint 6 remaining work

Date: 2026-11-23. Everything below is **open**. Nothing here was done or verified in Sprint 6.

## Device requirements (macOS + Xcode + real iPhone)

- **iOS build:** never compiled on macOS. The Sprint 6 Dart code needs no new native code, but
  the whole app is unverified on iOS.
- **Total reps:** check on a real iPhone:
  - the rest-end notification after a stored set (sound, locked screen);
  - no notification after a failed save or after the last set.
- **Core:** check the phase-change series on a locked iPhone:
  - nine notifications in time for 5 × 40/20;
  - sound in the foreground;
  - cancelled on pause, cancel and leave;
  - nothing duplicated after resume.
  - The audible signal is the notification. The app plays no own sound (the SDK only has system
    clicks).
- **Background and kill:**
  - background longer than 280 s;
  - kill during REST, then reopen;
  - reboot (Keychain `first_unlock_this_device`).
- **VoiceOver and Dynamic Type:**
  - the phase announcements must not be too chatty;
  - the countdown label;
  - the stepper and "Satz speichern".
- **Haptics:** on the device.

## Android

- No phase or rest notifications on Android (the scheduler is a no-op by design, as in
  Sprint 5). Exact alarms need an owner decision.
- The debug APK builds but was not installed on a device.

## Apple Watch (Sprint 5.5)

- The native bridge and the watchOS target do not exist. The Dart side publishes the
  Total-reps rest and the Core phases (each phase = a new `timerId`).
- The watch app must:
  - show the phase kind;
  - treat a new `timerId` as the next phase;
  - send `cancel` only with the `timerId` it shows (see `apple-watch-timer-sync.md`).

## Known gaps / follow-ups

- **Warm-up with one item:** the only checklist item's semantics merge into the section header,
  so VoiceOver reads the header plus "… abhaken" as one button. Pre-existing (Sprint 4); the
  Sprint 6 fixtures use two items. Fix: give each item its own semantics container.
- **Core "Runden speichern"** retries only while the app is open. Rounds still unsaved when the
  app is killed are recovered at the next restore only if the routine state is still saved
  (≤ 10 min after its end). Later, the rounds stay open on the server and the client can
  restart from the first open round.
- **Total reps:** a set that failed and then the app was killed is not retried automatically
  (the entry is lost; nothing was stored, so nothing is wrong on the server).
- **Core `actualDurationSeconds`** = the planned work seconds of the round. A paused phase still
  reports the planned value (no stopwatch of the real effort).
- **Web portal:** shows Total-reps sets and Core rounds only through the existing history
  views. No dedicated web UI for the engines (not in scope).

## Release blockers carried over (unchanged by Sprint 6)

- Migrations 0022–0024 are **not applied on Neon**. Total reps per set, the round rows and the
  timer config need them. Apply only with owner approval (read SQL → migrate → inspect).
- `TRAINING_EXTENDED_TYPES` must stay OFF in production until the owner approves. With it off,
  coaches cannot create INTERVAL (Core) templates.
- Dependency advisories:
  - Next.js 16.4.1 (the build prints a security notice), hono, @hono/node-server, minimatch;
  - `pg@9` deprecation warning;
  - not upgraded.
- No iOS build, no device tests, no real-browser E2E.
- **This is not release-ready.**

## Sprint 7 dependencies

- Device verification of the items above (needs a Mac and an iPhone).
- The owner decides whether to enable `TRAINING_EXTENDED_TYPES` on staging after migrating
  0022–0024 there.
- Native watch bridge (Sprint 5.5) before any watch claim.
- Product questions for the owner:
  - a "Core erneut starten" after completion?
  - should a Total-reps exercise allow editing or deleting a stored set (today: append-only)?
