# iOS Training — Sprint 8D: macOS CI (iOS simulator build)

Status 2026-11-23. Workflow prepared and validated **locally on Windows only**. It was **not
pushed and not triggered** → remote macOS CI: **NOT RUN**. No result below is a CI result.

## 1. Workflow — `.github/workflows/ios-simulator-build.yml`

| Step | What it does |
|---|---|
| Checkout | `actions/checkout` v7.0.1, pinned by SHA, `persist-credentials: false` |
| Locate project | finds the single `pubspec.yaml` next to `ios/Runner.xcodeproj` (→ `apps/mobile`); fails if 0 or >1 |
| Xcode and SDK versions | `sw_vers`, `xcode-select -p`, `xcodebuild -version`, simulator SDK, simulator runtimes, CocoaPods version |
| Set up Flutter | `subosito/flutter-action` v2.23.0, pinned by SHA, `flutter-version: 3.47.7`, SDK cache |
| Verify Flutter version | fails unless `frameworkVersion` = 3.47.7 |
| Flutter doctor | `flutter doctor -v` |
| Fail closed | fails if the workflow contains `API_BASE_URL=`, `APP_ENV=production`, `--release`, `build ipa`, `codesign` or flag-ON defines, or if `API_BASE_URL`/`APP_ENV`/`DATABASE_URL` are set in the job env |
| Resolve packages | `flutter pub get` |
| Analyze / Test | `flutter analyze --no-pub`, `flutter test --no-pub` (456 locally) |
| iOS simulator build | `flutter build ios --simulator --debug` |
| Artifact summary | job summary: runner, Xcode, SDK, Flutter, `Runner.app` size, bundle id, version, SPM vs CocoaPods, and the line "BUILD PASS only" |

No artifact upload (avoids a third-party action and storing builds); the summary is the record.

Local validation (Windows): YAML parsed with js-yaml (12 steps, triggers `pull_request` +
`workflow_dispatch`, `permissions: {contents: read}`, 0 `secrets.` references, no
`pull_request_target`); fail-closed guard dry run → OK on the real file, **fails** on a copy with
`--release` injected; project detection → exactly `./apps/mobile`; the `--version --machine` format
the check greps for was confirmed with the local Flutter 3.47.7. `actionlint` is not installed
here — not run.

## 2. Runner choice

`runs-on: macos-26` = macOS 26 **arm64**, generally available (actions/runner-images README,
read 2026-11-23). `macos-latest` currently points to the same image but is not used, so a future
label move cannot change the toolchain silently. `macos-14` images were retired 2026-11-02;
`macos-15` (arm64) is the fallback label if `macos-26` ever misbehaves. Xcode = the image default
(not pinned, because the image's Xcode list could not be read — the README page returned 503);
the job logs the exact Xcode + SDK. Flutter 3.47.7 requires Xcode ≥ 15, recommends ≥ 16
(`flutter_tools/lib/src/macos/xcode.dart`).

## 3. Flutter, SPM and plugins

- Flutter 3.47.7 / Dart 3.13.5 — identical to the Windows dev machine.
- Swift Package Manager is **enabled by default** on stable 3.47.7 (`features.dart`); the Xcode
  project already contains `FlutterGeneratedPluginSwiftPackage`. No Podfile in the repo; Flutter
  creates one only if it falls back to CocoaPods (CocoaPods is preinstalled on the image).
- iOS plugins: `flutter_local_notifications` 22.3.2, `flutter_secure_storage_darwin` 0.4.3,
  `pdfx` 2.11.0, `video_player_avfoundation` 2.12.1 — each ships `Package.swift` + podspec,
  minimum iOS 13.0 ≤ app deployment target 15.0. `path_provider_foundation` 2.6.0 (FFI, no
  native build). No entitlements; privacy manifest present.

## 4. Build command

`flutter build ios --simulator --debug` — the flag exists in 3.47.7 (`build_ios.dart`: "Build for
the iOS simulator instead of the device"; simulator defaults to debug). Simulator builds need no
code signing → no Team, no bundle-id decision, no certificates. No `--dart-define`: the debug
build uses the development default API (localhost) and the app is never launched, so CI makes
no request to any VITRUV endpoint. Release-only checks (fail-closed `AppConfig`, release
preflight) run as unit tests in `flutter test` (documentation mode).

## 5. Secrets policy

- The workflow uses **no secrets** — none must be added for it.
- Triggers: `pull_request` (fork PRs get a read-only token and no secrets by GitHub design) and
  manual `workflow_dispatch`. **Never** switch to `pull_request_target`.
- `permissions: contents: read`; checkout does not persist the token.
- Never add: `.env*`, `DATABASE_URL`, API keys, `MEDIA_URL_SIGNING_KEY`, Apple certificates,
  provisioning profiles, App Store Connect API keys. A future signing/TestFlight workflow must be
  a separate file, run only from protected branches/environments with required reviewers — out
  of scope here.
- Tests run against fakes; nothing in the Flutter suite connects to a database.

## 6. How to trigger (owner — NOT done)

1. Push `feature/ios-training` (or a branch containing this file) to GitHub — requires the owner's
   push approval.
2. While the file exists only on `feature/ios-training`: open a PR (e.g. into `main`) — the
   `pull_request` trigger runs it. Manual runs (Actions → "iOS simulator build" → Run workflow, or
   `gh workflow run ios-simulator-build.yml --ref <branch>`) only work once the workflow file is
   also on the default branch.
3. Read the job summary. Green = **BUILD PASS** (compile + dependency resolution + plugins).

## 7. Possible build problems and first checks

| Symptom | Likely cause / fix |
|---|---|
| "Flutter is not 3.47.7" | action could not fetch the version → re-run; do not loosen the check |
| `xcodebuild` requires newer Flutter / Xcode too old | image default changed → choose an installed Xcode via `sudo xcode-select -s /Applications/Xcode_<v>.app` in a step (log first) |
| SPM resolution fails for a plugin | temporary: `flutter config --no-enable-swift-package-manager` in CI to use CocoaPods; report the plugin |
| `pod install` errors (CocoaPods fallback) | `pod repo update` step; check plugin minimum iOS vs 15.0 |
| Swift compile error in a plugin | pin the plugin version that matched the last green build; report upstream |
| action SHA not found | SHAs were taken from the release pages 2026-11-23 — verify on GitHub and update together with the version comment |
| timeout (45 min) | first run without cache is slow; re-run |

## 8. Cost / runner usage

Standard macOS runner: **$0.062/min** vs Linux 2-core $0.006/min (~10×) for private repositories,
billed against the plan's included Actions budget (Free $12, Pro/Team $18, Enterprise Cloud $300
per month); **free for public repositories** (GitHub billing docs, read 2026-11-23). Expected
run: ~10–20 min (Flutter setup + tests + simulator build; first run without cache longer) → about
$0.60–1.25 per run in a private repo. Kept low by: path filter (`apps/mobile/**`), cancel of
superseded runs, 45-minute timeout, no matrix.

## 9. What CI does NOT prove

Simulator **compile** ≠ runtime. Not covered: launching the app in a simulator, UI tests,
Keychain on a device, local notifications, background/lock screen, AVPlayer video seek/renewal,
VoiceOver, WatchConnectivity (no native Watch code exists). The 44 device rows in
`ios-training-sprint8c-device-tests.md` stay **NOT TESTED** regardless of a green CI.

## 10. Still required for TestFlight

Bundle ID (D1), Team (D2), signing, production API URL (D3), export compliance (D6), privacy
policy URL (D4), deletion decision (D5), screenshots, demo account, real-device tests, Neon
0022–0025 — see `ios-training-sprint8c-testflight-readiness.md`. Upload only after a separate
approval.
