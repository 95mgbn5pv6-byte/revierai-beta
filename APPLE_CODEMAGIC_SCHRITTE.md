# Apple- und Codemagic-Schritte

## 1. Apple Developer Program

Mit dem Apple-Konto anmelden, das Eigentümer von RevierAI sein soll, und die
Mitgliedschaft abschließen.

## 2. App-ID und App-Eintrag

In Apple Developer / App Store Connect:

- Name: RevierAI
- Bundle-ID: at.revierai.app
- Plattform: iOS
- Hauptsprache: Deutsch

Der App-Eintrag muss vor dem ersten Upload existieren.

## 3. App Store Connect API-Schlüssel

App Store Connect:
Users and Access -> Integrations -> App Store Connect API

- Schlüsselname: RevierAI Codemagic
- Rolle: App Manager
- Issuer ID notieren
- Key ID notieren
- .p8-Datei einmalig herunterladen und sicher speichern

WICHTIG: Die .p8-Datei nie zu GitHub hochladen und nicht per Chat versenden.

## 4. Codemagic verbinden

Codemagic:
Team settings -> Integrations -> Developer Portal -> Manage keys -> Add key

- Name der Integration exakt: revierai-apple
- Issuer ID
- Key ID
- .p8-Datei hochladen

Danach in Codemagic:
Add application -> GitHub -> RevierAI-Repository auswählen.

Codemagic erkennt die Datei codemagic.yaml.

## 5. Erster Build für dich

Workflow:
RevierAI – internes TestFlight

Dieser Build ist als „Internal Testing Only“ signiert. Er benötigt keine externe
Beta-Prüfung, ist aber nur für interne App-Store-Connect-Nutzer gedacht.

Nach dem Upload:
App Store Connect -> TestFlight -> Internal Testing
deinen Apple-Account als Tester hinzufügen und den Build auswählen.

## 6. Jagdkollegen

Workflow:
RevierAI – externes TestFlight

Der Build wird zur TestFlight-Beta-Prüfung eingereicht. Nach Freigabe können
externe Tester per E-Mail oder öffentlichem Einladungslink eingeladen werden.
