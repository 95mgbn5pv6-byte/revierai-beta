# Projekt unter Windows zu GitHub laden

## Voraussetzungen

- Git for Windows
- GitHub-Konto
- privates leeres GitHub-Repository, zum Beispiel `revierai-beta`

## Variante mit PowerShell

PowerShell im entpackten Projektordner öffnen:

    Set-ExecutionPolicy -Scope Process Bypass
    .\scripts\github-upload.ps1 -RepositoryUrl "https://github.com/DEINNAME/revierai-beta.git"

GitHub kann beim Push eine Anmeldung im Browser öffnen.

## Variante mit GitHub Desktop

1. GitHub Desktop installieren.
2. File -> Add local repository.
3. Diesen Projektordner auswählen.
4. „Create a repository“ wählen.
5. Repository privat veröffentlichen.

Die Apple-.p8-Datei darf niemals in das Repository.
