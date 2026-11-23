# iOS Training — Sprint 8B: Apple Checklist

Status 2026-11-23. Prepared on Windows. **No Mac build, no Xcode archive, no device test, no App
Store Connect action, no TestFlight upload.** Owner decisions are in
`ios-training-sprint8b-open-decisions.md` (D1–D10).

## 1. iOS project audit (source, verified by `test/release/ios_release_preflight_test.dart`)

| Item | State | Note |
|---|---|---|
| Display name / bundle name | ✅ `VITRUV` | |
| Localisation | ✅ `de` only | matches the German-only app |
| Device family | ✅ `1` (iPhone) — changed in 2c4c58d | iPad = compatibility mode, no native layout |
| Orientation | ✅ portrait only | |
| Deployment target | ✅ iOS 15.0 | |
| Version / build | ✅ from `pubspec.yaml` (`FLUTTER_BUILD_NAME/NUMBER`) — 1.0.0 | build number must rise per upload |
| ATS | ✅ no arbitrary loads; `NSAllowsLocalNetworking` (dev only, does not open public HTTP) | |
| Usage descriptions | ✅ none — app uses no camera/photos/location/mic/contacts/Health | |
| Background modes | ✅ none | |
| Notifications | local only; `UNUserNotificationCenter` delegate set in AppDelegate; no push entitlement | |
| Privacy manifest | ✅ `PrivacyInfo.xcprivacy`: no tracking, no tracking domains; collected: Email, User ID, Fitness | required-reason APIs: verify on Mac (see §5) |
| Bundle id | ⛔ `com.vitruv.vitruvMobile` provisional | D1 |
| Team / signing | ⛔ no `DEVELOPMENT_TEAM`, no profiles | D2 — never invented |
| Export compliance key | ⛔ not set | D6, §4 |
| Entitlements | none (none needed) | |
| Watch target | none (by decision) | D8 |

## 2. Bundle id — recommendation (not applied)

Use reverse-DNS of a domain the **owner/legal entity actually controls**, e.g. `<tld>.<domain>.app`
for the account holder's verified domain. Requirements: unique, never changeable after the first
upload, lowercase recommended. If a native Watch app is ever added, its id must be
`<bundle id>.watchkitapp`. Change in Xcode (Runner → Signing & Capabilities) or the three
`PRODUCT_BUNDLE_IDENTIFIER` lines in `project.pbxproj`, then update `IosBlocker` expectations.

## 3. API configuration

Release builds refuse to start unless `APP_ENV=production` and `API_BASE_URL` is an `https://`
origin that is not localhost, an IP address or a placeholder (`AppConfig.resolve`, tested). The
production URL is **not known** (D3) and was not guessed.

```
flutter build ipa --release \
  --dart-define=APP_ENV=production \
  --dart-define=API_BASE_URL=OWNER_PROVIDED_HTTPS_URL
# never: VITRUV_NUTRITION_TAB, VITRUV_WATCH_TIMER_SYNC
```

## 4. Export compliance (`ITSAppUsesNonExemptEncryption`)

Facts from code: HTTPS only (Dart `HttpClient`, which uses the **BoringSSL bundled in the Flutter
engine**, not Apple's TLS stack); tokens in the iOS Keychain via `flutter_secure_storage`; no
custom or proprietary cryptography, no end-to-end encryption, no VPN, no file encryption.
Assessment: very likely the "exempt" category (standard encryption for authentication/transport),
which would allow `false` — **but** the bundled TLS library makes this an owner/legal call
(Apple's questionnaire; possibly the annual self-classification report in the US rules). Therefore
the key is **not written** and stays blocker D6. Decide → add the key → update the audit test.

## 5. App Privacy ("Nutrition label") — draft, consistent with the privacy policy draft

Tracking: **No**. Third-party SDKs collecting data: **none** (no analytics, crash, ads).

| Apple data type | Collected | Linked to user | Tracking | Purpose |
|---|---|---|---|---|
| Contact info → Email address | yes (optional on account) | yes | no | App functionality (account) |
| Contact info → Name | yes (profile, set by coach) | yes | no | App functionality |
| Contact info → Phone | yes, optional (profile) | yes | no | App functionality (coach contact) |
| Identifiers → User ID | yes | yes | no | App functionality |
| Health & Fitness → Fitness | yes (sets, reps, weights, times) | yes | no | App functionality |
| User content → Other (session note) | yes, optional | yes | no | App functionality |
| Usage data / Diagnostics | **no** (server request log has no user content; no SDK) | — | — | — |
| Location, Photos, Contacts, Browsing, Search, Purchases, Financial | no | — | — | — |

Open: whether Apple's "Health" category (vs. "Fitness") applies is tied to the Art. 9 question
in the policy (D4/D5). Name, Phone and Other user content are not yet listed in `PrivacyInfo.xcprivacy` — add them when
the owner confirms this table (manifest and label must match).

## 6. Account deletion — Guideline 5.1.1(v)

Re-assessed: a missing sign-up does not make the app safely exempt. Recommendation and design:
`ios-training-sprint8b-account-deletion.md`. **No button built** (backend + policy not approved,
D5). Until then this is an **open review risk**.

## 7. Layout checks (spec §11)

`test/ui/screens_responsive_test.dart` pumps Login, Heute, Training, Tag, Workout, Abschluss and Profil
at **320/375/390/430/768 dp × text scale 1.0/1.5/2.0** without overflow; the 8B update screen
has its own 320 px / 200 % test. This is a Flutter-engine check on Windows, **not** an iPhone
SE / Dynamic Type test on a device → device row C below.

## 8. Device test plan (all **NOT TESTED** — needs a Mac + real iPhone)

| # | Area | Steps | Result |
|---|---|---|---|
| A | Install & start | TestFlight build installs, starts with production config, no debug banner, icon/name correct | NOT TESTED |
| B | Auth | login (username + e-mail), wrong password generic error, logout, kill + relaunch keeps session (Keychain), token refresh after expiry | NOT TESTED |
| C | Layout | iPhone SE (320 pt) + Pro Max; Dynamic Type largest; dark/light system setting; no clipped buttons | NOT TESTED |
| D | Training | plan, start workout, rest timer + local notification in background/lock screen, finish, history | NOT TESTED |
| E | Media | video plays, seek (Range), pause > TTL → renewal, offline error state | NOT TESTED |
| F | Version gate | test server with `MOBILE_MIN_VERSION_IOS` above build → update screen, retry after lowering, still signed in | NOT TESTED |

## 9. Apple Watch

Interface (`TimerSyncTransport`, `lib/features/workout/timer_sync/`) only; compile-time flag `VITRUV_WATCH_TIMER_SYNC` **OFF**; no Watch
target, no WatchConnectivity, nothing native. Not part of 1.0 (D8).

## 10. TestFlight preparation (owner, on the Mac — nothing done)

1. Decide D1 (bundle id), D2 (Team), D3 (API URL), D6 (encryption key).
2. App Store Connect: create the app record **by the owner** (name, SKU, primary language German).
3. Privacy policy published at a real HTTPS URL (D4) → App Store Connect + support URL.
4. App Privacy answers = §5.
5. `flutter test` + preflight with `VITRUV_RELEASE_PREFLIGHT=true` → green.
6. `flutter build ipa` with §3 defines; Xcode Organizer → validate → upload.
7. Internal TestFlight → device plan §8 A–F with real results.
8. Demo account (§11) on the **review** environment.
9. Review notes: login-only app, accounts created by the coach, demo credentials in the App Store
   Connect field only, deletion path (§6).

## 11. Demo account

Recipe proven only on the isolated cluster (Sprint 8A, `sprint8a-review-demo.pg.test.ts`).
**Not created in production.** The operator creates a fictional demo coach/client with the
existing operator tooling on the review environment; credentials go only into App Store Connect,
never into git, docs or chat.
