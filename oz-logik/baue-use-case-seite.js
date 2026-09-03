/**
 * Erzeugt aus der Use-Case-Präsentation eine frei zugängliche Seite.
 *
 * Warum es dieses Skript gibt: Die Präsentation existiert an zwei Stellen mit
 * unterschiedlichen Anforderungen, und ohne Generator laufen sie auseinander.
 *
 *   docs/use-case-praesentation.html      ← die Quelle, die gepflegt wird.
 *                                           Ohne <html>/<head>, weil die
 *                                           Artifact-Vorschau den Rahmen selbst
 *                                           setzt.
 *   frontend-starter/public/use-case.html ← daraus erzeugt, MIT Rahmen. Wird von
 *                                           Next.js unverändert ausgeliefert und
 *                                           ist damit ohne Anmeldung erreichbar:
 *                                           https://<deploy>/use-case.html
 *
 * Zusätzlich wird die Arbeitskopie im Scratchpad aktualisiert, aus der die
 * Artifact-Vorschau veröffentlicht wird — sie muss denselben Pfad behalten,
 * sonst bekommt das Artifact eine neue Adresse.
 *
 * Ausführen:  node oz-logik/baue-use-case-seite.js [--scratchpad <pfad>]
 */

const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'docs', 'use-case-praesentation.html');
const ZIEL = path.join(WURZEL, 'frontend-starter', 'public', 'use-case.html');

const inhalt = fs.readFileSync(QUELLE, 'utf8');

const titel = (/<title>([^<]*)<\/title>/i.exec(inhalt) || [, 'Öffnungszeiten, die stimmen'])[1];

// Die Beschreibung steht im Anriss der Seite — doppelt pflegen wäre eine
// Fehlerquelle, also wird sie von dort geholt.
const anriss = (/<p class="anriss">([\s\S]*?)<\/p>/i.exec(inhalt) || [, ''])[1]
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Die Quelle mischt Kopf-Elemente (title, link, style) und Seiteninhalt, weil
// der Artifact-Rahmen das selbst sortiert. Für eine eigenständige Datei wird
// beides getrennt — sonst bliebe <head> ungeschlossen und der Browser müsste
// raten, wo der Körper anfängt.
const trenner = inhalt.indexOf('<div class="blatt">');
if (trenner === -1) {
  console.error('Kein <div class="blatt"> gefunden — Aufbau der Quelle hat sich geändert.');
  process.exit(1);
}
const kopfTeil = inhalt.slice(0, trenner).trimEnd();
const koerperTeil = inhalt.slice(trenner).trimEnd();

const seite = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${anriss.replace(/"/g, '&quot;')}">
<meta name="robots" content="noindex">
<meta property="og:title" content="${titel.replace(/"/g, '&quot;')}">
<meta property="og:description" content="${anriss.replace(/"/g, '&quot;')}">
<meta property="og:type" content="article">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%95%90%3C/text%3E%3C/svg%3E">
<style>
  /* Den CSS-Reset stellt sonst der Artifact-Rahmen; hier das Nötigste. */
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; }
  img, svg { max-width: 100%; height: auto; }
</style>
${kopfTeil}
</head>
<body>
${koerperTeil}
</body>
</html>
`;

fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
fs.writeFileSync(ZIEL, seite);

// Arbeitskopie für die Artifact-Vorschau nachziehen, falls ein Pfad übergeben wurde.
const i = process.argv.indexOf('--scratchpad');
if (i >= 0 && process.argv[i + 1]) {
  fs.writeFileSync(process.argv[i + 1], inhalt);
  console.log('Arbeitskopie aktualisiert: ' + process.argv[i + 1]);
}

console.log('Titel   : ' + titel);
console.log('Erzeugt : ' + path.relative(WURZEL, ZIEL) + '  (' + (seite.length / 1024).toFixed(1) + ' kB)');
console.log('Erreichbar nach dem Deploy unter:  /use-case.html');
