import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:vitruv_mobile/shared/ui/ui.dart';

import '../support/app_harness.dart';

void main() {
  Finder submit() => find.byType(VitruvButton);

  testWidgets('without a stored session the app shows only the login', (
    tester,
  ) async {
    final h = AppHarness(signedIn: false);
    await h.pump(tester);
    expect(find.text('ANMELDEN'), findsWidgets);
    expect(find.text('E-Mail-Adresse'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    // password-manager friendly fields
    final fields = tester
        .widgetList<TextField>(find.byType(TextField))
        .toList();
    expect(fields[0].autofillHints, contains(AutofillHints.email));
    expect(fields[1].autofillHints, contains(AutofillHints.password));
    expect(fields[1].obscureText, isTrue);
    expect(find.byType(AutofillGroup), findsOneWidget);
  });

  testWidgets(
    'wrong credentials: one generic error, password cleared, no tokens stored',
    (tester) async {
      final h = AppHarness(signedIn: false);
      await h.pump(tester);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'E-Mail-Adresse'),
        'kunde@example.invalid',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Passwort'),
        'falsch',
      );
      await tapOn(tester, submit());
      expect(
        find.text('E-Mail-Adresse oder Passwort ist nicht korrekt.'),
        findsOneWidget,
      );
      expect(h.store.tokens, isNull);
      final password = tester.widget<TextField>(find.byType(TextField).at(1));
      expect(password.controller!.text, isEmpty);
    },
  );

  testWidgets('validates the form before calling the API', (tester) async {
    final h = AppHarness(signedIn: false);
    await h.pump(tester);
    await tapOn(tester, submit());
    expect(find.text('Bitte ausfüllen.'), findsNWidgets(2));
    expect(h.backend.requests.where((r) => r.contains('/login')), isEmpty);
  });

  testWidgets(
    'a coach account is rejected in the app and its session revoked immediately',
    (tester) async {
      final h = AppHarness(signedIn: false);
      await h.pump(tester);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'E-Mail-Adresse'),
        'coach@example.invalid',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Passwort'),
        'richtig-1234',
      );
      await tapOn(tester, submit());
      expect(
        find.text('Die App ist für Kund:innen. Coaches nutzen den Webzugang.'),
        findsOneWidget,
      );
      expect(h.backend.logoutCalls, 1);
      expect(h.store.tokens, isNull);
    },
  );

  testWidgets('CLIENT login stores the session securely and opens "Heute"', (
    tester,
  ) async {
    final h = AppHarness(signedIn: false);
    await h.pump(tester);
    await tester.enterText(
      find.widgetWithText(TextFormField, 'E-Mail-Adresse'),
      ' kunde@example.invalid ',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Passwort'),
      'richtig-1234',
    );
    await tapOn(tester, submit());
    expect(h.store.tokens, isNotNull);
    expect(h.store.writes, 1);
    expect(find.text('HALLO ERIKA'), findsOneWidget);
    expect(find.text('Dein Coach: Coach Alex'), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('a stored session is restored at start (no login)', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(tester);
    expect(find.text('HALLO ERIKA'), findsOneWidget);
    expect(h.backend.requests, contains('GET /v1/auth/me'));
  });

  testWidgets(
    'logout: revoke on the server, clear local credentials, back to login',
    (tester) async {
      final h = AppHarness();
      await h.pump(tester);
      await tapOn(tester, find.byIcon(Icons.person_outline));
      await tapOn(tester, find.text('ABMELDEN'));
      await tapOn(tester, find.widgetWithText(FilledButton, 'Abmelden'));
      expect(h.backend.logoutCalls, 1);
      expect(h.store.tokens, isNull);
      expect(find.text('E-Mail-Adresse'), findsOneWidget);
    },
  );

  testWidgets('logout offline still clears the local credentials', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(tester);
    await tapOn(tester, find.byIcon(Icons.person_outline));
    h.backend.offline = true;
    await tapOn(tester, find.text('ABMELDEN'));
    await tapOn(tester, find.widgetWithText(FilledButton, 'Abmelden'));
    expect(h.store.tokens, isNull);
    expect(h.store.clears, greaterThanOrEqualTo(1));
    expect(find.text('E-Mail-Adresse'), findsOneWidget);
  });

  testWidgets(
    'offline at start with a stored session: keeps it and offers retry',
    (tester) async {
      final h = AppHarness();
      h.backend.offline = true;
      await h.pump(tester);
      expect(
        find.text('Deine Anmeldung konnte gerade nicht geprüft werden.'),
        findsOneWidget,
      );
      expect(h.store.tokens, isNotNull);
      h.backend.offline = false;
      await tapOn(tester, find.text('ERNEUT VERSUCHEN'));
      expect(find.text('HALLO ERIKA'), findsOneWidget);
    },
  );

  testWidgets(
    'an expired session (refresh rejected) returns to login with a notice',
    (tester) async {
      final h = AppHarness();
      h.backend
        ..expireAccessTokens()
        ..rejectRefresh = true;
      await h.pump(tester);
      expect(
        find.text('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.'),
        findsOneWidget,
      );
      expect(h.store.tokens, isNull);
    },
  );
}
