# Learnweb Monitoring

Ein kleines Skript, das regelmäßig überprüft, ob das Learnweb normal erreichbar ist, und im Mattermost alarmiert falls nicht.

Die Statusseite ist erreichbar unter https://justusdieckmann.de/lw-status/ (TODO ersetzen).

### Genaue Funktionsweise

Es wird generell überprüft, dass https://www.uni-muenster.de/LearnWeb/learnweb2/ mit einem non-error HTTP Response code antwortet.
Anschließend loggt sich der Bot als Testnutzer ein, geht in den justus_test-Kurs und stellt sicher, dass es "Lieber bot, alles funktioniert perfekt!" auf der Seite findet.

Dies passiert im Normalfall alle 5 min. Falls ein Test scheitert, wird 10 Minuten lang jede Minute getestet. Falls ein weiterer Test davon scheitert, wird durch eine Nachricht in Mattermost alarmiert. Ab dann wird alle 2 Minuten getestet, bis 10 Tests nacheinander erfolgreich sind. Dann wird eine Entwarnung geschickt, und der Bot kehrt zum Normalzustand zurück.

Wenn sich das Learnweb im Maintenance-Mode befindet, zählt das weder als erfolgreicher, noch als fehlgeschlagener Test, sodass dadurch keine Warnungen oder Entwarungen ausgelöst werden.
