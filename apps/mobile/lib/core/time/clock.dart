import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Time source. Production uses the wall clock; tests inject a fake one, so nothing ever waits
/// for real seconds or minutes.
///
/// Timers (rest timer, token expiry) compare against an ABSOLUTE target time computed from this
/// clock instead of counting ticks — a timer that was in the background for 20 s shows 20 s less
/// when the app returns, and device sleep does not stop it.
abstract class Clock {
  const Clock();

  DateTime now();
}

class SystemClock extends Clock {
  const SystemClock();

  @override
  DateTime now() => DateTime.now();
}

/// Test clock: advanced manually.
class FakeClock extends Clock {
  FakeClock([DateTime? start]) : _now = start ?? DateTime.utc(2026, 10, 16, 8);

  DateTime _now;

  @override
  DateTime now() => _now;

  void advance(Duration by) => _now = _now.add(by);
}

final clockProvider = Provider<Clock>((ref) => const SystemClock());
