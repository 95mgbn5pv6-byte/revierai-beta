# RevierAI Beta – Windows + Codemagic + TestFlight

Dieses Projekt ist so vorbereitet, dass die iPhone-App auf einem Cloud-Mac bei
Codemagic gebaut und zu App Store Connect hochgeladen werden kann.

## Bereits funktionierend

- native installierbare Capacitor-App nach dem Cloud-Build
- Kamera-/Fotodateiauswahl über das iPhone
- GPS-Erfassung einer Beobachtung
- lokale Speicherung von Beobachtungen
- lokaler Dateiimport über IndexedDB
- RevierAI-Design, Navigation und Geländemodell-Demo
- interner und externer TestFlight-Workflow
- App-Icon und iPhone-Berechtigungstexte

## Noch Demo beziehungsweise später anzubinden

- echte KI-Wildanalyse
- Tierwiedererkennung
- echte Wetter- und Geländedaten
- Anmeldung und gemeinsame Cloud-Synchronisierung
- TrophyScan-Algorithmen
- Nachsuchenstations-Verzeichnis

## Was du persönlich erledigen musst

Apple erlaubt niemandem, eine App unter deinem Namen ohne dein Entwicklerkonto
zu signieren. Deshalb sind einmalig erforderlich:

1. Apple Developer Program abschließen.
2. In App Store Connect den App-Eintrag „RevierAI“ anlegen.
3. Einen App Store Connect API-Schlüssel erzeugen.
4. Den Schlüssel sicher in Codemagic hinterlegen.
5. Das Projekt auf GitHub laden und in Codemagic verbinden.
6. Workflow starten.

Die private .p8-Datei niemals in dieses Projekt oder zu GitHub hochladen.
