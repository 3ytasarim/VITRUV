import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_de.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('de'),
    Locale('en'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In de, this message translates to:
  /// **'VITRUV'**
  String get appTitle;

  /// No description provided for @navToday.
  ///
  /// In de, this message translates to:
  /// **'Heute'**
  String get navToday;

  /// No description provided for @navTraining.
  ///
  /// In de, this message translates to:
  /// **'Training'**
  String get navTraining;

  /// No description provided for @navNutrition.
  ///
  /// In de, this message translates to:
  /// **'Ernährung'**
  String get navNutrition;

  /// No description provided for @navProgress.
  ///
  /// In de, this message translates to:
  /// **'Fortschritt'**
  String get navProgress;

  /// No description provided for @navProfile.
  ///
  /// In de, this message translates to:
  /// **'Profil'**
  String get navProfile;

  /// No description provided for @todayGreeting.
  ///
  /// In de, this message translates to:
  /// **'Willkommen bei VITRUV'**
  String get todayGreeting;

  /// No description provided for @placeholderComingSoon.
  ///
  /// In de, this message translates to:
  /// **'Dieser Bereich folgt in einem der nächsten Sprints.'**
  String get placeholderComingSoon;

  /// No description provided for @systemStatus.
  ///
  /// In de, this message translates to:
  /// **'Systemstatus'**
  String get systemStatus;

  /// No description provided for @apiReachable.
  ///
  /// In de, this message translates to:
  /// **'Verbunden'**
  String get apiReachable;

  /// No description provided for @apiUnreachable.
  ///
  /// In de, this message translates to:
  /// **'Server nicht erreichbar'**
  String get apiUnreachable;

  /// No description provided for @retry.
  ///
  /// In de, this message translates to:
  /// **'Erneut versuchen'**
  String get retry;

  /// No description provided for @loading.
  ///
  /// In de, this message translates to:
  /// **'Wird geladen …'**
  String get loading;

  /// No description provided for @errorNetwork.
  ///
  /// In de, this message translates to:
  /// **'Keine Verbindung. Bitte prüfe deine Internetverbindung.'**
  String get errorNetwork;

  /// No description provided for @errorServer.
  ///
  /// In de, this message translates to:
  /// **'Der Server hat einen Fehler gemeldet.'**
  String get errorServer;

  /// No description provided for @errorUnknown.
  ///
  /// In de, this message translates to:
  /// **'Etwas ist schiefgelaufen.'**
  String get errorUnknown;

  /// No description provided for @cancel.
  ///
  /// In de, this message translates to:
  /// **'Abbrechen'**
  String get cancel;

  /// No description provided for @loginTitle.
  ///
  /// In de, this message translates to:
  /// **'Anmelden'**
  String get loginTitle;

  /// No description provided for @loginIntro.
  ///
  /// In de, this message translates to:
  /// **'Melde dich mit der E-Mail-Adresse und dem Passwort an, das du über deinen Aktivierungslink festgelegt hast.'**
  String get loginIntro;

  /// No description provided for @loginEmail.
  ///
  /// In de, this message translates to:
  /// **'E-Mail-Adresse'**
  String get loginEmail;

  /// No description provided for @loginPassword.
  ///
  /// In de, this message translates to:
  /// **'Passwort'**
  String get loginPassword;

  /// No description provided for @loginShowPassword.
  ///
  /// In de, this message translates to:
  /// **'Passwort anzeigen'**
  String get loginShowPassword;

  /// No description provided for @loginHidePassword.
  ///
  /// In de, this message translates to:
  /// **'Passwort verbergen'**
  String get loginHidePassword;

  /// No description provided for @loginSubmit.
  ///
  /// In de, this message translates to:
  /// **'Anmelden'**
  String get loginSubmit;

  /// No description provided for @loginBusy.
  ///
  /// In de, this message translates to:
  /// **'Anmeldung läuft'**
  String get loginBusy;

  /// No description provided for @loginFieldRequired.
  ///
  /// In de, this message translates to:
  /// **'Bitte ausfüllen.'**
  String get loginFieldRequired;

  /// No description provided for @loginEmailInvalid.
  ///
  /// In de, this message translates to:
  /// **'Bitte eine gültige E-Mail-Adresse eingeben.'**
  String get loginEmailInvalid;

  /// No description provided for @loginErrorInvalid.
  ///
  /// In de, this message translates to:
  /// **'E-Mail-Adresse oder Passwort ist nicht korrekt.'**
  String get loginErrorInvalid;

  /// No description provided for @loginErrorRateLimited.
  ///
  /// In de, this message translates to:
  /// **'Zu viele Versuche. Bitte warte einige Minuten und versuche es dann erneut.'**
  String get loginErrorRateLimited;

  /// No description provided for @loginErrorNotClient.
  ///
  /// In de, this message translates to:
  /// **'Die App ist für Kund:innen. Coaches nutzen den Webzugang.'**
  String get loginErrorNotClient;

  /// No description provided for @loginErrorUnknown.
  ///
  /// In de, this message translates to:
  /// **'Die Anmeldung ist fehlgeschlagen. Bitte versuche es später erneut.'**
  String get loginErrorUnknown;

  /// No description provided for @loginForgotHint.
  ///
  /// In de, this message translates to:
  /// **'Passwort vergessen? Wende dich an deinen Coach.'**
  String get loginForgotHint;

  /// No description provided for @sessionExpired.
  ///
  /// In de, this message translates to:
  /// **'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.'**
  String get sessionExpired;

  /// No description provided for @startupUnavailable.
  ///
  /// In de, this message translates to:
  /// **'Deine Anmeldung konnte gerade nicht geprüft werden.'**
  String get startupUnavailable;

  /// No description provided for @signOut.
  ///
  /// In de, this message translates to:
  /// **'Abmelden'**
  String get signOut;

  /// No description provided for @signOutConfirmTitle.
  ///
  /// In de, this message translates to:
  /// **'Abmelden?'**
  String get signOutConfirmTitle;

  /// No description provided for @signOutConfirmBody.
  ///
  /// In de, this message translates to:
  /// **'Du kannst dich jederzeit wieder anmelden. Laufende Trainings bleiben gespeichert.'**
  String get signOutConfirmBody;

  /// No description provided for @homeGreeting.
  ///
  /// In de, this message translates to:
  /// **'Hallo {name}'**
  String homeGreeting(String name);

  /// No description provided for @homeCoach.
  ///
  /// In de, this message translates to:
  /// **'Dein Coach: {name}'**
  String homeCoach(String name);

  /// No description provided for @coachingActive.
  ///
  /// In de, this message translates to:
  /// **'Coaching aktiv'**
  String get coachingActive;

  /// No description provided for @coachingPaused.
  ///
  /// In de, this message translates to:
  /// **'Coaching pausiert'**
  String get coachingPaused;

  /// No description provided for @coachingCompleted.
  ///
  /// In de, this message translates to:
  /// **'Coaching abgeschlossen'**
  String get coachingCompleted;

  /// No description provided for @homeWorkoutRunning.
  ///
  /// In de, this message translates to:
  /// **'Training läuft'**
  String get homeWorkoutRunning;

  /// No description provided for @homeWorkoutRunningBody.
  ///
  /// In de, this message translates to:
  /// **'{day} · {done} von {total} Übungen'**
  String homeWorkoutRunningBody(String day, int done, int total);

  /// No description provided for @continueWorkout.
  ///
  /// In de, this message translates to:
  /// **'Training fortsetzen'**
  String get continueWorkout;

  /// No description provided for @homePlanTitle.
  ///
  /// In de, this message translates to:
  /// **'Dein Trainingsplan'**
  String get homePlanTitle;

  /// No description provided for @homeScheduledToday.
  ///
  /// In de, this message translates to:
  /// **'Heute geplant'**
  String get homeScheduledToday;

  /// No description provided for @homeThisWeek.
  ///
  /// In de, this message translates to:
  /// **'Diese Woche'**
  String get homeThisWeek;

  /// No description provided for @homeOpenPlan.
  ///
  /// In de, this message translates to:
  /// **'Zum Trainingsplan'**
  String get homeOpenPlan;

  /// No description provided for @homeNoPlan.
  ///
  /// In de, this message translates to:
  /// **'Noch kein Trainingsplan'**
  String get homeNoPlan;

  /// No description provided for @homeNoPlanBody.
  ///
  /// In de, this message translates to:
  /// **'Sobald dein Coach deinen Plan freigibt, erscheint er hier.'**
  String get homeNoPlanBody;

  /// No description provided for @weekCount.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Woche} other{{count} Wochen}}'**
  String weekCount(int count);

  /// No description provided for @trainingDays.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Trainingstag} other{{count} Trainingstage}}'**
  String trainingDays(int count);

  /// No description provided for @trainingEmptyTitle.
  ///
  /// In de, this message translates to:
  /// **'Noch kein aktiver Trainingsplan'**
  String get trainingEmptyTitle;

  /// No description provided for @trainingEmptyBody.
  ///
  /// In de, this message translates to:
  /// **'Dein Coach erstellt deinen Plan. Sobald er aktiv ist, findest du ihn hier.'**
  String get trainingEmptyBody;

  /// No description provided for @weekLabel.
  ///
  /// In de, this message translates to:
  /// **'Woche {number}'**
  String weekLabel(int number);

  /// No description provided for @dayLabel.
  ///
  /// In de, this message translates to:
  /// **'Tag {number}'**
  String dayLabel(int number);

  /// No description provided for @currentWeek.
  ///
  /// In de, this message translates to:
  /// **'Aktuelle Woche'**
  String get currentWeek;

  /// No description provided for @exerciseCount.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =0{Keine Übungen} =1{1 Übung} other{{count} Übungen}}'**
  String exerciseCount(int count);

  /// No description provided for @workoutRunningBadge.
  ///
  /// In de, this message translates to:
  /// **'Läuft'**
  String get workoutRunningBadge;

  /// No description provided for @sectionWarmup.
  ///
  /// In de, this message translates to:
  /// **'Warm-up'**
  String get sectionWarmup;

  /// No description provided for @sectionMain.
  ///
  /// In de, this message translates to:
  /// **'Hauptteil'**
  String get sectionMain;

  /// No description provided for @sectionFinisher.
  ///
  /// In de, this message translates to:
  /// **'Abschluss'**
  String get sectionFinisher;

  /// No description provided for @weekday.
  ///
  /// In de, this message translates to:
  /// **'{day, select, 1{Montag} 2{Dienstag} 3{Mittwoch} 4{Donnerstag} 5{Freitag} 6{Samstag} 7{Sonntag} other{}}'**
  String weekday(String day);

  /// No description provided for @startWorkout.
  ///
  /// In de, this message translates to:
  /// **'Training starten'**
  String get startWorkout;

  /// No description provided for @otherWorkoutRunning.
  ///
  /// In de, this message translates to:
  /// **'Ein anderes Training läuft noch'**
  String get otherWorkoutRunning;

  /// No description provided for @otherWorkoutRunningBody.
  ///
  /// In de, this message translates to:
  /// **'Schließe es ab oder brich es ab, bevor du ein neues startest.'**
  String get otherWorkoutRunningBody;

  /// No description provided for @openRunningWorkout.
  ///
  /// In de, this message translates to:
  /// **'Laufendes Training öffnen'**
  String get openRunningWorkout;

  /// No description provided for @dayNotFound.
  ///
  /// In de, this message translates to:
  /// **'Dieser Trainingstag ist nicht mehr Teil deines Plans.'**
  String get dayNotFound;

  /// No description provided for @dayNoExercises.
  ///
  /// In de, this message translates to:
  /// **'Für diesen Tag sind noch keine Übungen hinterlegt.'**
  String get dayNoExercises;

  /// No description provided for @instructionsLabel.
  ///
  /// In de, this message translates to:
  /// **'Anleitung'**
  String get instructionsLabel;

  /// No description provided for @playVideo.
  ///
  /// In de, this message translates to:
  /// **'Video abspielen: {name}'**
  String playVideo(String name);

  /// No description provided for @pauseVideo.
  ///
  /// In de, this message translates to:
  /// **'Video pausieren'**
  String get pauseVideo;

  /// No description provided for @mediaUnavailable.
  ///
  /// In de, this message translates to:
  /// **'Medium nicht verfügbar'**
  String get mediaUnavailable;

  /// No description provided for @mediaPlaceholder.
  ///
  /// In de, this message translates to:
  /// **'Kein Medium'**
  String get mediaPlaceholder;

  /// No description provided for @rxSetsReps.
  ///
  /// In de, this message translates to:
  /// **'{sets} × {reps}'**
  String rxSetsReps(int sets, int reps);

  /// No description provided for @rxSetsDuration.
  ///
  /// In de, this message translates to:
  /// **'{sets} × {duration}'**
  String rxSetsDuration(int sets, String duration);

  /// No description provided for @rxSets.
  ///
  /// In de, this message translates to:
  /// **'{sets, plural, =1{1 Satz} other{{sets} Sätze}}'**
  String rxSets(int sets);

  /// No description provided for @rxReps.
  ///
  /// In de, this message translates to:
  /// **'{reps} Wdh.'**
  String rxReps(int reps);

  /// No description provided for @rxTotalReps.
  ///
  /// In de, this message translates to:
  /// **'{reps} Wdh. gesamt'**
  String rxTotalReps(int reps);

  /// No description provided for @rxSeconds.
  ///
  /// In de, this message translates to:
  /// **'{seconds} Sek.'**
  String rxSeconds(int seconds);

  /// No description provided for @rxMinutes.
  ///
  /// In de, this message translates to:
  /// **'{clock} Min.'**
  String rxMinutes(String clock);

  /// No description provided for @rxWeight.
  ///
  /// In de, this message translates to:
  /// **'{value} kg'**
  String rxWeight(String value);

  /// No description provided for @rxRest.
  ///
  /// In de, this message translates to:
  /// **'Pause {clock}'**
  String rxRest(String clock);

  /// No description provided for @workoutPosition.
  ///
  /// In de, this message translates to:
  /// **'{current} / {total}'**
  String workoutPosition(int current, int total);

  /// No description provided for @workoutPositionLabel.
  ///
  /// In de, this message translates to:
  /// **'Übung {current} von {total}'**
  String workoutPositionLabel(int current, int total);

  /// No description provided for @workoutProgressLabel.
  ///
  /// In de, this message translates to:
  /// **'Fortschritt'**
  String get workoutProgressLabel;

  /// No description provided for @workoutProgressValue.
  ///
  /// In de, this message translates to:
  /// **'{done} von {total} Übungen erledigt'**
  String workoutProgressValue(int done, int total);

  /// No description provided for @setLabel.
  ///
  /// In de, this message translates to:
  /// **'Satz {number}'**
  String setLabel(int number);

  /// No description provided for @setCompleteAction.
  ///
  /// In de, this message translates to:
  /// **'Satz {number} abschließen'**
  String setCompleteAction(int number);

  /// No description provided for @setReopenAction.
  ///
  /// In de, this message translates to:
  /// **'Satz {number} wieder öffnen'**
  String setReopenAction(int number);

  /// No description provided for @setDoneState.
  ///
  /// In de, this message translates to:
  /// **'erledigt'**
  String get setDoneState;

  /// No description provided for @completeExercise.
  ///
  /// In de, this message translates to:
  /// **'Übung abschließen'**
  String get completeExercise;

  /// No description provided for @skipExercise.
  ///
  /// In de, this message translates to:
  /// **'Überspringen'**
  String get skipExercise;

  /// No description provided for @reopenExercise.
  ///
  /// In de, this message translates to:
  /// **'Wieder öffnen'**
  String get reopenExercise;

  /// No description provided for @exerciseDone.
  ///
  /// In de, this message translates to:
  /// **'Erledigt'**
  String get exerciseDone;

  /// No description provided for @exerciseSkipped.
  ///
  /// In de, this message translates to:
  /// **'Übersprungen'**
  String get exerciseSkipped;

  /// No description provided for @actualRepsLabel.
  ///
  /// In de, this message translates to:
  /// **'Geschaffte Wiederholungen'**
  String get actualRepsLabel;

  /// No description provided for @startTimer.
  ///
  /// In de, this message translates to:
  /// **'Timer starten'**
  String get startTimer;

  /// No description provided for @stopTimer.
  ///
  /// In de, this message translates to:
  /// **'Timer stoppen'**
  String get stopTimer;

  /// No description provided for @timerReached.
  ///
  /// In de, this message translates to:
  /// **'Zeit erreicht'**
  String get timerReached;

  /// No description provided for @previousExercise.
  ///
  /// In de, this message translates to:
  /// **'Vorherige Übung'**
  String get previousExercise;

  /// No description provided for @nextExercise.
  ///
  /// In de, this message translates to:
  /// **'Nächste Übung'**
  String get nextExercise;

  /// No description provided for @finishWorkout.
  ///
  /// In de, this message translates to:
  /// **'Training abschließen'**
  String get finishWorkout;

  /// No description provided for @finishConfirmTitle.
  ///
  /// In de, this message translates to:
  /// **'Training abschließen?'**
  String get finishConfirmTitle;

  /// No description provided for @finishConfirmOpen.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Übung ist noch offen und wird als nicht erledigt gespeichert.} other{{count} Übungen sind noch offen und werden als nicht erledigt gespeichert.}}'**
  String finishConfirmOpen(int count);

  /// No description provided for @abandonWorkout.
  ///
  /// In de, this message translates to:
  /// **'Training abbrechen'**
  String get abandonWorkout;

  /// No description provided for @abandonConfirmTitle.
  ///
  /// In de, this message translates to:
  /// **'Training abbrechen?'**
  String get abandonConfirmTitle;

  /// No description provided for @abandonConfirmBody.
  ///
  /// In de, this message translates to:
  /// **'Das Training wird als abgebrochen gespeichert. Bereits erfasste Sätze bleiben erhalten.'**
  String get abandonConfirmBody;

  /// No description provided for @keepTraining.
  ///
  /// In de, this message translates to:
  /// **'Weiter trainieren'**
  String get keepTraining;

  /// No description provided for @workoutLeftHint.
  ///
  /// In de, this message translates to:
  /// **'Dein Training läuft weiter – du kannst es jederzeit fortsetzen.'**
  String get workoutLeftHint;

  /// No description provided for @saveFailed.
  ///
  /// In de, this message translates to:
  /// **'Nicht gespeichert. Bitte erneut versuchen.'**
  String get saveFailed;

  /// No description provided for @noWorkoutRunning.
  ///
  /// In de, this message translates to:
  /// **'Gerade läuft kein Training.'**
  String get noWorkoutRunning;

  /// No description provided for @backToTraining.
  ///
  /// In de, this message translates to:
  /// **'Zum Trainingsplan'**
  String get backToTraining;

  /// No description provided for @moreActions.
  ///
  /// In de, this message translates to:
  /// **'Weitere Aktionen'**
  String get moreActions;

  /// No description provided for @restTitle.
  ///
  /// In de, this message translates to:
  /// **'Pause'**
  String get restTitle;

  /// No description provided for @restSkip.
  ///
  /// In de, this message translates to:
  /// **'Pause überspringen'**
  String get restSkip;

  /// No description provided for @restAdd.
  ///
  /// In de, this message translates to:
  /// **'+30 Sek.'**
  String get restAdd;

  /// No description provided for @restAddSemantics.
  ///
  /// In de, this message translates to:
  /// **'30 Sekunden Pause hinzufügen'**
  String get restAddSemantics;

  /// No description provided for @restPause.
  ///
  /// In de, this message translates to:
  /// **'Anhalten'**
  String get restPause;

  /// No description provided for @restResume.
  ///
  /// In de, this message translates to:
  /// **'Fortsetzen'**
  String get restResume;

  /// No description provided for @restFinished.
  ///
  /// In de, this message translates to:
  /// **'Pause beendet'**
  String get restFinished;

  /// No description provided for @restStarted.
  ///
  /// In de, this message translates to:
  /// **'Pause {clock} gestartet'**
  String restStarted(String clock);

  /// No description provided for @restRemainingSemantics.
  ///
  /// In de, this message translates to:
  /// **'Pause, noch {clock}'**
  String restRemainingSemantics(String clock);

  /// No description provided for @restStart.
  ///
  /// In de, this message translates to:
  /// **'Pause starten'**
  String get restStart;

  /// No description provided for @restContinue.
  ///
  /// In de, this message translates to:
  /// **'Weiter'**
  String get restContinue;

  /// No description provided for @completedTitle.
  ///
  /// In de, this message translates to:
  /// **'Training abgeschlossen'**
  String get completedTitle;

  /// No description provided for @abandonedTitle.
  ///
  /// In de, this message translates to:
  /// **'Training abgebrochen'**
  String get abandonedTitle;

  /// No description provided for @completedExercises.
  ///
  /// In de, this message translates to:
  /// **'{done} von {total} Übungen'**
  String completedExercises(int done, int total);

  /// No description provided for @completedDuration.
  ///
  /// In de, this message translates to:
  /// **'Dauer {duration}'**
  String completedDuration(String duration);

  /// No description provided for @completedSkipped.
  ///
  /// In de, this message translates to:
  /// **'{count} übersprungen'**
  String completedSkipped(int count);

  /// No description provided for @completedOpen.
  ///
  /// In de, this message translates to:
  /// **'{count} nicht erledigt'**
  String completedOpen(int count);

  /// No description provided for @toOverview.
  ///
  /// In de, this message translates to:
  /// **'Zur Übersicht'**
  String get toOverview;

  /// No description provided for @durationUnderMinute.
  ///
  /// In de, this message translates to:
  /// **'unter 1 Min.'**
  String get durationUnderMinute;

  /// No description provided for @durationMinutes.
  ///
  /// In de, this message translates to:
  /// **'{minutes} Min.'**
  String durationMinutes(int minutes);

  /// No description provided for @durationHours.
  ///
  /// In de, this message translates to:
  /// **'{hours} Std. {minutes} Min.'**
  String durationHours(int hours, int minutes);

  /// No description provided for @historyTitle.
  ///
  /// In de, this message translates to:
  /// **'Trainingsverlauf'**
  String get historyTitle;

  /// No description provided for @historyEmpty.
  ///
  /// In de, this message translates to:
  /// **'Noch keine Trainings'**
  String get historyEmpty;

  /// No description provided for @historyEmptyBody.
  ///
  /// In de, this message translates to:
  /// **'Nach deinem ersten Training siehst du hier deinen Verlauf.'**
  String get historyEmptyBody;

  /// No description provided for @statusCompleted.
  ///
  /// In de, this message translates to:
  /// **'Abgeschlossen'**
  String get statusCompleted;

  /// No description provided for @statusAbandoned.
  ///
  /// In de, this message translates to:
  /// **'Abgebrochen'**
  String get statusAbandoned;

  /// No description provided for @statusInProgress.
  ///
  /// In de, this message translates to:
  /// **'Läuft'**
  String get statusInProgress;

  /// No description provided for @profileEmail.
  ///
  /// In de, this message translates to:
  /// **'E-Mail'**
  String get profileEmail;

  /// No description provided for @profileCoach.
  ///
  /// In de, this message translates to:
  /// **'Coach'**
  String get profileCoach;

  /// No description provided for @profileNoCoach.
  ///
  /// In de, this message translates to:
  /// **'Noch kein Coach zugewiesen'**
  String get profileNoCoach;

  /// No description provided for @profileCoaching.
  ///
  /// In de, this message translates to:
  /// **'Coaching'**
  String get profileCoaching;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['de', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
