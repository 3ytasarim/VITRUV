import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Sprint 8A: a misconfigured release build (missing/unsafe API_BASE_URL, APP_ENV) stops here
  // instead of talking to a wrong or local server (fail closed).
  AppConfig.fromEnvironment();
  _registerFontLicences();
  runApp(const ProviderScope(child: VitruvApp()));
}

/// The bundled fonts are SIL OFL 1.1; the licence text ships with the app and appears on the
/// standard licences page.
void _registerFontLicences() {
  const licences = {
    'Barlow': 'assets/fonts/OFL-Barlow.txt',
    'Barlow Condensed': 'assets/fonts/OFL-BarlowCondensed.txt',
    'Chakra Petch': 'assets/fonts/OFL-ChakraPetch.txt',
  };
  LicenseRegistry.addLicense(() async* {
    for (final MapEntry(key: family, value: path) in licences.entries) {
      yield LicenseEntryWithLineBreaks([
        family,
      ], await rootBundle.loadString(path));
    }
  });
}
