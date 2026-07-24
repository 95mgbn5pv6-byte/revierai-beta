# RevierAI Beta 0.2 – KI-Altersschätzung und Tierwiedererkennung

Diese Version erweitert die funktionale Beta 0.1 um zwei echte KI-Pfade.

## Neu in Beta 0.2

### Lokale Tierwiedererkennung

- TensorFlow.js und MobileNet laufen innerhalb der iPhone-App.
- Aus jedem bestätigten Wildfoto wird ein numerischer Bild-Fingerabdruck erzeugt.
- Neue Fotos werden mit den bestätigten Lernfotos der Tierprofile verglichen.
- Das Foto wird für diesen Vergleich nicht an den RevierAI-KI-Server gesendet.
- Pro Profil werden maximal zehn Referenz-Embeddings lokal gespeichert.

### KI-Altersschätzung

- Das Foto wird vor dem Versand auf maximal 1600 Pixel verkleinert und als JPEG komprimiert.
- Ein Cloudflare Worker schützt den OpenAI-API-Schlüssel.
- Die OpenAI Responses API analysiert Wildart, Geschlecht, Altersbereich, sichtbare Merkmale, Bildqualität und Grenzen.
- Die Ausgabe ist strukturiert und wird als unverbindliche jagdliche Schätzung gespeichert.

## Wichtige fachliche Grenze

Die Altersschätzung ist ein multimodales KI-Urteil und kein wissenschaftlich validiertes, wildartspezifisch trainiertes Altersmodell. Die automatische Wiedererkennung verwendet zunächst ein allgemeines Bildmodell. Beide Funktionen benötigen die Bestätigung eines erfahrenen Jägers.

## Build über Codemagic

Der Workflow kopiert beim Build lokal in die App:

- Leaflet
- TensorFlow.js
- MobileNet

Anschließend erzeugt Capacitor 8 das iOS-Projekt und Codemagic lädt die IPA zu TestFlight hoch.

## Repository-Struktur

```text
codemagic.yaml
package.json
capacitor.config.ts
www/
  index.html
  config.js
  styles.css
  app.js
resources/
scripts/
ai-worker/
  src/index.js
  wrangler.jsonc
  package.json
docs/
```

## Reihenfolge

1. Inhalt dieses Ordners direkt ins GitHub-Repository hochladen.
2. Alte `package-lock.json` bei Problemen löschen; der Workflow nutzt `npm install`.
3. Codemagic-Build starten.
4. KI-Worker nach `docs/KI_SERVER_EINRICHTEN_WINDOWS.md` bereitstellen.
5. Worker-URL und Beta-Zugangscode in der App eintragen.
