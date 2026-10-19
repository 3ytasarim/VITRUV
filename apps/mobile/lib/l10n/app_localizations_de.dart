// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appTitle => 'VITRUV';

  @override
  String get navToday => 'Heute';

  @override
  String get navTraining => 'Training';

  @override
  String get navNutrition => 'Ernährung';

  @override
  String get navProgress => 'Fortschritt';

  @override
  String get navProfile => 'Profil';

  @override
  String get todayGreeting => 'Willkommen bei VITRUV';

  @override
  String get placeholderComingSoon =>
      'Dieser Bereich folgt in einem der nächsten Sprints.';

  @override
  String get systemStatus => 'Systemstatus';

  @override
  String get apiReachable => 'Verbunden';

  @override
  String get apiUnreachable => 'Server nicht erreichbar';

  @override
  String get retry => 'Erneut versuchen';

  @override
  String get loading => 'Wird geladen …';

  @override
  String get errorNetwork =>
      'Keine Verbindung. Bitte prüfe deine Internetverbindung.';

  @override
  String get errorServer => 'Der Server hat einen Fehler gemeldet.';

  @override
  String get errorUnknown => 'Etwas ist schiefgelaufen.';

  @override
  String get cancel => 'Abbrechen';

  @override
  String get loginTitle => 'Anmelden';

  @override
  String get loginIntro =>
      'Melde dich mit der E-Mail-Adresse und dem Passwort an, das du über deinen Aktivierungslink festgelegt hast.';

  @override
  String get loginEmail => 'E-Mail-Adresse';

  @override
  String get loginPassword => 'Passwort';

  @override
  String get loginShowPassword => 'Passwort anzeigen';

  @override
  String get loginHidePassword => 'Passwort verbergen';

  @override
  String get loginSubmit => 'Anmelden';

  @override
  String get loginBusy => 'Anmeldung läuft';

  @override
  String get loginFieldRequired => 'Bitte ausfüllen.';

  @override
  String get loginEmailInvalid => 'Bitte eine gültige E-Mail-Adresse eingeben.';

  @override
  String get loginErrorInvalid =>
      'E-Mail-Adresse oder Passwort ist nicht korrekt.';

  @override
  String get loginErrorRateLimited =>
      'Zu viele Versuche. Bitte warte einige Minuten und versuche es dann erneut.';

  @override
  String get loginErrorNotClient =>
      'Die App ist für Kund:innen. Coaches nutzen den Webzugang.';

  @override
  String get loginErrorUnknown =>
      'Die Anmeldung ist fehlgeschlagen. Bitte versuche es später erneut.';

  @override
  String get loginForgotHint =>
      'Passwort vergessen? Wende dich an deinen Coach.';

  @override
  String get sessionExpired =>
      'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';

  @override
  String get startupUnavailable =>
      'Deine Anmeldung konnte gerade nicht geprüft werden.';

  @override
  String get signOut => 'Abmelden';

  @override
  String get signOutConfirmTitle => 'Abmelden?';

  @override
  String get signOutConfirmBody =>
      'Du kannst dich jederzeit wieder anmelden. Laufende Trainings bleiben gespeichert.';

  @override
  String homeGreeting(String name) {
    return 'Hallo $name';
  }

  @override
  String homeCoach(String name) {
    return 'Dein Coach: $name';
  }

  @override
  String get coachingActive => 'Coaching aktiv';

  @override
  String get coachingPaused => 'Coaching pausiert';

  @override
  String get coachingCompleted => 'Coaching abgeschlossen';

  @override
  String get homeWorkoutRunning => 'Training läuft';

  @override
  String homeWorkoutRunningBody(String day, int done, int total) {
    return '$day · $done von $total Übungen';
  }

  @override
  String get continueWorkout => 'Training fortsetzen';

  @override
  String get homePlanTitle => 'Dein Trainingsplan';

  @override
  String get homeScheduledToday => 'Heute geplant';

  @override
  String get homeThisWeek => 'Diese Woche';

  @override
  String get homeOpenPlan => 'Zum Trainingsplan';

  @override
  String get homeNoPlan => 'Noch kein Trainingsplan';

  @override
  String get homeNoPlanBody =>
      'Sobald dein Coach deinen Plan freigibt, erscheint er hier.';

  @override
  String weekCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Wochen',
      one: '1 Woche',
    );
    return '$_temp0';
  }

  @override
  String trainingDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Trainingstage',
      one: '1 Trainingstag',
    );
    return '$_temp0';
  }

  @override
  String get trainingEmptyTitle => 'Noch kein aktiver Trainingsplan';

  @override
  String get trainingEmptyBody =>
      'Dein Coach erstellt deinen Plan. Sobald er aktiv ist, findest du ihn hier.';

  @override
  String weekLabel(int number) {
    return 'Woche $number';
  }

  @override
  String dayLabel(int number) {
    return 'Tag $number';
  }

  @override
  String get currentWeek => 'Aktuelle Woche';

  @override
  String exerciseCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Übungen',
      one: '1 Übung',
      zero: 'Keine Übungen',
    );
    return '$_temp0';
  }

  @override
  String get workoutRunningBadge => 'Läuft';

  @override
  String get sectionWarmup => 'Warm-up';

  @override
  String get sectionMain => 'Hauptteil';

  @override
  String get sectionFinisher => 'Abschluss';

  @override
  String weekday(String day) {
    String _temp0 = intl.Intl.selectLogic(day, {
      '1': 'Montag',
      '2': 'Dienstag',
      '3': 'Mittwoch',
      '4': 'Donnerstag',
      '5': 'Freitag',
      '6': 'Samstag',
      '7': 'Sonntag',
      'other': '',
    });
    return '$_temp0';
  }

  @override
  String get startWorkout => 'Training starten';

  @override
  String get otherWorkoutRunning => 'Ein anderes Training läuft noch';

  @override
  String get otherWorkoutRunningBody =>
      'Schließe es ab oder brich es ab, bevor du ein neues startest.';

  @override
  String get openRunningWorkout => 'Laufendes Training öffnen';

  @override
  String get dayNotFound =>
      'Dieser Trainingstag ist nicht mehr Teil deines Plans.';

  @override
  String get dayNoExercises =>
      'Für diesen Tag sind noch keine Übungen hinterlegt.';

  @override
  String get instructionsLabel => 'Anleitung';

  @override
  String playVideo(String name) {
    return 'Video abspielen: $name';
  }

  @override
  String get pauseVideo => 'Video pausieren';

  @override
  String get mediaUnavailable => 'Medium nicht verfügbar';

  @override
  String get mediaPlaceholder => 'Kein Medium';

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
      other: '$sets Sätze',
      one: '1 Satz',
    );
    return '$_temp0';
  }

  @override
  String rxReps(int reps) {
    return '$reps Wdh.';
  }

  @override
  String rxTotalReps(int reps) {
    return '$reps Wdh. gesamt';
  }

  @override
  String rxSeconds(int seconds) {
    return '$seconds Sek.';
  }

  @override
  String rxMinutes(String clock) {
    return '$clock Min.';
  }

  @override
  String rxWeight(String value) {
    return '$value kg';
  }

  @override
  String rxRest(String clock) {
    return 'Pause $clock';
  }

  @override
  String workoutPosition(int current, int total) {
    return '$current / $total';
  }

  @override
  String workoutPositionLabel(int current, int total) {
    return 'Übung $current von $total';
  }

  @override
  String get workoutProgressLabel => 'Fortschritt';

  @override
  String workoutProgressValue(int done, int total) {
    return '$done von $total Übungen erledigt';
  }

  @override
  String setLabel(int number) {
    return 'Satz $number';
  }

  @override
  String setCompleteAction(int number) {
    return 'Satz $number abschließen';
  }

  @override
  String setReopenAction(int number) {
    return 'Satz $number wieder öffnen';
  }

  @override
  String get setDoneState => 'erledigt';

  @override
  String get completeExercise => 'Übung abschließen';

  @override
  String get skipExercise => 'Überspringen';

  @override
  String get reopenExercise => 'Wieder öffnen';

  @override
  String get exerciseDone => 'Erledigt';

  @override
  String get exerciseSkipped => 'Übersprungen';

  @override
  String get actualRepsLabel => 'Geschaffte Wiederholungen';

  @override
  String get startTimer => 'Timer starten';

  @override
  String get stopTimer => 'Timer stoppen';

  @override
  String get timerReached => 'Zeit erreicht';

  @override
  String get previousExercise => 'Vorherige Übung';

  @override
  String get nextExercise => 'Nächste Übung';

  @override
  String get finishWorkout => 'Training abschließen';

  @override
  String get finishConfirmTitle => 'Training abschließen?';

  @override
  String finishConfirmOpen(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count Übungen sind noch offen und werden als nicht erledigt gespeichert.',
      one: '1 Übung ist noch offen und wird als nicht erledigt gespeichert.',
    );
    return '$_temp0';
  }

  @override
  String get abandonWorkout => 'Training abbrechen';

  @override
  String get abandonConfirmTitle => 'Training abbrechen?';

  @override
  String get abandonConfirmBody =>
      'Das Training wird als abgebrochen gespeichert. Bereits erfasste Sätze bleiben erhalten.';

  @override
  String get keepTraining => 'Weiter trainieren';

  @override
  String get workoutLeftHint =>
      'Dein Training läuft weiter – du kannst es jederzeit fortsetzen.';

  @override
  String get saveFailed => 'Nicht gespeichert. Bitte erneut versuchen.';

  @override
  String get noWorkoutRunning => 'Gerade läuft kein Training.';

  @override
  String get backToTraining => 'Zum Trainingsplan';

  @override
  String get moreActions => 'Weitere Aktionen';

  @override
  String get restTitle => 'Pause';

  @override
  String get restSkip => 'Pause überspringen';

  @override
  String get restAdd => '+30 Sek.';

  @override
  String get restAddSemantics => '30 Sekunden Pause hinzufügen';

  @override
  String get restPause => 'Anhalten';

  @override
  String get restResume => 'Fortsetzen';

  @override
  String get restFinished => 'Pause beendet';

  @override
  String restStarted(String clock) {
    return 'Pause $clock gestartet';
  }

  @override
  String restRemainingSemantics(String clock) {
    return 'Pause, noch $clock';
  }

  @override
  String get restStart => 'Pause starten';

  @override
  String get restContinue => 'Weiter';

  @override
  String get completedTitle => 'Training abgeschlossen';

  @override
  String get abandonedTitle => 'Training abgebrochen';

  @override
  String completedExercises(int done, int total) {
    return '$done von $total Übungen';
  }

  @override
  String completedDuration(String duration) {
    return 'Dauer $duration';
  }

  @override
  String completedSkipped(int count) {
    return '$count übersprungen';
  }

  @override
  String completedOpen(int count) {
    return '$count nicht erledigt';
  }

  @override
  String get toOverview => 'Zur Übersicht';

  @override
  String get durationUnderMinute => 'unter 1 Min.';

  @override
  String durationMinutes(int minutes) {
    return '$minutes Min.';
  }

  @override
  String durationHours(int hours, int minutes) {
    return '$hours Std. $minutes Min.';
  }

  @override
  String get historyTitle => 'Trainingsverlauf';

  @override
  String get historyEmpty => 'Noch keine Trainings';

  @override
  String get historyEmptyBody =>
      'Nach deinem ersten Training siehst du hier deinen Verlauf.';

  @override
  String get statusCompleted => 'Abgeschlossen';

  @override
  String get statusAbandoned => 'Abgebrochen';

  @override
  String get statusInProgress => 'Läuft';

  @override
  String get profileEmail => 'E-Mail';

  @override
  String get profileCoach => 'Coach';

  @override
  String get profileNoCoach => 'Noch kein Coach zugewiesen';

  @override
  String get profileCoaching => 'Coaching';
}
