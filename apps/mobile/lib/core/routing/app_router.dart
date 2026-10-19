import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/auth_state.dart';
import '../../features/auth/login_screen.dart';
import '../../features/design_gallery/design_gallery_access.dart';
import '../../features/design_gallery/design_gallery_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/nutrition/nutrition_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/progress/progress_screen.dart';
import '../../features/training/training_day_screen.dart';
import '../../features/training/training_screen.dart';
import '../../features/workout/workout_complete_screen.dart';
import '../../features/workout/workout_screen.dart';
import '../../shared/shell/app_shell.dart';
import 'app_routes.dart';

export 'app_routes.dart';

/// Gating (redirect) by [authControllerProvider]:
/// - restoring / offline-unverified → /start
/// - signed out → /login (nothing else is reachable)
/// - signed in (CLIENT only — the controller rejects other roles) → the five client tabs and the
///   workout screens. There are no admin routes in the app at all.
final appRouterProvider = Provider<GoRouter>((ref) {
  final authChanges = ValueNotifier<AuthState>(
    ref.read(authControllerProvider),
  );
  ref.listen(
    authControllerProvider,
    (previous, next) => authChanges.value = next,
  );

  final router = GoRouter(
    initialLocation: AppRoutes.today,
    refreshListenable: authChanges,
    redirect: (context, state) {
      final auth = authChanges.value;
      final at = state.matchedLocation;
      // Development-only gallery: shows no account data, reachable without a session.
      if (at == AppRoutes.designGallery) return null;
      return switch (auth) {
        AuthRestoring() ||
        AuthUnavailable() => at == AppRoutes.start ? null : AppRoutes.start,
        SignedOut() => at == AppRoutes.login ? null : AppRoutes.login,
        SignedIn() =>
          at == AppRoutes.login || at == AppRoutes.start
              ? AppRoutes.today
              : null,
      };
    },
    routes: [
      GoRoute(
        path: AppRoutes.start,
        builder: (context, state) => const StartScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(navigationShell: shell),
        branches: [
          _branch(AppRoutes.today, const HomeScreen()),
          _branch(
            AppRoutes.training,
            const TrainingScreen(),
            routes: [
              GoRoute(
                path: 'tag/:dayId',
                builder: (context, state) =>
                    TrainingDayScreen(dayId: state.pathParameters['dayId']!),
              ),
            ],
          ),
          _branch(AppRoutes.nutrition, const NutritionScreen()),
          _branch(AppRoutes.progress, const ProgressScreen()),
          _branch(AppRoutes.profile, const ProfileScreen()),
        ],
      ),
      GoRoute(
        path: AppRoutes.workout,
        builder: (context, state) => const WorkoutScreen(),
        routes: [
          GoRoute(
            path: 'abgeschlossen',
            builder: (context, state) => const WorkoutCompleteScreen(),
          ),
        ],
      ),
      // Outside the shell and the bottom navigation; not registered in release builds.
      if (ref.watch(designGalleryEnabledProvider))
        GoRoute(
          path: AppRoutes.designGallery,
          builder: (context, state) => const DesignGalleryScreen(),
        ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    authChanges.dispose();
  });
  return router;
});

StatefulShellBranch _branch(
  String path,
  Widget screen, {
  List<RouteBase> routes = const [],
}) => StatefulShellBranch(
  routes: [
    GoRoute(path: path, builder: (context, state) => screen, routes: routes),
  ],
);
