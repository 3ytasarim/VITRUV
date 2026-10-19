import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/ui/ui.dart';

/// CLIENT login (shared Sprint 4 auth: `POST /v1/auth/login`, clientType MOBILE).
/// Password-manager friendly (AutofillGroup + hints), one generic error for wrong credentials.
/// There is no password reset by e-mail yet — the screen says so instead of offering a dead link.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  LoginError? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    setState(() => _error = null);
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    final error = await ref
        .read(authControllerProvider.notifier)
        .login(_email.text, _password.text);
    if (!mounted) return;
    if (error == null) {
      TextInput.finishAutofillContext();
      return; // the router leaves the login screen
    }
    _password.clear();
    setState(() {
      _busy = false;
      _error = error;
    });
  }

  String _message(AppLocalizations l10n, LoginError error) => switch (error) {
    LoginError.invalidCredentials => l10n.loginErrorInvalid,
    LoginError.rateLimited => l10n.loginErrorRateLimited,
    LoginError.notClient => l10n.loginErrorNotClient,
    LoginError.network => l10n.errorNetwork,
    LoginError.unknown => l10n.loginErrorUnknown,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final auth = ref.watch(authControllerProvider);
    final notice = switch (auth) {
      SignedOut(reason: SignedOutReason.sessionExpired) => l10n.sessionExpired,
      SignedOut(reason: SignedOutReason.notClient) => l10n.loginErrorNotClient,
      _ => null,
    };
    final error = _error == null ? notice : _message(l10n, _error!);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(VitruvSpace.s6),
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                maxWidth: VitruvLayout.measureNarrow,
              ),
              child: Form(
                key: _form,
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SectionIntro(
                        eyebrow: l10n.appTitle,
                        title: l10n.loginTitle,
                        lead: l10n.loginIntro,
                      ),
                      const SizedBox(height: VitruvSpace.s6),
                      Semantics(
                        liveRegion: true,
                        child: error == null
                            ? const SizedBox.shrink()
                            : Padding(
                                padding: const EdgeInsets.only(
                                  bottom: VitruvSpace.s4,
                                ),
                                child: VitruvCard(
                                  tone: VitruvCardTone.outline,
                                  padding: VitruvCardPadding.sm,
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Icon(Icons.error_outline, color: c.error),
                                      const SizedBox(width: VitruvSpace.s3),
                                      Expanded(child: Text(error)),
                                    ],
                                  ),
                                ),
                              ),
                      ),
                      TextFormField(
                        controller: _email,
                        enabled: !_busy,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autocorrect: false,
                        enableSuggestions: false,
                        autofillHints: const [
                          AutofillHints.email,
                          AutofillHints.username,
                        ],
                        decoration: InputDecoration(labelText: l10n.loginEmail),
                        validator: (value) {
                          final v = value?.trim() ?? '';
                          if (v.isEmpty) return l10n.loginFieldRequired;
                          if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                              .hasMatch(v)) {
                            return l10n.loginEmailInvalid;
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: VitruvSpace.s4),
                      TextFormField(
                        controller: _password,
                        enabled: !_busy,
                        obscureText: _obscure,
                        autocorrect: false,
                        enableSuggestions: false,
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.password],
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          labelText: l10n.loginPassword,
                          suffixIcon: IconButton(
                            tooltip: _obscure
                                ? l10n.loginShowPassword
                                : l10n.loginHidePassword,
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                          ),
                        ),
                        validator: (value) => (value ?? '').isEmpty
                            ? l10n.loginFieldRequired
                            : null,
                      ),
                      const SizedBox(height: VitruvSpace.s6),
                      VitruvButton(
                        label: l10n.loginSubmit,
                        busyLabel: l10n.loginBusy,
                        loading: _busy,
                        fullWidth: true,
                        size: VitruvButtonSize.lg,
                        onPressed: _submit,
                      ),
                      const SizedBox(height: VitruvSpace.s4),
                      Text(
                        l10n.loginForgotHint,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: c.fgMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Shown while a stored session is restored — or, offline, with a retry.
class StartScreen extends ConsumerWidget {
  const StartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(VitruvSpace.s6),
            child: auth is AuthUnavailable
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        l10n.startupUnavailable,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: VitruvSpace.s2),
                      Text(l10n.errorNetwork, textAlign: TextAlign.center),
                      const SizedBox(height: VitruvSpace.s6),
                      VitruvButton(
                        label: l10n.retry,
                        onPressed: () =>
                            ref.read(authControllerProvider.notifier).restore(),
                      ),
                      const SizedBox(height: VitruvSpace.s2),
                      VitruvButton(
                        label: l10n.signOut,
                        variant: VitruvButtonVariant.ghost,
                        onPressed: () =>
                            ref.read(authControllerProvider.notifier).logout(),
                      ),
                    ],
                  )
                : Semantics(
                    label: l10n.loading,
                    liveRegion: true,
                    child: const CircularProgressIndicator(),
                  ),
          ),
        ),
      ),
    );
  }
}
