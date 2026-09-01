/**
 * Baut aus normalisieren.js + webseite.js EINE Datei, die sich in einen n8n Code Node
 * einfügen lässt.
 *
 * Hintergrund: n8n Code Nodes können keine lokalen Dateien einbinden — `require('./x')`
 * schlägt dort fehl. Statt den Code doppelt zu pflegen, wird er hier zusammengesetzt.
 * Quelle der Wahrheit bleiben die beiden Einzeldateien; diese Datei erzeugt nur die
 * Kopiervorlage neu.
 *
 * Ausführen:  node oz-logik/baue-n8n-bundle.js
 */

const fs = require('fs');
const path = require('path');

const HIER = __dirname;
const ZIEL = path.join(HIER, 'dist', 'n8n-oz-code.js');

/** Entfernt den module.exports-Block am Dateiende. */
function ohneExports(quelle) {
  const i = quelle.indexOf('module.exports');
  return i === -1 ? quelle : quelle.slice(0, i).trimEnd();
}

/** Entfernt die require-Zeile auf das Nachbarmodul. */
function ohneRequire(quelle) {
  return quelle.replace(/^const N = require\(['"]\.\/normalisieren['"]\);\s*$/m, '');
}

/** Namen, die eine Datei auf oberster Ebene deklariert. */
function deklarierteNamen(quelle) {
  const namen = new Set();
  const re = /^(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(quelle)) !== null) namen.add(m[1]);
  return namen;
}

/**
 * Im Code Node teilen sich beide Dateien EINEN Namensraum. Deklariert jede
 * denselben Namen, gewinnt stillschweigend die zweite — und der Code tut etwas
 * anderes als lokal getestet.
 *
 * Genau das ist am 31.08.2026 passiert: beide Dateien hatten ein `hhmm`, einmal
 * Minuten → "HH:MM", einmal umgekehrt. `alsText()` lieferte dann "null–null".
 * Deshalb bricht der Bau hier ab, statt eine kaputte Vorlage zu erzeugen.
 */
function pruefeKollisionen(a, b) {
  const gemeinsam = [...deklarierteNamen(a)].filter((n) => deklarierteNamen(b).has(n));
  if (gemeinsam.length > 0) {
    throw new Error(
      `Namenskollision zwischen normalisieren.js und webseite.js: ${gemeinsam.join(', ')}\n`
      + 'Im n8n Code Node teilen sich beide EINEN Namensraum — einen der Namen umbenennen.',
    );
  }
}

const normalisierenRoh = fs.readFileSync(path.join(HIER, 'normalisieren.js'), 'utf8');
const webseiteRoh = fs.readFileSync(path.join(HIER, 'webseite.js'), 'utf8');

const normalisieren = ohneExports(normalisierenRoh);
const webseite = ohneRequire(ohneExports(webseiteRoh));

pruefeKollisionen(normalisieren, webseite);

const KOPF = `/* =============================================================================
 * ÖFFNUNGSZEITEN-ABGLEICH — Kopiervorlage für einen n8n Code Node
 *
 * ⚠️  NICHT HIER BEARBEITEN. Diese Datei wird erzeugt aus:
 *       oz-logik/normalisieren.js  (Quelle A: timeIntervals, Quelle B: Freitext, Vergleich)
 *       oz-logik/webseite.js       (Quelle C: JSON-LD und Textabschnitte)
 *     Neu bauen mit:  node oz-logik/baue-n8n-bundle.js
 *
 * Erzeugt am: wird beim Bauen eingesetzt
 *
 * VERWENDUNG IM CODE NODE
 *   Das Abrufen von Webseiten übernimmt in n8n der HTTP-Request-Node, NICHT dieser Code.
 *   holeSeite() und leseWebseite() sind nur fürs lokale Testen dabei; im Code Node
 *   nimmst du das HTML aus dem vorherigen Node und rufst ausJsonLd() /
 *   textKandidaten() direkt auf.
 *
 *   Beispiel (Modus "Run Once for Each Item"):
 *
 *     const datensatz = $json;
 *     const a = ausTimeIntervals(datensatz.timeIntervals);
 *     const openings = (datensatz.texts || []).find(t => t.rel === 'openings')?.value || '';
 *     const dayoff   = (datensatz.texts || []).find(t => t.rel === 'dayoff')?.value   || '';
 *     const b = ausFreitext(openings, dayoff);
 *
 *     if (b.typ !== 'strukturiert') {
 *       return { json: { id: datensatz.id, fall: false, grund: b.typ } };
 *     }
 *     const v = vergleiche(a, b.woche);
 *     return { json: {
 *       id: datensatz.id,
 *       titel: datensatz.title,
 *       fall: !v.einig,
 *       abweichungen: v.abweichungen,
 *       varianteA: wocheAlsText(a),
 *       varianteB: wocheAlsText(b.woche),
 *     }};
 * ============================================================================= */

`;

const BRUECKE = `
/* --- Brücke: webseite.js greift über N auf die Funktionen oben zu ------------ */
const N = { TAGE, leereWoche: UNBEKANNT, ergaenze, zeitZuMinuten };

`;

const inhalt = KOPF.replace('wird beim Bauen eingesetzt', new Date().toISOString().slice(0, 10))
  + normalisieren
  + '\n'
  + BRUECKE
  + webseite
  + '\n';

fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
fs.writeFileSync(ZIEL, inhalt, 'utf8');

// Gegenprobe: lädt die erzeugte Datei und prüft, dass die Kernfunktionen laufen.
const pruefDatei = ZIEL.replace(/\.js$/, '.pruef.cjs');
fs.writeFileSync(
  pruefDatei,
  inhalt + `
const a = ausTimeIntervals([{ weekdays: ['Monday'], start: '2026-01-01T11:00:00+01:00', end: '2026-01-01T14:00:00+01:00' }]);
const b = ausFreitext('Montag 11:00 - 14:00 Uhr', '');
if (b.typ !== 'strukturiert') throw new Error('Freitext nicht erkannt: ' + b.typ);
if (!vergleiche(a, b.woche).einig) throw new Error('Vergleich falsch: ' + wocheAlsText(a) + ' vs ' + wocheAlsText(b.woche));
const j = ausJsonLd('<script type="application/ld+json">{"@type":"Restaurant","openingHoursSpecification":[{"dayOfWeek":"Monday","opens":"11:00","closes":"14:00"}]}</script>');
if (!j) throw new Error('JSON-LD nicht erkannt');
if (alsText(j.woche.Monday) !== '11:00–14:00') throw new Error('JSON-LD falsch: ' + alsText(j.woche.Monday));
console.log('Gegenprobe OK');
`,
  'utf8',
);

try {
  require(pruefDatei);
  console.log(`Gebaut: ${path.relative(process.cwd(), ZIEL)} (${(inhalt.length / 1024).toFixed(1)} kB)`);
} finally {
  fs.unlinkSync(pruefDatei);
}
