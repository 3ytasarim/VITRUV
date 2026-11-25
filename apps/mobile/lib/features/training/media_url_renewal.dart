import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/time/clock.dart';
import 'training_api.dart';

/// Sprint 8A — private training media (docs/ios-training-sprint8a-private-media.md).
///
/// A PRIVATE training video comes from the API as a short-lived, user-bound signed URL
/// (`…/v1/media/training/<assetId>?u=…&e=<expires unix>&s=…`). AVPlayer cannot send a bearer
/// token, so the URL itself authorises — and it expires. This helper:
/// - renews the URL BEFORE opening when it expires within [renewAhead] (proactive),
/// - renews it ONCE after a failed open / playback error (the server answers 403 for an expired
///   URL; the player only reports a generic error), and then never loops: a second failure in a
///   row shows the normal error state with "Erneut versuchen",
/// - never touches public URLs (older PUBLIC videos, images on the CDN).

/// Asks the API for a fresh URL of [assetId] (null = not allowed / not available).
typedef MediaUrlRenewer = Future<String?> Function(String assetId);

/// Path of signed training media (API `TRAINING_MEDIA_PATH`).
const signedTrainingMediaPath = '/v1/media/training/';

/// Expiry of a signed training media URL, or null for any other URL.
DateTime? signedMediaExpiry(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || !uri.path.startsWith(signedTrainingMediaPath)) return null;
  final seconds = int.tryParse(uri.queryParameters['e'] ?? '');
  if (seconds == null) return null;
  return DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true);
}

class MediaUrlRenewal {
  MediaUrlRenewal({
    required this.assetId,
    required String initialUrl,
    required this.renewer,
    required this.now,
    this.renewAhead = const Duration(seconds: 60),
  }) : _url = initialUrl;

  final String assetId;
  final MediaUrlRenewer? renewer;
  final DateTime Function() now;
  final Duration renewAhead;
  String _url;
  bool _renewedSinceSuccess = false;

  String get url => _url;
  bool get isSigned => signedMediaExpiry(_url) != null;

  /// The URL to open now — renewed first when it is (about to be) expired.
  Future<String> urlForOpen() async {
    final expiry = signedMediaExpiry(_url);
    if (expiry != null && !expiry.isAfter(now().toUtc().add(renewAhead))) {
      await _renew();
    }
    return _url;
  }

  /// After a failed open or a playback error: a fresh URL to retry with, or null (public URL,
  /// no renewer, renewal refused, or already renewed once without a successful playback).
  Future<String?> renewAfterFailure() async {
    if (!isSigned || _renewedSinceSuccess) return null;
    return await _renew() ? _url : null;
  }

  /// The player opened successfully: a later failure may renew again.
  void markPlaying() => _renewedSinceSuccess = false;

  /// The client tapped "Erneut versuchen": one more renewal is allowed (still never a loop).
  void userRetry() => _renewedSinceSuccess = false;

  Future<bool> _renew() async {
    final renew = renewer;
    if (renew == null) return false;
    _renewedSinceSuccess = true;
    try {
      final fresh = await renew(assetId);
      if (fresh == null || fresh.isEmpty) return false;
      _url = fresh;
      return true;
    } on Object {
      return false; // offline / 404: keep the old URL, the player shows its error state
    }
  }
}

/// The renewer of the signed-in client (tests override it).
final mediaUrlRenewerProvider = Provider<MediaUrlRenewer?>((ref) {
  final api = ref.watch(clientApiProvider);
  return api.trainingMediaUrl;
});

/// Clock for the expiry check (shared app clock → fake time in tests).
final mediaClockProvider = Provider<DateTime Function()>(
  (ref) => ref.watch(clockProvider).now,
);
