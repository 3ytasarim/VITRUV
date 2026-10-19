// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'VITRUV';

  @override
  String get navToday => 'Today';

  @override
  String get navTraining => 'Training';

  @override
  String get navNutrition => 'Nutrition';

  @override
  String get navProgress => 'Progress';

  @override
  String get navProfile => 'Profile';

  @override
  String get todayGreeting => 'Welcome to VITRUV';

  @override
  String get placeholderComingSoon =>
      'This section arrives in an upcoming sprint.';

  @override
  String get systemStatus => 'System status';

  @override
  String get apiReachable => 'Connected';

  @override
  String get apiUnreachable => 'Server unreachable';

  @override
  String get retry => 'Try again';

  @override
  String get loading => 'Loading …';

  @override
  String get errorNetwork =>
      'No connection. Please check your internet connection.';

  @override
  String get errorServer => 'The server reported an error.';

  @override
  String get errorUnknown => 'Something went wrong.';

  @override
  String get cancel => 'Cancel';

  @override
  String get loginTitle => 'Sign in';

  @override
  String get loginIntro =>
      'Sign in with the e-mail address and the password you set via your activation link.';

  @override
  String get loginEmail => 'E-mail address';

  @override
  String get loginPassword => 'Password';

  @override
  String get loginShowPassword => 'Show password';

  @override
  String get loginHidePassword => 'Hide password';

  @override
  String get loginSubmit => 'Sign in';

  @override
  String get loginBusy => 'Signing in';

  @override
  String get loginFieldRequired => 'Please fill in.';

  @override
  String get loginEmailInvalid => 'Please enter a valid e-mail address.';

  @override
  String get loginErrorInvalid => 'E-mail address or password is incorrect.';

  @override
  String get loginErrorRateLimited =>
      'Too many attempts. Please wait a few minutes and try again.';

  @override
  String get loginErrorNotClient =>
      'The app is for clients. Coaches use the web access.';

  @override
  String get loginErrorUnknown => 'Sign-in failed. Please try again later.';

  @override
  String get loginForgotHint =>
      'Forgot your password? Please contact your coach.';

  @override
  String get sessionExpired =>
      'Your session has expired. Please sign in again.';

  @override
  String get startupUnavailable =>
      'Your sign-in could not be checked right now.';

  @override
  String get signOut => 'Sign out';

  @override
  String get signOutConfirmTitle => 'Sign out?';

  @override
  String get signOutConfirmBody =>
      'You can sign in again at any time. Running workouts stay saved.';

  @override
  String homeGreeting(String name) {
    return 'Hello $name';
  }

  @override
  String homeCoach(String name) {
    return 'Your coach: $name';
  }

  @override
  String get coachingActive => 'Coaching active';

  @override
  String get coachingPaused => 'Coaching paused';

  @override
  String get coachingCompleted => 'Coaching completed';

  @override
  String get homeWorkoutRunning => 'Workout in progress';

  @override
  String homeWorkoutRunningBody(String day, int done, int total) {
    return '$day · $done of $total exercises';
  }

  @override
  String get continueWorkout => 'Continue workout';

  @override
  String get homePlanTitle => 'Your training plan';

  @override
  String get homeScheduledToday => 'Planned for today';

  @override
  String get homeThisWeek => 'This week';

  @override
  String get homeOpenPlan => 'Open training plan';

  @override
  String get homeNoPlan => 'No training plan yet';

  @override
  String get homeNoPlanBody =>
      'As soon as your coach releases your plan, it appears here.';

  @override
  String weekCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count weeks',
      one: '1 week',
    );
    return '$_temp0';
  }

  @override
  String trainingDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count training days',
      one: '1 training day',
    );
    return '$_temp0';
  }

  @override
  String get trainingEmptyTitle => 'No active training plan yet';

  @override
  String get trainingEmptyBody =>
      'Your coach is preparing your plan. Once it is active, you will find it here.';

  @override
  String weekLabel(int number) {
    return 'Week $number';
  }

  @override
  String dayLabel(int number) {
    return 'Day $number';
  }

  @override
  String get currentWeek => 'Current week';

  @override
  String exerciseCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count exercises',
      one: '1 exercise',
      zero: 'No exercises',
    );
    return '$_temp0';
  }

  @override
  String get workoutRunningBadge => 'Running';

  @override
  String get sectionWarmup => 'Warm-up';

  @override
  String get sectionMain => 'Main part';

  @override
  String get sectionFinisher => 'Finisher';

  @override
  String weekday(String day) {
    String _temp0 = intl.Intl.selectLogic(day, {
      '1': 'Monday',
      '2': 'Tuesday',
      '3': 'Wednesday',
      '4': 'Thursday',
      '5': 'Friday',
      '6': 'Saturday',
      '7': 'Sunday',
      'other': '',
    });
    return '$_temp0';
  }

  @override
  String get startWorkout => 'Start workout';

  @override
  String get otherWorkoutRunning => 'Another workout is still running';

  @override
  String get otherWorkoutRunningBody =>
      'Finish or cancel it before you start a new one.';

  @override
  String get openRunningWorkout => 'Open running workout';

  @override
  String get dayNotFound => 'This training day is no longer part of your plan.';

  @override
  String get dayNoExercises => 'No exercises have been added to this day yet.';

  @override
  String get instructionsLabel => 'Instructions';

  @override
  String playVideo(String name) {
    return 'Play video: $name';
  }

  @override
  String get pauseVideo => 'Pause video';

  @override
  String get mediaUnavailable => 'Media unavailable';

  @override
  String get mediaPlaceholder => 'No media';

  @override
  String rxSetsReps(int sets, int reps) {
    return '$sets × $reps';
  }

  @override
  String rxSetsDuration(int sets, String duration) {
    return '$sets × $duration';
  }

  @override
  String rxSets(int sets) {
    String _temp0 = intl.Intl.pluralLogic(
      sets,
      locale: localeName,
      other: '$sets sets',
      one: '1 set',
    );
    return '$_temp0';
  }

  @override
  String rxReps(int reps) {
    return '$reps reps';
  }

  @override
  String rxTotalReps(int reps) {
    return '$reps reps total';
  }

  @override
  String rxSeconds(int seconds) {
    return '$seconds sec';
  }

  @override
  String rxMinutes(String clock) {
    return '$clock min';
  }

  @override
  String rxWeight(String value) {
    return '$value kg';
  }

  @override
  String rxRest(String clock) {
    return 'Rest $clock';
  }

  @override
  String workoutPosition(int current, int total) {
    return '$current / $total';
  }

  @override
  String workoutPositionLabel(int current, int total) {
    return 'Exercise $current of $total';
  }

  @override
  String get workoutProgressLabel => 'Progress';

  @override
  String workoutProgressValue(int done, int total) {
    return '$done of $total exercises done';
  }

  @override
  String setLabel(int number) {
    return 'Set $number';
  }

  @override
  String setCompleteAction(int number) {
    return 'Complete set $number';
  }

  @override
  String setReopenAction(int number) {
    return 'Reopen set $number';
  }

  @override
  String get setDoneState => 'done';

  @override
  String get completeExercise => 'Complete exercise';

  @override
  String get skipExercise => 'Skip';

  @override
  String get reopenExercise => 'Reopen';

  @override
  String get exerciseDone => 'Done';

  @override
  String get exerciseSkipped => 'Skipped';

  @override
  String get actualRepsLabel => 'Reps achieved';

  @override
  String get startTimer => 'Start timer';

  @override
  String get stopTimer => 'Stop timer';

  @override
  String get timerReached => 'Time reached';

  @override
  String get previousExercise => 'Previous exercise';

  @override
  String get nextExercise => 'Next exercise';

  @override
  String get finishWorkout => 'Finish workout';

  @override
  String get finishConfirmTitle => 'Finish workout?';

  @override
  String finishConfirmOpen(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count exercises are still open and will be saved as not done.',
      one: '1 exercise is still open and will be saved as not done.',
    );
    return '$_temp0';
  }

  @override
  String get abandonWorkout => 'Cancel workout';

  @override
  String get abandonConfirmTitle => 'Cancel workout?';

  @override
  String get abandonConfirmBody =>
      'The workout is saved as cancelled. Recorded sets are kept.';

  @override
  String get keepTraining => 'Keep training';

  @override
  String get workoutLeftHint =>
      'Your workout keeps running – continue whenever you like.';

  @override
  String get saveFailed => 'Not saved. Please try again.';

  @override
  String get noWorkoutRunning => 'No workout is running.';

  @override
  String get backToTraining => 'To the training plan';

  @override
  String get moreActions => 'More actions';

  @override
  String get restTitle => 'Rest';

  @override
  String get restSkip => 'Skip rest';

  @override
  String get restAdd => '+30 sec';

  @override
  String get restAddSemantics => 'Add 30 seconds of rest';

  @override
  String get restPause => 'Pause';

  @override
  String get restResume => 'Resume';

  @override
  String get restFinished => 'Rest finished';

  @override
  String restStarted(String clock) {
    return 'Rest $clock started';
  }

  @override
  String restRemainingSemantics(String clock) {
    return 'Rest, $clock left';
  }

  @override
  String get restStart => 'Start rest';

  @override
  String get restContinue => 'Continue';

  @override
  String get completedTitle => 'Workout completed';

  @override
  String get abandonedTitle => 'Workout cancelled';

  @override
  String completedExercises(int done, int total) {
    return '$done of $total exercises';
  }

  @override
  String completedDuration(String duration) {
    return 'Duration $duration';
  }

  @override
  String completedSkipped(int count) {
    return '$count skipped';
  }

  @override
  String completedOpen(int count) {
    return '$count not done';
  }

  @override
  String get toOverview => 'To the overview';

  @override
  String get durationUnderMinute => 'under 1 min';

  @override
  String durationMinutes(int minutes) {
    return '$minutes min';
  }

  @override
  String durationHours(int hours, int minutes) {
    return '$hours h $minutes min';
  }

  @override
  String get historyTitle => 'Workout history';

  @override
  String get historyEmpty => 'No workouts yet';

  @override
  String get historyEmptyBody =>
      'After your first workout you will see your history here.';

  @override
  String get statusCompleted => 'Completed';

  @override
  String get statusAbandoned => 'Cancelled';

  @override
  String get statusInProgress => 'In progress';

  @override
  String get profileEmail => 'E-mail';

  @override
  String get profileCoach => 'Coach';

  @override
  String get profileNoCoach => 'No coach assigned yet';

  @override
  String get profileCoaching => 'Coaching';
}
