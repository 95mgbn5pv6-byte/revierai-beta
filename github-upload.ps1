param(
  [Parameter(Mandatory=$true)]
  [string]$RepositoryUrl
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git ist nicht installiert. Bitte zuerst Git for Windows installieren."
}

git init
git add .
git commit -m "Initial RevierAI beta"
git branch -M main
git remote add origin $RepositoryUrl
git push -u origin main

Write-Host ""
Write-Host "Projekt wurde zu GitHub hochgeladen."
Write-Host "Als Nächstes das Repository in Codemagic verbinden."
