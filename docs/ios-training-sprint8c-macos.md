# iOS Training — Sprint 8C: macOS / Xcode Environment

Status 2026-11-23. **Sprint 8C could not be executed on macOS: the only machine available to this
sprint is Windows.** No Xcode, no iOS SDK, no CocoaPods, no simulator, no connected iPhone, no
Apple Developer account access. Nothing below is presented as an iOS build result.

## 1. Environment check — real command output (abridged, paths removed)

```
$ uname -a
MINGW64_NT-10.0-26300 … x86_64 Msys

$ flutter doctor -v
[√] Flutter (Channel stable, 3.47.7, on Microsoft Windows [Version 10.0.26300.9974], locale tr-TR)
    • Framework revision abaf9c5237 (2026-10-08) · Engine revision deb287481e · Dart version 3.13.5
[√] Windows Version (Windows 11 or higher, 26H2, 2009)
[√] Android toolchain - develop for Android devices (Android SDK version 36.0.0)
[√] Chrome - develop for the web
[X] Visual Studio - develop Windows apps          (irrelevant for iOS)
[√] Connected device (3 available)
[√] Network resources
! Doctor found issues in 1 category.
(no "Xcode" / "CocoaPods" section — doctor only shows them on macOS)

$ flutter devices
Found 3 connected devices:
  Windows (desktop) • windows • windows-x64
  Chrome (web)      • chrome  • web-javascript
  Edge (web)        • edge    • web-javascript
(no iPhone, no iOS simulator)

$ xcodebuild -version     → bash: xcodebuild: command not found   (exit 127)
$ pod --version           → bash: pod: command not found          (exit 127)
$ ruby --version          → bash: ruby: command not found         (exit 127)

$ flutter build ios
Could not find a subcommand named "ios" for "flutter build".      (exit 64)
# available on this host: aar, apk, appbundle, bundle, web, windows
```

| Check | Result |
|---|---|
| macOS version | **n/a — Windows 11** |
| Xcode / command line tools / iOS SDK | **not installed (not installable on Windows)** |
| Flutter SDK | 3.47.7 stable ✅ |
| Dart SDK | 3.13.5 ✅ (`pubspec.yaml` requires `^3.13.5`) |
| CocoaPods / Ruby | not present |
| Connected iPhone | none |
| Apple Developer account access | none |

## 2. What did run (real, on Windows)

| Command | Result |
|---|---|
| `flutter pub get` | ✅ exit 0 (29 packages have newer, constraint-incompatible versions — no upgrade done) |
| `flutter analyze --no-pub` | ✅ No issues found |
| `flutter test --no-pub` | ✅ 456 passed (All tests passed) |
| `flutter build ios` | ❌ not available on Windows (see above) — **expected, not a project error** |

## 3. iOS project inspection (source, no build)

- Flutter project: `apps/mobile` (`ios/Runner.xcodeproj`, `ios/Runner.xcworkspace`, `RunnerTests`).
- **No `Podfile`** in the repo. `project.pbxproj` already references
  `FlutterGeneratedPluginSwiftPackage` (Swift Package Manager integration);
  `.flutter-plugins-dependencies` (generated on Windows) reports
  `swift_package_manager_enabled: {ios: false}` — on the Mac, Flutter decides SPM vs. CocoaPods
  and generates whatever is missing. Do not hand-write a Podfile.
- iOS plugins (5): `flutter_local_notifications` 22.3.2, `flutter_secure_storage_darwin` 0.4.3,
  `pdfx` 2.11.0, `video_player_avfoundation` 2.12.1 — each ships **both** `Package.swift` and a
  podspec → no plugin forces one tool; `path_provider_foundation` 2.6.0 has no native build (FFI).
  → no known iOS plugin blocker; real confirmation only by a Mac build.
- `Debug.xcconfig` / `Release.xcconfig` only include `Generated.xcconfig` (no Pods include). If the
  Mac falls back to CocoaPods, `flutter` adds the `#include? "Pods/…"` lines itself.
- Signing: `CODE_SIGN_STYLE = Automatic`, **no `DEVELOPMENT_TEAM`**, bundle id
  `com.vitruv.vitruvMobile` (provisional, Sprint 8B D1), tests `…RunnerTests`. No entitlements.
- Version `1.0.0+1` (pubspec) → `CFBundleShortVersionString` 1.0.0, build 1.
- App icon set complete for iPhone/iPad sizes incl. 1024×1024 marketing icon (visual approval of
  the artwork itself: owner).
- Privacy manifest present (Sprint 8A/8B).

## 4. Signing — not done

No Bundle ID decision, no Team ID, no certificates/profiles were provided → **signing was not
attempted**, nothing was guessed, no Apple account was touched.

## 5. Mac procedure (for the person with the Mac — nothing of it was run)

Recommended versions: current Xcode that supports the installed iOS on the test iPhone and the
Flutter 3.47.x requirement (`flutter doctor` names the minimum); Flutter **3.47.7** (same as CI here,
avoid an upgrade during the sprint); CocoaPods only if Flutter asks for it (`brew install cocoapods`).

```
git switch feature/ios-training            # local commits up to Sprint 8B — no reset/rebase
cd apps/mobile
flutter doctor -v && xcodebuild -version && flutter devices
flutter pub get && flutter analyze && flutter test
# 1) simulator, isolated API on the Mac (never production):
flutter run -d "iPhone SE (3rd generation)" \
  --dart-define=APP_ENV=development --dart-define=API_BASE_URL=http://localhost:4000
# 2) signing in Xcode: open ios/Runner.xcworkspace → Runner → Signing & Capabilities →
#    owner selects Team + final bundle id (D1/D2). Never commit certificates or profiles.
# 3) physical iPhone (debug), isolated API reachable on the LAN:
flutter run -d <iPhone id> \
  --dart-define=APP_ENV=development --dart-define=API_BASE_URL=http://<mac-lan-ip>:4000
# 4) release preflight (must FAIL until all owner blockers are closed):
flutter test test/release/ios_release_preflight_test.dart \
  --dart-define=VITRUV_RELEASE_PREFLIGHT=true --dart-define=APP_ENV=production \
  --dart-define=API_BASE_URL=OWNER_PROVIDED_HTTPS_URL
# 5) flutter build ipa — ONLY after the separate approval (TestFlight readiness doc)
```

Isolated API for step 1/3: API + web started against a local/isolated PostgreSQL with fictional
seed users (like the E2E harness) — never the root `.env` (production Neon), never real customer
accounts. Debug builds accept `http://` only with `APP_ENV=development`; release builds refuse it.
