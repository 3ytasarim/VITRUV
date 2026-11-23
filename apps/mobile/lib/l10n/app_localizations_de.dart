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
  String get loginEyebrow => 'Teilnehmer-Login';

  @override
  String get loginTitle => 'Willkommen bei VITRUV';

  @override
  String get loginIntro =>
      'Melde dich mit deinem VITRUV-Zugang an – mit Benutzername oder E-Mail und Passwort, genau wie auf der Website.';

  @override
  String get loginId => 'Benutzername oder E-Mail';

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
  String get loginIdInvalid =>
      'Bitte E-Mail-Adresse oder Benutzernamen eingeben.';

  @override
  String get loginErrorInvalid =>
      'Benutzername, E-Mail oder Passwort ist nicht korrekt.';

  @override
  String get loginErrorRateLimited =>
      'Zu viele Versuche. Bitte warte einige Minuten und versuche es dann erneut.';

  @override
  String get loginErrorNotClient =>
      'Diese App ist nur für Teilnehmer verfügbar. Coaches nutzen den Webzugang.';

  @override
  String get loginErrorUnknown =>
      'Die Anmeldung ist fehlgeschlagen. Bitte versuche es später erneut.';

  @override
  String get loginForgotHint =>
      'Passwort vergessen? Dein Coach richtet dir ein neues Passwort ein.';

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

  @override
  String get homeCurrentWeek => 'Aktuelle Trainingswoche';

  @override
  String get homeNextTraining => 'Nächstes Training';

  @override
  String get homeNoNextTraining => 'Kein weiteres Training geplant';

  @override
  String get homeNoNextTrainingBody =>
      'Sobald dein Coach ein neues Workout plant, erscheint es hier.';

  @override
  String get openWorkout => 'Workout öffnen';

  @override
  String get trainingOverview => 'Trainingsübersicht';

  @override
  String get trainingOverviewBody =>
      'Alle Workouts deines aktiven Trainingsplans.';

  @override
  String get showAllWorkouts => 'Alle Workouts ansehen';

  @override
  String get showHistory => 'Trainingsverlauf ansehen';

  @override
  String get previousWeek => 'Vorherige Woche';

  @override
  String get nextWeek => 'Nächste Woche';

  @override
  String get backToThisWeek => 'Zur aktuellen Woche';

  @override
  String weekRange(String start, String end) {
    return '$start – $end';
  }

  @override
  String get noTrainingPlanned => 'Kein Training geplant';

  @override
  String get weekOutsidePlan => 'In dieser Woche ist kein Training geplant.';

  @override
  String get planWithoutDates =>
      'Dein Plan hat noch keine festen Termine. Alle Workouts findest du in der Trainingsübersicht.';

  @override
  String get statPlanned => 'Geplant';

  @override
  String get statCompleted => 'Abgeschlossen';

  @override
  String get statOpen => 'Offen';

  @override
  String get statInProgress => 'In Bearbeitung';

  @override
  String weekStatsLabel(int planned, int completed, int inProgress, int open) {
    return 'Diese Woche: $planned geplant, $completed abgeschlossen, $inProgress in Bearbeitung, $open offen';
  }

  @override
  String get dayStatusNotStarted => 'Nicht begonnen';

  @override
  String get dayStatusInProgress => 'In Bearbeitung';

  @override
  String get dayStatusCompleted => 'Abgeschlossen';

  @override
  String get workoutTypeStrength => 'Kraft';

  @override
  String get workoutTypeTotalReps => 'Wiederholungsziel';

  @override
  String get workoutTypeInterval => 'Core-Intervalle';

  @override
  String get workoutTypeChecklist => 'Warm-up';

  @override
  String get workoutTypeGeneral => 'Training';

  @override
  String plannedOn(String date) {
    return 'Geplant am $date';
  }

  @override
  String get noFixedDate => 'Ohne festen Termin';

  @override
  String get todayLabel => 'Heute';

  @override
  String get workoutAlreadyCompleted =>
      'Dieses Training hast du bereits abgeschlossen.';

  @override
  String get warmupTitle => 'Aufwärmen';

  @override
  String get warmupHint =>
      'Keine Wiederholungen, kein Timer: Hake jede Übung ab, sobald du sie gemacht hast.';

  @override
  String warmupProgress(int done, int total) {
    return '$done von $total erledigt';
  }

  @override
  String get warmupDone => 'Aufwärmen abgeschlossen';

  @override
  String warmupCheck(String name) {
    return '$name abhaken';
  }

  @override
  String warmupChecked(String name) {
    return '$name, erledigt';
  }

  @override
  String get warmupSaving => 'Wird gespeichert …';

  @override
  String get watchVideo => 'Video ansehen';

  @override
  String get showImage => 'Bild ansehen';

  @override
  String get videoBadge => 'Video';

  @override
  String get videoUnsupported =>
      'Dieses Video kann auf diesem Gerät nicht abgespielt werden.';

  @override
  String get closeLabel => 'Schließen';

  @override
  String get checklistItemLabel => 'Zum Abhaken';

  @override
  String rxSetsMax(int sets) {
    return '$sets × MAX';
  }

  @override
  String get rxMax => 'MAX';

  @override
  String setRepsFor(int number) {
    return 'Wiederholungen in Satz $number';
  }

  @override
  String get setRepsRequired => 'Bitte trage deine Wiederholungen ein.';

  @override
  String get repsDecrease => 'Eine Wiederholung weniger';

  @override
  String get repsIncrease => 'Eine Wiederholung mehr';

  @override
  String setActualReps(int reps) {
    return '$reps Wdh. geschafft';
  }

  @override
  String restStartFor(String clock) {
    return 'Pause starten · $clock';
  }

  @override
  String get restNotificationTitle => 'Pause vorbei';

  @override
  String restNotificationBody(String exercise) {
    return 'Weiter mit $exercise.';
  }

  @override
  String get restNotificationBodyGeneric =>
      'Weiter geht’s mit dem nächsten Satz.';

  @override
  String get historyOpen => 'Einheit ansehen';

  @override
  String get historyDetailTitle => 'Einheit';

  @override
  String historySetResult(int number, int actual, int target) {
    return 'Satz $number: $actual von $target Wdh.';
  }

  @override
  String historySetResultMax(int number, int actual) {
    return 'Satz $number: $actual Wdh. (MAX)';
  }

  @override
  String historySetResultPlain(int number, int actual) {
    return 'Satz $number: $actual Wdh.';
  }

  @override
  String historySetDone(int number) {
    return 'Satz $number: erledigt';
  }

  @override
  String historySetOpen(int number) {
    return 'Satz $number: nicht erledigt';
  }

  @override
  String get historyExerciseOpen => 'Nicht erledigt';

  @override
  String get totalGoal => 'Gesamtziel';

  @override
  String get totalDone => 'Bereits geschafft';

  @override
  String get totalOpen => 'Noch offen';

  @override
  String totalCurrentSet(int number) {
    return 'Aktueller Satz $number';
  }

  @override
  String get totalRepsInput => 'Wiederholungen eintragen';

  @override
  String get totalSaveSet => 'Satz speichern';

  @override
  String get totalSaving => 'Wird gespeichert …';

  @override
  String get totalGoalReached => 'Ziel erreicht';

  @override
  String totalProgressValue(int done, int target) {
    return '$done von $target Wdh.';
  }

  @override
  String totalSetSaved(int number) {
    return 'Satz $number gespeichert';
  }

  @override
  String get totalSetNotSaved =>
      'Satz nicht gespeichert. Es läuft keine Pause.';

  @override
  String get totalRepsRange => 'Bitte mindestens 1 Wiederholung eintragen.';

  @override
  String historyTotalResult(int done, int target) {
    return 'Gesamt: $done von $target Wdh.';
  }

  @override
  String historyRoundResult(int number, int seconds) {
    return 'Runde $number: $seconds Sek.';
  }

  @override
  String historyRoundOpen(int number) {
    return 'Runde $number: nicht erledigt';
  }

  @override
  String coreRoundOf(int round, int rounds) {
    return 'Runde $round von $rounds';
  }

  @override
  String get corePhaseWork => 'TRAINING';

  @override
  String get corePhaseRest => 'PAUSE';

  @override
  String corePlan(int rounds, String work, String rest) {
    return '$rounds Runden · $work Training · $rest Pause';
  }

  @override
  String get coreStart => 'Core starten';

  @override
  String coreStartFrom(int round) {
    return 'Ab Runde $round starten';
  }

  @override
  String get corePause => 'Anhalten';

  @override
  String get coreResume => 'Fortsetzen';

  @override
  String get coreCancel => 'Abbrechen';

  @override
  String get coreNextRound => 'Nächste Runde';

  @override
  String get coreDone => 'Training abgeschlossen';

  @override
  String get corePaused => 'Angehalten';

  @override
  String coreRoundsSaved(int done, int rounds) {
    return '$done von $rounds Runden gespeichert';
  }

  @override
  String coreRoundsUnsaved(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Runden sind noch nicht gespeichert.',
      one: '1 Runde ist noch nicht gespeichert.',
    );
    return '$_temp0';
  }

  @override
  String get coreSaveRounds => 'Runden speichern';

  @override
  String coreRemainingSemantics(
    String phase,
    int round,
    int rounds,
    String clock,
  ) {
    return '$phase, Runde $round von $rounds, noch $clock';
  }

  @override
  String coreAnnounceWork(int round) {
    return 'Training, Runde $round';
  }

  @override
  String get coreAnnounceRest => 'Pause';

  @override
  String get coreOtherRunning => 'Eine andere Core-Routine läuft gerade.';

  @override
  String get coreNotifyRestTitle => 'Pause';

  @override
  String coreNotifyRestBody(int round) {
    return 'Runde $round geschafft – kurz durchatmen.';
  }

  @override
  String get coreNotifyWorkTitle => 'Training';

  @override
  String coreNotifyWorkBody(int round, int rounds) {
    return 'Runde $round von $rounds startet.';
  }

  @override
  String get coreNotifyDoneTitle => 'Training abgeschlossen';

  @override
  String coreNotifyDoneBody(String exercise) {
    return '$exercise ist geschafft.';
  }

  @override
  String get videoLoadFailed => 'Video konnte nicht geladen werden.';

  @override
  String get videoLoading => 'Video wird geladen';

  @override
  String get videoSeek => 'Videoposition';

  @override
  String videoPosition(String position, String duration) {
    return '$position von $duration';
  }

  @override
  String historyTotalReps(int reps) {
    return 'Gesamt: $reps Wiederholungen';
  }

  @override
  String historySetCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Sätze',
      one: '1 Satz',
    );
    return '$_temp0';
  }

  @override
  String historyRoundCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Runden',
      one: '1 Runde',
    );
    return '$_temp0';
  }

  @override
  String get historyLoadMore => 'Mehr laden';

  @override
  String get historyLoadMoreFailed =>
      'Weitere Einträge konnten nicht geladen werden.';

  @override
  String historyTotalGoal(int target) {
    return 'Gesamtziel: $target Wdh.';
  }

  @override
  String historyTotalDone(int done) {
    return 'Geschafft: $done Wdh.';
  }

  @override
  String historyTotalSetsNeeded(int count) {
    return 'Benötigte Sätze: $count';
  }

  @override
  String historyCoreConfig(int rounds, int work, int rest) {
    return '$rounds Runden · $work Sek. Belastung · $rest Sek. Pause';
  }

  @override
  String historyCoreDone(int done, int rounds) {
    return 'Runden geschafft: $done von $rounds';
  }

  @override
  String get historyWarmupDone => 'Aufwärmen erledigt';

  @override
  String get compareTitle => 'Vergleich';

  @override
  String comparePrevious(String date) {
    return 'Vorheriges Training: $date';
  }

  @override
  String get compareCurrent => 'Aktuelles Training';

  @override
  String get compareNoData => 'Noch keine Vergleichsdaten';

  @override
  String compareDifference(String value) {
    return 'Differenz: $value';
  }

  @override
  String compareSetLine(int number, String previous, String current) {
    return 'Satz $number: $previous → $current';
  }

  @override
  String compareTotalLine(String previous, String current) {
    return 'Gesamt: $previous → $current Wdh.';
  }

  @override
  String compareRoundsLine(String previous, String current) {
    return 'Runden: $previous → $current';
  }

  @override
  String compareSetsUsed(String previous, String current) {
    return 'Sätze: $previous → $current';
  }

  @override
  String get compareConfigChanged =>
      'Andere Runden-Einstellung als beim letzten Mal';

  @override
  String get compareNotRecorded => 'nicht erfasst';

  @override
  String get progressChartOpen => 'Verlauf ansehen';

  @override
  String progressChartTitle(String name) {
    return 'Verlauf: $name';
  }

  @override
  String get progressChartEmpty => 'Noch zu wenige Daten für einen Verlauf';

  @override
  String progressChartSummary(
    int count,
    int first,
    int last,
    int best,
    String unit,
  ) {
    return '$count Trainings. Erster Wert $first, letzter Wert $last, bester Wert $best $unit.';
  }

  @override
  String get progressUnitReps => 'Wiederholungen';

  @override
  String get progressUnitRounds => 'Runden';

  @override
  String get appUpdateTitle => 'Update erforderlich';

  @override
  String get appUpdateBody =>
      'Diese Version der VITRUV App wird nicht mehr unterstützt. Bitte aktualisiere die App im App Store. Deine Anmeldung und deine Daten bleiben erhalten.';

  @override
  String appUpdateInstalled(String installed) {
    return 'Installiert: $installed';
  }

  @override
  String appUpdateVersions(String installed, String minimum) {
    return 'Installiert: $installed · Mindestens: $minimum';
  }

  @override
  String get appUpdateCopyLink => 'Link kopieren';

  @override
  String get appUpdateRetry => 'Erneut prüfen';
}
