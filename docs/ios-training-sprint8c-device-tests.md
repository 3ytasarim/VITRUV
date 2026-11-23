# iOS Training — Sprint 8C: Real iPhone Tests

Status 2026-11-23. **No iPhone and no Mac were available** (`flutter devices` lists only
Windows/Chrome/Edge — see `ios-training-sprint8c-macos.md` §1). Therefore **every device test is
NOT TESTED.** No item is marked PASS. Flutter widget tests on Windows (456 passed) cover the same
logic in the test engine, but they are not device results and are listed only as a reference.

Device / iOS version / build: — (none)

## A. Login

| Test | Device result | Engine coverage on Windows (reference only) |
|---|---|---|
| Username login | NOT TESTED | `test/auth/sprint1_auth_test.dart` |
| Email login | NOT TESTED | same |
| No-email account | NOT TESTED | same |
| Token refresh | NOT TESTED | auth/interceptor tests |
| Keychain restore after relaunch | NOT TESTED | secure-storage fake only — real Keychain untested |
| Logout | NOT TESTED | auth tests |

## B. Training

| Test | Device result |
|---|---|
| Weekly schedule | NOT TESTED |
| Warm-up checklist | NOT TESTED |
| Strength repetitions | NOT TESTED |
| Manual rest timer | NOT TESTED |
| Total Reps | NOT TESTED |
| Automatic rest timer | NOT TESTED |
| Core 40/20 | NOT TESTED |
| Workout completion | NOT TESTED |
| Session resume | NOT TESTED |
| Training history | NOT TESTED |

(Engine coverage: Sprint 4–7 feature tests, `screens_responsive_test.dart`.)

## C. App lifecycle

| Test | Device result |
|---|---|
| Background | NOT TESTED |
| Lock screen | NOT TESTED |
| Force quit | NOT TESTED |
| App relaunch | NOT TESTED |
| Expired session | NOT TESTED |
| Network loss | NOT TESTED |
| Network reconnect | NOT TESTED |

## D. Notifications

| Test | Device result |
|---|---|
| Permission granted | NOT TESTED |
| Permission denied | NOT TESTED |
| Timer end | NOT TESTED |
| Core phase transitions | NOT TESTED |
| Sound | NOT TESTED |
| Haptic feedback | NOT TESTED |
| Stale notification cancellation | NOT TESTED |

## E. Video

| Test | Device result |
|---|---|
| MP4/H.264 playback | NOT TESTED |
| AAC audio | NOT TESTED |
| Pause/play | NOT TESTED |
| HTTP Range seek | NOT TESTED (server side: Range/206 proven in API PG tests) |
| Expired signed URL | NOT TESTED |
| URL renewal | NOT TESTED (renewal logic: Flutter tests) |
| S3 redirect behaviour (AVPlayer following 302) | NOT TESTED |
| Playback after reconnection | NOT TESTED |

## F. Accessibility

| Test | Device result |
|---|---|
| VoiceOver | NOT TESTED (semantics labels: Flutter tests) |
| Warm-up single item | NOT TESTED |
| Video controls | NOT TESTED |
| Dynamic text | NOT TESTED (text scale 1.0/1.5/2.0 in engine tests) |
| Small screen layout | NOT TESTED (320 dp engine tests) |
| Large font sizes | NOT TESTED |

## Summary

PASS 0 · FAIL 0 · NOT TESTED 44.

## How to run them (on the Mac)

Debug build on the iPhone against an **isolated** API with fictional users
(`ios-training-sprint8c-macos.md` §5). For E (video) the isolated API needs
`MEDIA_URL_SIGNING_KEY` (test value, not the production secret), a short
`TRAINING_MEDIA_URL_TTL_SECONDS` (e.g. 60) to provoke expiry, and a PRIVATE test video
(H.264 + AAC MP4). For the S3 redirect case an isolated S3-compatible bucket — never production
storage. Record per row: PASS/FAIL, device model, iOS version, build, date, note/screenshot
(fictional data only).
