# ENTWURF — Datenschutzerklärung VITRUV (Website-Kundenbereich + iPhone-App)

> **Status: ENTWURF, nicht rechtlich geprüft, nicht veröffentlicht (Sprint 8B, 2026-11-23).**
> Alle Angaben zu Daten und Abläufen sind aus dem Quellcode belegt (Fundstellen in
> `docs/ios-training-sprint8b-apple-checklist.md` §Privacy). Alles in `⟦…⟧` ist eine **offene
> Angabe des Verantwortlichen / der Rechtsberatung** und darf nicht geraten werden.
> Die frühere Datenschutzseite der Website wurde in Commit d19cf33 entfernt; ob und wo diese
> Erklärung erscheint (eigene Seite, CMS-Seite, Pfad), entscheidet der Inhaber.
> Für den App Store wird eine **öffentlich erreichbare HTTPS-URL** benötigt.

---

## 1. Verantwortlicher

⟦Name / Firma, Anschrift, E-Mail, ggf. Telefon des Verantwortlichen⟧
⟦Datenschutzbeauftragte:r, falls bestellt — sonst Satz streichen⟧

## 2. Worum es geht

VITRUV ist eine Coaching-Plattform. Kund:innen erhalten von ihrem Coach Trainingspläne und
dokumentieren ihr Training in der VITRUV App oder im Kundenbereich der Website. **Konten werden
vom Coach bzw. von VITRUV angelegt**; in der App gibt es keine Registrierung.

## 3. Welche Daten wir verarbeiten

### 3.1 Konto und Anmeldung
- Benutzername und/oder E-Mail-Adresse (die E-Mail ist optional; ein Konto kann nur einen
  Benutzernamen haben), angezeigter Name, Rolle, Kontostatus.
- Passwort — gespeichert ausschließlich als Argon2id-Hash; wir kennen Ihr Passwort nicht.
- Sitzungen: Zeitpunkt der Anmeldung, letzte Nutzung, Ablauf, Art des Zugangs (Web oder App).
  Zugangs-Token werden nur als Hash gespeichert. In der App liegen die Token im
  iOS-Schlüsselbund des Geräts.
- Sicherheitsprotokoll (z. B. Anmeldung, Abmeldung, Passwortänderung, Kontoaktivierung) mit
  Zeitpunkt und Kennungen — ohne Passwörter, Token oder Inhalte.
- IP-Adresse: wird zum Schutz vor Missbrauch (Begrenzung von Anmeldeversuchen) **nur kurzzeitig
  im Arbeitsspeicher** verwendet und von der Anwendung nicht gespeichert. ⟦Server-Zugriffsprotokolle
  des Webservers: Inhalt und Speicherdauer — Angabe des Betreibers⟧

Zweck: Bereitstellung des Kontos, Sicherheit. Rechtsgrundlage: ⟦Art. 6 Abs. 1 lit. b DSGVO
(Vertrag) / lit. f (Sicherheit) — Bestätigung durch Rechtsberatung⟧.

### 3.2 Profil
Vorname, Nachname, optional Telefonnummer — vom Coach angelegt. **Keine Gesundheits- oder
medizinischen Angaben im Profil.**

### 3.3 Training
- Vom Coach zugewiesene Trainingspläne, Workouts, Übungen und Hinweise.
- Ihre Trainingsergebnisse: erledigte Sätze, Wiederholungen, Gewichte, Zeiten/Runden,
  Start- und Abschlusszeitpunkt, optionale eigene Notiz zu einer Einheit.
- Ihr Trainingsverlauf und Fortschritt (aus diesen Ergebnissen berechnet).
- Sichtbar für: Sie selbst, Ihre zugewiesenen Coaches und die Administration von VITRUV.
  Interne Coach-Notizen sind für Sie nicht sichtbar.

Hinweis: Trainingsdaten können Rückschlüsse auf die körperliche Leistungsfähigkeit zulassen.
⟦Einordnung als Gesundheitsdaten (Art. 9 DSGVO) ja/nein und ggf. Einwilligung — Rechtsberatung⟧

### 3.4 Übungsvideos und Dokumente
- Übungsvideos werden aus unserem Speicher gestreamt. ⟦Ab Umstellung: über kurzlebige,
  personengebundene Links, die nur nach Berechtigungsprüfung funktionieren.⟧
- Ernährungsunterlagen (PDF) als private Dateien mit kurzlebigen Links nach Berechtigungsprüfung.
- Wir speichern beim Abspielen keine Wiedergabe-Statistiken.

### 3.5 Benachrichtigungen
Die App nutzt **nur lokale Benachrichtigungen** auf Ihrem Gerät (z. B. Ende der Satzpause).
Es werden keine Push-Token an uns oder Dritte übermittelt. Die Erlaubnis können Sie jederzeit in
den iOS-Einstellungen widerrufen.

### 3.6 Technische Protokolle
Unser Server protokolliert pro Anfrage: Zeitpunkt, Methode, Pfad, Statuscode und Dauer sowie
eine zufällige Anfrage-Kennung — **keine Passwörter, Token oder Inhalte**. Signierte Videolinks
werden ohne ihre Signatur protokolliert. ⟦Speicherdauer der Protokolle⟧

### 3.7 Was die App NICHT tut
Kein Tracking, keine Werbung, keine Analyse- oder Absturz-SDKs von Drittanbietern, kein Zugriff
auf Kamera, Fotos, Standort, Mikrofon, Kontakte oder Apple Health.

### 3.8 Kontaktformular der Website
Name, E-Mail, optional Telefon, Nachricht, Zeitpunkt der Einwilligung. ⟦Zweck, Rechtsgrundlage,
Speicherdauer⟧

## 4. Empfänger und Auftragsverarbeiter

| Zweck | Anbieter | Ort | Grundlage |
|---|---|---|---|
| Datenbank (PostgreSQL) | ⟦Anbieter, z. B. Datenbank-Hosting⟧ | ⟦Region⟧ | ⟦AVV⟧ |
| Server / Hosting von Website und API | ⟦Anbieter⟧ | ⟦Ort⟧ | ⟦AVV⟧ |
| Datei- und Videospeicher | ⟦Anbieter (Objektspeicher)⟧ | ⟦Ort⟧ | ⟦AVV⟧ |
| E-Mail-Versand (falls eingerichtet) | ⟦Anbieter oder „nicht im Einsatz“⟧ | ⟦Ort⟧ | ⟦AVV⟧ |
| App-Vertrieb | Apple (App Store) — eigene Verantwortlichkeit von Apple | — | — |

⟦Drittlandübermittlung ja/nein, Garantien⟧

## 5. Speicherdauer

⟦Für jede Kategorie festzulegen (Inhaber + Rechtsberatung): Konto, Trainingsdaten nach
Vertragsende, Sicherheitsprotokoll, Server-Protokolle, Dokumente, Kontaktanfragen.⟧
Bis zur Festlegung gilt: Konten werden nicht automatisch gelöscht; Sitzungen laufen ab und
werden technisch bereinigt.

## 6. Kontolöschung

Sie können die Löschung Ihres Kontos jederzeit verlangen ⟦Weg: E-Mail an … / in der App unter
„Profil → Konto löschen“, sobald verfügbar⟧. Nach Eingang wird Ihr Zugang gesperrt und alle
Sitzungen werden beendet. Anschließend löschen oder anonymisieren wir Ihre personenbezogenen
Daten, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen ⟦Frist, welche Daten ggf.
anonymisiert statt gelöscht werden⟧.

## 7. Ihre Rechte

Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Widerruf
erteilter Einwilligungen sowie Beschwerde bei einer Aufsichtsbehörde ⟦zuständige Behörde⟧.
Kontakt: ⟦E-Mail⟧.

## 8. Sicherheit

Verschlüsselte Übertragung (HTTPS), Passwörter nur als Hash, Token nur als Hash bzw. im
Geräte-Schlüsselbund, rollen- und zuordnungsbasierte Zugriffsrechte (Coaches sehen nur ihnen
zugeordnete Kund:innen), private Dateien nur über kurzlebige Links.

## 9. Stand

⟦Datum der Veröffentlichung⟧
