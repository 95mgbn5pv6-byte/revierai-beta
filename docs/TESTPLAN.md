# RevierAI KI-Server unter Windows einrichten

Die iPhone-App darf den OpenAI-API-Schlüssel nicht direkt enthalten. Deshalb liegt die Altersschätzung hinter einem kleinen Cloudflare Worker.

## Benötigt

- Cloudflare-Konto
- OpenAI-API-Konto mit aktivierter Abrechnung
- Node.js 22 oder neuer
- der Ordner `ai-worker` aus diesem Repository

## 1. PowerShell öffnen

Im entpackten Projektordner:

```powershell
cd ai-worker
npm install
npx wrangler login
```

Der Browser öffnet sich. Cloudflare-Zugriff bestätigen.

## 2. OpenAI-Schlüssel als Secret speichern

```powershell
npx wrangler secret put OPENAI_API_KEY
```

Den OpenAI-API-Schlüssel einfügen. Er wird nicht in GitHub gespeichert.

## 3. Zugangscode für eure Beta festlegen

Erstelle einen langen eigenen Code, beispielsweise mit mindestens 24 zufälligen Zeichen:

```powershell
npx wrangler secret put REVIERAI_CLIENT_TOKEN
```

Diesen Code tragen nur die 2–5 Tester in RevierAI unter `Einstellungen > Beta-Zugangscode` ein.

## 4. Worker veröffentlichen

```powershell
npm run deploy
```

Am Ende erscheint eine Adresse ähnlich wie:

```text
https://revierai-ai.DEIN-SUBDOMAIN.workers.dev
```

Diese Adresse in RevierAI unter `Einstellungen > RevierAI-KI-Server` eintragen.

## 5. Verbindung testen

In der App:

1. Mehr
2. Einstellungen
3. KI-Server-URL eintragen
4. Beta-Zugangscode eintragen
5. Einstellungen speichern
6. Erneut Einstellungen öffnen
7. `KI-Verbindung testen`

## Datenschutz und Sicherheit

- `OPENAI_API_KEY` und `REVIERAI_CLIENT_TOKEN` niemals nach GitHub hochladen.
- Die App komprimiert das ausgewählte Foto vor dem Versand.
- Der Worker verwendet bei der OpenAI Responses API `store: false`.
- Die Tierwiedererkennung läuft lokal auf dem Gerät; dafür wird das Foto nicht an den RevierAI-KI-Server gesendet.
- Diese Beta besitzt noch keine Benutzerkonten oder individuelle Zugriffstoken. Der gemeinsame Beta-Code ist nur eine Übergangslösung.
