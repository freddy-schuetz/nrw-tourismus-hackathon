/**
 * Alles, was von der konkreten n8n-Instanz abhängt — an einer Stelle.
 *
 * Warum es diese Datei gibt: Data-Table-IDs standen vorher an neun Stellen in
 * drei Bauskripten, die Credential-ID an einer zehnten. Auf einer NEUEN
 * n8n-Instanz existiert keine davon. Wer umzieht, müsste sie von Hand suchen
 * und ersetzen — genau die Art Arbeit, bei der man eine übersieht.
 *
 * Zwei Dateien, beide NICHT im Repo (sie gelten nur für eine Instanz; eine
 * eingecheckte Fassung würde nach einem Umzug still auf die alte zeigen):
 *
 *   tabellen.json      ← erzeugt von baue-tabellen.js
 *   credentials.json   ← von Hand, weil Credentials über die n8n-API nicht
 *                        auflistbar sind (GET /api/v1/credentials → 403)
 *
 * Vorlage und Anleitung: credentials.json.example und docs/uebergabe.md.
 */

const fs = require('fs');
const path = require('path');

const PFAD_TABELLEN = path.join(__dirname, 'tabellen.json');
const PFAD_CREDENTIALS = path.join(__dirname, 'credentials.json');

const TABELLEN_GEBRAUCHT = ['oz_faelle', 'oz_antworten', 'oz_ergebnisse', 'oz_zustaendige'];

function abbruch(text) {
  console.error('\n' + text + '\n');
  process.exit(1);
}

/**
 * IDs der Data Tables.
 * @returns {{oz_faelle: string, oz_antworten: string, oz_ergebnisse: string, oz_zustaendige: string}}
 */
function ladeTabellen() {
  if (!fs.existsSync(PFAD_TABELLEN)) {
    abbruch(
      'oz-logik/tabellen.json fehlt.\n'
      + 'Die Data Tables dieser n8n-Instanz sind noch nicht bekannt. Erst anlegen:\n'
      + '  node oz-logik/baue-tabellen.js',
    );
  }

  const ids = JSON.parse(fs.readFileSync(PFAD_TABELLEN, 'utf8'));
  const fehlt = TABELLEN_GEBRAUCHT.filter((n) => !ids[n]);
  if (fehlt.length) {
    abbruch(
      'oz-logik/tabellen.json ist unvollständig — es fehlt: ' + fehlt.join(', ') + '\n'
      + 'Neu erzeugen mit:  node oz-logik/baue-tabellen.js',
    );
  }
  return ids;
}

/**
 * Credentials der Instanz.
 *
 * @param {string} schluessel z. B. 'ki' oder 'smtp'
 * @param {{pflicht?: boolean}} [optionen] pflicht=false gibt null zurück statt
 *        abzubrechen — für Bausteine, die ohne das Credential bloß weniger tun.
 * @returns {{id: string, name: string}|null}
 */
function ladeCredential(schluessel, optionen = {}) {
  const pflicht = optionen.pflicht !== false;

  if (!fs.existsSync(PFAD_CREDENTIALS)) {
    if (!pflicht) return null;
    abbruch(
      'oz-logik/credentials.json fehlt.\n'
      + 'Vorlage kopieren und ausfüllen:\n'
      + '  cp oz-logik/credentials.json.example oz-logik/credentials.json\n'
      + 'Die ID eines Credentials steht in n8n in der Adresszeile, wenn man es öffnet:\n'
      + '  .../home/credentials/<ID>\n'
      + 'Siehe docs/uebergabe.md.',
    );
  }

  const alle = JSON.parse(fs.readFileSync(PFAD_CREDENTIALS, 'utf8'));
  const c = alle[schluessel];

  if (!c || !c.id || String(c.id).startsWith('HIER-')) {
    if (!pflicht) return null;
    abbruch(
      'In oz-logik/credentials.json fehlt der Eintrag "' + schluessel + '" (oder die ID ist noch der Platzhalter).\n'
      + 'Die ID steht in n8n in der Adresszeile des geöffneten Credentials.',
    );
  }

  return { id: String(c.id), name: String(c.name || schluessel) };
}

module.exports = { ladeTabellen, ladeCredential, PFAD_TABELLEN, PFAD_CREDENTIALS };
