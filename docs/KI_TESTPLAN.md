# Testplan Beta 0.2 – KI

## Vorbereitung

- KI-Server und Beta-Zugangscode in Einstellungen eintragen.
- Mindestens zwei Tierprofile derselben Wildart anlegen.
- Pro Tierprofil nach Möglichkeit 3–5 bestätigte Lernfotos speichern.

## Altersschätzung

Für jedes Testfoto dokumentieren:

- Wildart
- tatsächlich bekanntes oder später bestätigtes Alter
- KI-Altersbereich
- KI-Confidence
- Bildqualität und Perspektive
- Bewertung des Jägers: passend / zu jung / zu alt / nicht beurteilbar

Die KI gilt in dieser Beta nur als brauchbar, wenn sie einen sinnvollen Bereich und nachvollziehbare Grenzen nennt. Ein exaktes Alter ist nicht das Ziel.

## Tierwiedererkennung

Testfälle:

1. Dasselbe Tier, ähnliche Perspektive und derselbe Standort.
2. Dasselbe Tier, anderer Hintergrund.
3. Dasselbe Tier, Front- gegen Seitenaufnahme.
4. Verschiedene Tiere ähnlicher Alters- und Geweihklasse.
5. Sommer- gegen Winteraufnahme.

Für jeden Treffer notieren:

- vorgeschlagenes Profil
- Prozentwert
- richtig / falsch
- Bildqualität
- auffällige Verwechslungen

Wichtig: Das derzeitige Bildmodell ist ein allgemeines MobileNet und noch kein speziell auf Reh-, Rot- oder Gamswild trainiertes Re-Identification-Modell. Die gesammelten bestätigten Fälle sind die Grundlage für ein späteres eigenes Wildmodell.
