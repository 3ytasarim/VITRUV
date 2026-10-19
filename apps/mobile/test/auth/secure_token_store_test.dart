import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/auth/token_store.dart';

import '../support/fake_backend.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test(
    'round trip: both tokens in ONE secure-storage value, cleared on sign-out',
    () async {
      const storage = FlutterSecureStorage();
      final store = SecureTokenStore(storage);
      final tokens = FakeBackend().issue('kunde@example.invalid');
      await store.write(tokens);
      final all = await storage.readAll();
      expect(all.keys, ['vitruv.auth.session.v1']);
      final read = await store.read();
      expect(read!.accessToken, tokens.accessToken);
      expect(read.refreshToken, tokens.refreshToken);
      expect(read.accessTokenExpiresAt, tokens.accessTokenExpiresAt.toUtc());
      await store.clear();
      expect(await store.read(), isNull);
      expect(await storage.readAll(), isEmpty);
    },
  );

  test('a corrupt stored value is discarded (user signs in again) instead of crashing', () async {
    FlutterSecureStorage.setMockInitialValues({
      'vitruv.auth.session.v1': '{not json',
    });
    final store = SecureTokenStore(const FlutterSecureStorage());
    expect(await store.read(), isNull);
    expect(await const FlutterSecureStorage().readAll(), isEmpty);
  });

  test('the app never stores tokens in SharedPreferences or plain files', () {
    final offenders = [
      for (final f in Directory(
        'lib',
      ).listSync(recursive: true).whereType<File>())
        if (f.path.endsWith('.dart'))
          for (final line in f.readAsLinesSync())
            if (!line.trimLeft().startsWith('//'))
              for (final pattern in [
                'SharedPreferences',
                'shared_preferences',
                'File(',
                'writeAsString',
              ])
                if (line.contains(pattern)) '${f.path}: $pattern',
    ];
    expect(offenders, isEmpty);
    expect(
      File('pubspec.yaml').readAsStringSync(),
      isNot(contains('shared_preferences')),
    );
  });

  test('Android: app backup disabled for the encrypted session', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml')
        .readAsStringSync();
    expect(manifest, contains('android:allowBackup="false"'));
  });
}
