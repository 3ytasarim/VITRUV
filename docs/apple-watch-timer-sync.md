# Apple Watch timer sync — interface and Sprint 5.5 tasks

Status 2026-11-22: **only the iPhone (Flutter) side is prepared.** It is tested on Windows with
a fake WatchConnectivity link. There is no native code yet: no iPhone bridge, no watchOS target.
Nothing has run on an Apple Watch. **Do not claim Apple Watch support** until it has been tested
on real Apple hardware (Sprint 5.5, macOS + Xcode).

The switch is off in every normal build. It is only on with
`--dart-define=VITRUV_WATCH_TIMER_SYNC=true`, and even then only on iOS. When it is off,
`NoopTimerSyncTransport` is used and the iPhone timer behaves exactly as before. No server
feature flag was changed, and `TRAINING_EXTENDED_TYPES` stays OFF.

## Principles

1. **One logical timer state, one writer.**
   - The iPhone owns `SyncedTimerState`; the existing `Countdown` stays the source of truth.
   - The watch only renders the state and sends commands. It never edits the state.
2. **Absolute timestamps, no ticking.**
   - Only changes are sent: start, +30 s, pause, resume, completed, cancelled.
   - Each device computes `remaining = deadline − now` locally. A lost connection therefore does
     not stop or shift the countdown, and nothing is sent every second.
3. **Latest state wins.**
   - Every state carries a `revision` that keeps increasing across all timers of the phone,
     including after an app restart (`max(last + 1, now)`).
   - A receiver keeps a state only if its revision is higher. Late, duplicate or replayed
     messages are dropped, so a stale or duplicate timer cannot come back.
   - A new start gets a new `timerId` and a higher revision, which replaces the old timer.
4. **No HealthKit, no workout session, no background modes** just to keep a timer running. The
   watch derives the time from the deadline. Completion feedback while the watch app is not in
   front comes from a local notification scheduled for the deadline (see Sprint 5.5 tasks).

## Dart API (`apps/mobile/lib/features/workout/timer_sync/`)

| File                        | Purpose                                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `synced_timer.dart`         | `SyncedTimerState`, kind/phase/status enums, `TimerSyncMessage`, `TimerCommand`, `newerTimerState()`, `TimerRevisionSource`, `estimateClockSkewMs()` |
| `timer_sync_transport.dart` | `TimerSyncTransport` interface; `NoopTimerSyncTransport`; `MethodChannelTimerSyncTransport` (iOS bridge)                                             |
| `countdown_sync.dart`       | `CountdownSync`: mirrors one `Countdown` and publishes changes; handles watch commands                                                               |
| `timer_sync_providers.dart` | `kWatchTimerSyncEnabled`, `timerSyncTransportProvider`, `timerRevisionSourceProvider`                                                                |

Wiring in `workout_screen.dart`:

- The rest countdown is published as `STRENGTH_REST`, or `TOTAL_REPS_REST` for Total-Reps
  exercises, with phase `REST`.
- The timed-exercise countdown is published as `TIMED_EXERCISE` with phase `WORK`.
- When the app resumes, the current state is republished.
- Leaving the workout sends `CANCELLED`.

## Timer state (wire format v1)

| Field                         | Type                                                                | Meaning                                                                          |
| ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `timerId`                     | string (32 hex)                                                     | random id of one countdown run, never reused                                     |
| `workoutSessionId`            | string                                                              | server workout session                                                           |
| `exerciseId` / `exerciseName` | string?                                                             | current exercise (name already in German / coach text)                           |
| `kind`                        | `STRENGTH_REST` · `TOTAL_REPS_REST` · `TIMED_EXERCISE` · `INTERVAL` | `INTERVAL` is reserved for Core 40/20                                            |
| `phase`                       | `REST` · `WORK`                                                     | current phase                                                                    |
| `status`                      | `RUNNING` · `PAUSED` · `COMPLETED` · `CANCELLED`                    | `COMPLETED` triggers completion feedback; `CANCELLED` ends silently              |
| `startedAtMs`                 | int                                                                 | UTC epoch ms when the run started                                                |
| `deadlineMs`                  | int?                                                                | UTC epoch ms when it reaches zero; required while `RUNNING`, null while `PAUSED` |
| `durationMs`                  | int                                                                 | total length including extensions (for the progress ring)                        |
| `pausedRemainingMs`           | int?                                                                | remaining time while `PAUSED`                                                    |
| `revision`                    | int                                                                 | increasing; higher wins                                                          |

Envelopes:

- Phone → watch:
  `{"v":1,"type":"timer.state","origin":"phone","sentAtMs":…,"timer":{…}}`
- Watch → phone:
  `{"v":1,"type":"timer.command","origin":"watch","sentAtMs":…,"command":"CANCEL"|"REQUEST_STATE","timerId":…,"revision":…}`

Receivers ignore any message with a higher `v`, an unknown type or enum value, or a malformed
field, and they never crash on one.

### Receiver algorithm (watch, Swift — reference behaviour is `test/support/fake_watch.dart`)

```
on message(json):
  msg = parse(json) else ignore
  skew = |receivedAt − msg.sentAtMs| <= 1500 ms ? 0 : receivedAt − msg.sentAtMs
  if current == nil or msg.timer.revision > current.revision:
      current = msg.timer
      if current.status == COMPLETED: completion feedback (once)
      reschedule local notification for current.deadlineMs (RUNNING) / remove it (other states)
render every frame/second locally:
  remaining = RUNNING ? clamp(deadlineMs − (now − skew), 0, durationMs)
            : PAUSED  ? pausedRemainingMs : 0
  progress  = remaining / durationMs
on watch app launch / session reachable: send REQUEST_STATE
"Überspringen" button: send CANCEL {timerId, revision}  (the phone answers with CANCELLED)
```

The phone ignores a `CANCEL` whose `timerId` is not the current, non-terminal timer, so a stale
command cannot stop a newer timer.

## Flutter ⇄ native bridge (iPhone Runner)

MethodChannel `app.vitruv/watch_timer`:

| Direction     | Method     | Arguments                                                                           |
| ------------- | ---------- | ----------------------------------------------------------------------------------- |
| Dart → native | `publish`  | `{"payload": "<JSON envelope>"}`                                                    |
| native → Dart | `incoming` | `{"payload": "<JSON envelope>"}` (commands only; states from the watch are ignored) |

The payload is a JSON **string** because WatchConnectivity dictionaries are property lists and
cannot hold `null`.

Native handling of `publish`, with `WCSession.default` activated at app start:

1. `try session.updateApplicationContext(["timer": payload])`. Latest state wins, and it is
   delivered later if the watch is unreachable.
2. If `session.isReachable`, also `session.sendMessage(["timer": payload], replyHandler: nil)`
   for immediate display.
3. Errors are logged and never surfaced. If the session is not paired, not installed or not
   activated, the call is a no-op.

Native → Dart: in `session(_:didReceiveMessage:)` / `didReceiveUserInfo`, call
`channel.invokeMethod("incoming", ["payload": payload])` on the main thread.

Without a native handler, the Dart side gets `MissingPluginException` and switches itself off.
This is tested.

## Sprint 5.5 tasks (macOS + Xcode, real devices)

1. **iPhone bridge:** `WatchTimerBridge.swift` in Runner, with WCSession activation, the
   MethodChannel handler and the delegate methods above. Register it in `AppDelegate`.
2. **watchOS target:** SwiftUI watch app in the same Xcode workspace.
   - Bundle id `<app>.watchkitapp`.
   - Signing for both targets; the watch app is embedded in the iOS app.
   - No HealthKit entitlement, no `WKBackgroundModes`, no workout session.
3. **Watch UI:** exercise name, phase ("Pause" / "Belastung"), remaining time `mm:ss` and a
   progress ring.
   - Large, legible, and following Reduce Motion.
   - "Überspringen" button → `CANCEL`.
4. **Completion feedback:**
   - App in front: `WKInterfaceDevice.current().play(.notification)` plus a visual state.
   - App not in front: a local `UNNotificationRequest` scheduled at `deadlineMs`, with sound
     only if the user allowed notifications. It is rescheduled or removed on every newer state.
   - Ask for notification permission in context, never at first launch.
5. **Resync:** send `REQUEST_STATE` on launch and on `sessionReachabilityDidChange`. Read
   `receivedApplicationContext` on activation.
6. **Swift receiver tests:** port the Dart scenarios from `test/workout/timer_sync_test.dart`
   to XCTest:
   - out-of-order and duplicate delivery
   - offline then latest only
   - clock skew
   - stale cancel
   - unknown version
7. **Device validation (real iPhone + Apple Watch):**
   - rest timer start, +30 s, pause/resume, skip from either device, completion haptic
     and sound
   - Bluetooth off mid-timer, then back on
   - watch app in background
   - phone app killed during a rest
8. **Flip the build switch** for device test builds only. Production enablement is a separate
   owner decision.
9. **Later (not 5.5):** automatic Total-Reps rest timer, Core 40/20 interval timer (`INTERVAL`,
   `WORK`/`REST` phase transitions as new revisions of one run, plus a round counter field in
   wire v2).

## Test coverage on Windows

- `test/workout/timer_sync_test.dart` (19 tests):
  - state fields and deadline
  - no per-second messages
  - +30 s, pause and resume keep the id and raise the revision
  - completion feedback exactly once
  - cancel; a new start replaces the old timer; a late old state is ignored
  - dispose cancels
  - offline, then only the latest state is delivered
  - out-of-order and duplicate delivery
  - `REQUEST_STATE` resync
  - clock skew correction
  - watch cancel and stale cancel
  - wire format and parse safety
  - revisions increase across an app restart
  - MethodChannel bridge with and without a native handler
- `test/features/watch_timer_flow_test.dart` (4 tests) on the real workout screen:
  - the rest timer reaches the watch with the exercise name and session id
  - watch "Überspringen" ends the iPhone rest
  - leaving the workout cancels the watch timer
  - without a watch nothing changes, and the switch is off by default

Not tested and not testable here: real WatchConnectivity delivery, watch haptics and sound,
notification permission, battery/background behaviour, signing.
