import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/api/api_client.dart';
import 'package:vitruv_mobile/auth/auth_api.dart';
import 'package:vitruv_mobile/auth/auth_interceptor.dart';
import 'package:vitruv_mobile/auth/auth_models.dart';
import 'package:vitruv_mobile/auth/auth_session.dart';
import 'package:vitruv_mobile/auth/token_store.dart';
import 'package:vitruv_mobile/core/json/json_reader.dart';
import 'package:vitruv_mobile/core/theme/app_theme.dart';
import 'package:vitruv_mobile/core/theme/vitruv_tokens.g.dart';
import 'package:vitruv_mobile/core/time/clock.dart';
import 'package:vitruv_mobile/shared/ui/ui.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';

/// Sprint 1 (iOS foundation): login with the EXISTING website account — e-mail OR username —,
/// nullable e-mail, Teilnehmer-only access, session handling and the VITRUV brand on the login.
/// Fake backend only (fictional accounts); never the production API.
void main() {
  Finder loginField() =>
      find.widgetWithText(TextFormField, 'Benutzername oder E-Mail');
  Finder passwordField() => find.widgetWithText(TextFormField, 'Passwort');

  Future<void> signIn(
    WidgetTester tester,
    String loginId, [
    String password = 'richtig-1234',
  ]) async {
    await tester.enterText(loginField(), loginId);
    await tester.enterText(passwordField(), password);
    await tapOn(tester, find.byType(VitruvButton));
  }

  group('login with the existing account', () {
    testWidgets(
      'T1 e-mail login sends the contract payload (clientType MOBILE)',
      (tester) async {
        final h = AppHarness(signedIn: false);
        await h.pump(tester);
        await signIn(tester, 'Kunde@Example.invalid');
        expect(h.backend.loginBodies.single, {
          'email': 'kunde@example.invalid', // normalised like authLoginIdSchema
          'password': 'richtig-1234',
          'clientType': 'MOBILE',
        });
        expect(h.store.tokens, isNotNull);
        expect(find.text('HALLO ERIKA'), findsOneWidget);
      },
    );

    testWidgets('T2 username login (no "@") — trimmed + lowercased', (
      tester,
    ) async {
      final h = AppHarness(signedIn: false);
      await h.pump(tester);
      await signIn(tester, '  Max.Muster ');
      expect(h.backend.loginBodies.single['email'], 'max.muster');
      expect(h.store.tokens, isNotNull);
      expect(find.text('HALLO MAX'), findsOneWidget);
    });

    testWidgets(
      'T3 a client WITHOUT e-mail signs in and sees the profile without crashing',
      (tester) async {
        final h = AppHarness(signedIn: false);
        await h.pump(tester);
        await signIn(tester, 'max.muster');
        expect(tester.takeException(), isNull);
        await tapOn(tester, find.byIcon(Icons.person_outline));
        expect(find.text('MAX MUSTER'), findsOneWidget);
        // MetaLabel renders the caption role in upper case
        expect(
          find.text('E-MAIL'),
          findsNothing,
          reason: 'no empty e-mail row',
        );
        expect(find.text('COACH'), findsOneWidget);
        expect(find.text('Coach Alex'), findsOneWidget);
      },
    );

    testWidgets('T4 wrong password: one generic message, nothing stored', (
      tester,
    ) async {
      final h = AppHarness(signedIn: false);
      await h.pump(tester);
      await signIn(tester, 'max.muster', 'falsch-0000');
      expect(
        find.text('Benutzername, E-Mail oder Passwort ist nicht korrekt.'),
        findsOneWidget,
      );
      expect(h.store.tokens, isNull);
      // an unknown account gets exactly the same message (no account probing)
      await signIn(tester, 'gibt.es.nicht');
      expect(
        find.text('Benutzername, E-Mail oder Passwort ist nicht korrekt.'),
        findsOneWidget,
      );
    });

    testWidgets('T8 COACH is rejected and the new session revoked at once', (
      tester,
    ) async {
      final h = AppHarness(signedIn: false);
      await h.pump(tester);
      await signIn(tester, 'coach@example.invalid');
      expect(
        find.text(
          'Diese App ist nur für Teilnehmer verfügbar. Coaches nutzen den Webzugang.',
        ),
        findsOneWidget,
      );
      expect(h.backend.logoutCalls, 1);
      expect(h.store.tokens, isNull);
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('T9 ADMIN is rejected and the new session revoked at once', (
      tester,
    ) async {
      final h = AppHarness(signedIn: false);
      await h.pump(tester);
      await signIn(tester, 'admin@example.invalid');
      expect(
        find.text(
          'Diese App ist nur für Teilnehmer verfügbar. Coaches nutzen den Webzugang.',
        ),
        findsOneWidget,
      );
      expect(h.backend.logoutCalls, 1);
      expect(h.store.tokens, isNull);
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('T10 Teilnehmer login opens the protected app', (tester) async {
      final h = AppHarness(signedIn: false);
      await h.pump(tester);
      expect(find.byType(NavigationBar), findsNothing);
      await signIn(tester, 'kunde@example.invalid');
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(h.store.writes, 1);
    });

    testWidgets('T12 no connection at login: network message, nothing stored', (
      tester,
    ) async {
      final h = AppHarness(signedIn: false);
      await h.pump(tester);
      h.backend.offline = true;
      await signIn(tester, 'kunde@example.invalid');
      expect(
        find.text('Keine Verbindung. Bitte prüfe deine Internetverbindung.'),
        findsOneWidget,
      );
      expect(h.store.tokens, isNull);
      // back online: the same form signs in
      h.backend.offline = false;
      await signIn(tester, 'kunde@example.invalid');
      expect(find.text('HALLO ERIKA'), findsOneWidget);
    });
  });

  group('session restore (T11)', () {
    testWidgets('a stored Teilnehmer session is restored after a restart', (
      tester,
    ) async {
      final h = AppHarness(signedIn: false);
      h.store.tokens = h.backend.issue('max.muster');
      await h.pump(tester);
      expect(find.text('HALLO MAX'), findsOneWidget);
      expect(h.backend.requests, contains('GET /v1/auth/me'));
      expect(h.backend.requests.where((r) => r.contains('/login')), isEmpty);
    });

    testWidgets(
      'a stored COACH session is ended on restore (role re-checked)',
      (tester) async {
        final h = AppHarness(signedIn: false);
        h.store.tokens = h.backend.issue('coach@example.invalid');
        await h.pump(tester);
        expect(find.byType(NavigationBar), findsNothing);
        expect(
          find.text(
            'Diese App ist nur für Teilnehmer verfügbar. Coaches nutzen den Webzugang.',
          ),
          findsOneWidget,
        );
        expect(h.store.tokens, isNull);
        expect(h.backend.logoutCalls, 1);
      },
    );
  });

  group('token refresh + rotation', () {
    ({
      ApiClient api,
      AuthSession session,
      MemoryTokenStore store,
      FakeBackend backend,
    })
    wire() {
      final clock = FakeClock();
      final backend = FakeBackend(now: clock.now);
      final store = MemoryTokenStore(backend.issue('max.muster'));
      Dio dio() =>
          Dio(BaseOptions(baseUrl: 'http://api.test'))
            ..httpClientAdapter = backend;
      final authApi = AuthApi(ApiClient(dio()));
      final session = AuthSession(
        store: store,
        refresh: authApi.refresh,
        clock: clock,
      );
      final authed = dio();
      authed.interceptors.add(
        AuthInterceptor(session: session, retry: authed.fetch),
      );
      return (
        api: ApiClient(authed),
        session: session,
        store: store,
        backend: backend,
      );
    }

    test('T5 an expired access token is refreshed transparently', () async {
      final w = wire();
      await w.session.restore();
      w.backend.expireAccessTokens();
      final me = await w.api.getJson('/v1/client/me');
      expect(me['firstName'], 'Max');
      expect(w.backend.refreshCalls, 1);
    });

    test(
      'T6 rotation: the new pair is stored, the old refresh token is dead',
      () async {
        final w = wire();
        await w.session.restore();
        final old = w.store.tokens!;
        w.backend.expireAccessTokens();
        await w.api.getJson('/v1/client/me');
        final rotated = w.store.tokens!;
        expect(rotated.refreshToken, isNot(old.refreshToken));
        expect(rotated.accessToken, isNot(old.accessToken));
        expect(w.session.refreshToken, rotated.refreshToken);
        // the app never sends the old token again; the server would reject it
        final reuse = AuthApi(
          ApiClient(
            Dio(BaseOptions(baseUrl: 'http://api.test'))
              ..httpClientAdapter = w.backend,
          ),
        );
        await expectLater(reuse.refresh(old.refreshToken), throwsA(anything));
        expect(w.backend.refreshCalls, 2);
      },
    );

    test('T7 sign-out clears the stored tokens', () async {
      final w = wire();
      await w.session.restore();
      expect(w.store.tokens, isNotNull);
      await w.session.clear();
      expect(w.store.tokens, isNull);
      expect(w.session.isSignedIn, isFalse);
      expect(w.session.accessToken, isNull);
    });
  });

  group('login screen + brand', () {
    testWidgets('T13 German login form: fields, toggle, no registration', (
      tester,
    ) async {
      final h = AppHarness(signedIn: false);
      await h.pump(
        tester,
        width: 320,
        height: 568,
      ); // smallest iPhone (SE 1st gen)
      expect(tester.takeException(), isNull, reason: 'no overflow at 320 pt');
      expect(find.text('WILLKOMMEN BEI VITRUV'), findsOneWidget);
      expect(find.text('TEILNEHMER-LOGIN'), findsOneWidget);
      expect(loginField(), findsOneWidget);
      expect(passwordField(), findsOneWidget);
      expect(
        find.text(
          'Passwort vergessen? Dein Coach richtet dir ein neues Passwort ein.',
        ),
        findsOneWidget,
      );
      for (final word in ['Registrieren', 'Konto erstellen', 'Sign up']) {
        expect(find.textContaining(word), findsNothing);
      }
      // password visibility toggle
      TextField password() =>
          tester.widget<TextField>(find.byType(TextField).at(1));
      expect(password().obscureText, isTrue);
      await tapOn(tester, find.byTooltip('Passwort anzeigen'));
      expect(password().obscureText, isFalse);
      // client-side mirror of authLoginIdSchema (never stricter than the API)
      await tester.enterText(loginField(), 'ab');
      await tester.enterText(passwordField(), 'x');
      await tapOn(tester, find.byType(VitruvButton));
      expect(
        find.text('Bitte E-Mail-Adresse oder Benutzernamen eingeben.'),
        findsOneWidget,
      );
      expect(h.backend.loginBodies, isEmpty);
    });

    testWidgets('T14 the original VITRUV logo + brand theme on the login', (
      tester,
    ) async {
      final h = AppHarness(signedIn: false);
      await h.pump(tester);
      final logo = find.byType(VitruvLogo);
      expect(logo, findsOneWidget);
      final image = tester.widget<Image>(
        find.descendant(of: logo, matching: find.byType(Image)),
      );
      expect(
        (image.image as AssetImage).assetName,
        'assets/brand/vitruv-logo.png',
      );
      // dark theme → inverted like the website (never recoloured otherwise)
      expect(
        find.descendant(of: logo, matching: find.byType(ColorFiltered)),
        findsOneWidget,
      );
      final size = tester.getSize(logo);
      expect(size.width / size.height, closeTo(704 / 400, 0.01));
      expect(find.bySemanticsLabel('VITRUV'), findsWidgets);

      final context = tester.element(logo);
      final theme = Theme.of(context);
      expect(theme.scaffoldBackgroundColor, VitruvColors.dark.bg);
      expect(theme.colorScheme.primary, VitruvColors.dark.accent);
      expect(VitruvTheme.sparkOf(context), VitruvBrandColors.sparkDark);
      final timer = theme.textTheme.displayMedium!;
      expect(timer.fontFamily, VitruvFonts.heading);
      expect(timer.fontFeatures, contains(const FontFeature.tabularFigures()));
    });
  });

  group('T15 nullable e-mail model parsing', () {
    test('currentUserSchema with email: null', () {
      final user = CurrentUser.fromJson(
        const JsonReader({
          'id': 'u-client-2',
          'email': null,
          'displayName': null,
          'role': 'CLIENT',
          'status': 'ACTIVE',
          'permissions': ['self:read'],
        }),
      );
      expect(user.email, isNull);
      expect(user.isClient, isTrue);
    });

    test('clientSelfProfileSchema with email: null (and without the key)', () {
      final withNull = ClientProfile.fromJson(
        const JsonReader({
          'id': 'u-client-2',
          'firstName': 'Max',
          'lastName': 'Muster',
          'email': null,
          'coachingStatus': 'ACTIVE',
          'coach': null,
        }),
      );
      expect(withNull.email, isNull);
      expect(withNull.coachName, isNull);
      final missing = ClientProfile.fromJson(
        const JsonReader({
          'id': 'u-client-2',
          'firstName': 'Max',
          'lastName': 'Muster',
          'coachingStatus': 'ACTIVE',
          'coach': null,
        }),
      );
      expect(missing.email, isNull);
    });

    test('login id rules mirror authLoginIdSchema', () {
      for (final ok in [
        'kunde@example.invalid',
        ' Max.Muster ',
        'abc',
        'a_b-c.9',
      ]) {
        expect(isValidLoginId(ok), isTrue, reason: ok);
      }
      for (final bad in ['', 'ab', '.max', 'max muster', 'a@b', 'x' * 33]) {
        expect(isValidLoginId(bad), isFalse, reason: bad);
      }
    });
  });
}
