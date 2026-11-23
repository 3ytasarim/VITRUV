# iOS Training — Sprint 8C: TestFlight Readiness

Status 2026-11-23. **Not ready for TestFlight.** No IPA was built, nothing was uploaded, no App
Store Connect record created, no Apple account changed. Environment: Windows only
(`ios-training-sprint8c-macos.md`).

| Item | State | Blocker |
|---|---|---|
| Final bundle ID | `com.vitruv.vitruvMobile` provisional (8B D1) | **yes** |
| Developer Team | unknown, no `DEVELOPMENT_TEAM` (D2) | **yes** |
| Signing (certificate, profile) | not attempted — no Mac, no Team | **yes** |
| macOS + Xcode build (simulator / device) | not possible on this machine | **yes** |
| Real iPhone tests A–F | 0 / 44 run (`…-device-tests.md`) | **yes** |
| Production API URL | unknown, not guessed (D3); release build refuses to start without it | **yes** |
| Privacy Policy URL | draft only, not published (D4) | yes (for external testing / review) |
| Export compliance | `ITSAppUsesNonExemptEncryption` undecided (D6) | yes (upload questionnaire) |
| App icon | full icon set incl. 1024 px present in the project | artwork approval by owner |
| Screenshots | none (require device/simulator + fictional demo data) | yes (store listing) |
| Demo account | recipe only (isolated cluster); not created on any real environment | yes (review) |
| Review notes | draft text in 8A/8B docs (login-only app, coach-created accounts, deletion path) | finalise after D5 |
| Account deletion (5.1.1(v)) | design only (8B), no in-app path | review risk |
| App version / build number | 1.0.0 / 1 (pubspec) | build number must increase per upload |
| Neon 0022–0025 on production | not applied (API build expects them) | blocks a production-backed beta |
| Flags | `TRAINING_EXTENDED_TYPES` off, `VITRUV_WATCH_TIMER_SYNC` off, nutrition tab off | — |
| Apple Watch | Flutter interface only; no WatchConnectivity bridge, no watchOS app (planned scope "Sprint 5.5") | not part of 1.0 |
| Private media in production | not switched (PUBLIC) | — |

## Recommended fixes / next steps

1. Owner: decide D1, D2, D3, D6; provide Mac + iPhone access (or a Mac CI runner such as a
   hosted macOS build machine — owner choice).
2. On the Mac: procedure `ios-training-sprint8c-macos.md` §5 steps 1–4, then the device table.
3. Fix whatever the first real build reports (plugin/SDK versions) in a separate local commit.
4. Publish the privacy policy, create the demo account on the review environment (operator).
5. Then ask for the **separate approval** for `flutter build ipa` + upload — not before.
