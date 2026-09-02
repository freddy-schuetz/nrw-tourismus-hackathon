/**
 * Legt die vier Data Tables des Öffnungszeiten-Abgleichs in einer n8n-Instanz an
 * und schreibt ihre IDs nach oz-logik/tabellen.json.
 *
 * Warum es dieses Skript gibt: Die IDs der Data Tables standen vorher an neun
 * Stellen in drei Bauskripten. Auf einer NEUEN n8n-Instanz existieren sie nicht
 * — man müsste vier Tabellen samt aller Spalten von Hand anlegen, die neuen IDs
 * heraussuchen und überall ersetzen. Genau die Art Arbeit, bei der man einen
 * Eintrag übersieht.
 *
 * Jetzt lesen die Bauskripte die IDs aus tabellen.json, und diese Datei erzeugt
 * sie. Ein Umzug ist damit: .mcp.json auf die neue Instanz zeigen lassen, dieses
 * Skript, dann die drei Workflow-Skripte. Siehe docs/uebergabe.md.
 *
 * Das Skript ist wiederholbar: bestehende Tabellen werden am NAMEN erkannt und
 * nur um fehlende Spalten ergänzt. Es löscht nie etwas.
 *
 * Ausführen:
 *   node oz-logik/baue-tabellen.js            → anlegen/ergänzen und IDs schreiben
 *   node oz-logik/baue-tabellen.js --pruefen  → nur vergleichen, nichts ändern
 *   node oz-logik/baue-tabellen.js --praefix probe_   → unter anderem Namen anlegen
 *
 * `--praefix` dient dazu, den Anlege-Pfad in einer Instanz zu testen, in der die
 * echten Tabellen schon stehen. Die IDs werden dann NICHT nach tabellen.json
 * geschrieben, damit der laufende Betrieb unberührt bleibt.
 */

const fs = require('fs');
const path = require('path');

const HIER = __dirname;
const ZIEL = path.join(HIER, 'tabellen.json');

const konfig = JSON.parse(fs.readFileSync(path.join(HIER, '..', '.mcp.json'), 'utf8'));
const env = konfig.mcpServers['n8n-mcp'].env;
const BASIS = env.N8N_API_URL.replace(/\/$/, '');
const KOPF = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };

const NUR_PRUEFEN = process.argv.includes('--pruefen');

// Nur zum Testen des Anlege-Pfads in einer Instanz, in der die echten Tabellen
// schon stehen. Mit Präfix wird tabellen.json bewusst NICHT geschrieben.
const PRAEFIX = (() => {
  const i = process.argv.indexOf('--praefix');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : '';
})();

/**
 * Die verbindliche Fassung der Tabellen.
 *
 * Reihenfolge = Spaltenreihenfolge in n8n. Die Typen sind bewusst knapp:
 * `date` nur, wo wirklich ein Zeitpunkt steht, sonst `string` — n8n lehnt eine
 * Zeile ab, wenn ein date-Feld einen unparsbaren Wert bekommt, und das würde
 * einen ganzen Prüflauf kosten.
 */
const TABELLEN = {
  // Die Arbeitsliste: ein Fall je Datensatz, den jemand ansehen soll.
  oz_faelle: [
    ['datensatz_id', 'string'],   // ID in destination.data — der Schlüssel für den Upsert
    ['titel', 'string'],
    ['ort', 'string'],
    ['prio', 'number'],           // 1 = leer (öffentlich "immer geöffnet"), 2 = Widerspruch
    ['grund', 'string'],
    ['weg', 'string'],            // anfrage | direkt-vorschlag | vorschlag-pruefen
    ['variante_a', 'string'],     // aus destination.data
    ['variante_b', 'string'],     // aus dem eigenen Freitext
    ['variante_c', 'string'],     // von der Betriebs-Webseite
    ['kuechenzeiten', 'string'],
    ['gaeste_link', 'string'],
    ['bearbeitungslink', 'string'],           // bleibt leer, siehe docs
    ['bearbeitungslink_gueltig_bis', 'date'],
    ['status', 'string'],         // neu | entschieden | bestaetigt | eskalation | unbeantwortet
    ['frist', 'date'],
    ['angelegt_am', 'date'],
    ['variante_c_quelle', 'string'],  // schema.org oder KI-gelesen
    ['kueche_fragen', 'boolean'],     // Zusatzfrage stellen?
  ],

  // Ein Zugang je Person und Fall. Das Token ist der Schlüssel.
  oz_antworten: [
    ['token', 'string'],
    ['datensatz_id', 'string'],
    ['rolle', 'string'],          // gastronom | bearbeiter | ersteller | redaktion
    ['email', 'string'],
    ['status', 'string'],         // offen | beantwortet
    ['auswahl', 'string'],        // A | B | C | eigene
    ['eigene_json', 'string'],    // normalisierte Fassung als Text
    ['gesendet_am', 'date'],
    ['beantwortet_am', 'date'],
    ['kueche_json', 'string'],    // Antwort auf die Küchen-Zusatzfrage
  ],

  // Was entschieden wurde. Solange die Schreibrechte fehlen, ist das die
  // geprüfte Änderungsliste.
  oz_ergebnisse: [
    ['datensatz_id', 'string'],
    ['vorher', 'string'],
    ['nachher', 'string'],
    ['konfidenz', 'string'],      // hoch | mittel | keine
    ['entscheidungsgrund', 'string'],
    ['entschieden_am', 'date'],
    ['geschrieben', 'boolean'],   // wurde es tatsächlich nach destination.data geschrieben?
    ['hinweis', 'string'],
    ['kueche_nachher', 'string'],
  ],

  // Wer den Datensatz pflegt. Kommt aus einem Export des Backends, weil die
  // Lese-Schnittstelle diese Felder nicht liefert (author ist in 0 von 600
  // Datensätzen gefüllt). Wird NICHT von diesem Skript gefüllt.
  oz_zustaendige: [
    ['datensatz_id', 'string'],
    ['name', 'string'],
    ['ort', 'string'],
    ['bearbeiter_email', 'string'],
    ['ersteller_email', 'string'],
    ['letzte_menschliche_pflege', 'date'],
    ['zuletzt_technisch', 'boolean'],
  ],
};

async function ruf(pfad, optionen = {}) {
  const r = await fetch(BASIS + pfad, { headers: KOPF, ...optionen });
  const text = await r.text();
  let daten = null;
  try { daten = text ? JSON.parse(text) : null; } catch (e) { /* HTML-Fehlerseite */ }
  if (!r.ok) {
    throw new Error('HTTP ' + r.status + ' auf ' + pfad + ': ' + text.slice(0, 200));
  }
  return daten;
}

/** Alle Tabellen der Instanz holen — über alle Seiten. */
async function vorhandene() {
  const alle = [];
  let cursor = null;
  do {
    const j = await ruf('/api/v1/data-tables' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    alle.push(...(j.data || []));
    cursor = j.nextCursor || null;
  } while (cursor);
  return alle;
}

(async () => {
  console.log('Instanz: ' + BASIS);
  if (NUR_PRUEFEN) console.log('Nur prüfen — es wird nichts geändert.\n');

  const da = await vorhandene();
  const ids = {};
  let angelegt = 0;
  let ergaenzt = 0;
  let fehlend = 0;

  for (const [schluessel, spalten] of Object.entries(TABELLEN)) {
    const name = PRAEFIX + schluessel;
    const vorhanden = da.find((t) => t.name === name);

    if (!vorhanden) {
      if (NUR_PRUEFEN) {
        console.log('FEHLT   ' + name + '  (' + spalten.length + ' Spalten)');
        fehlend++;
        continue;
      }
      const neu = await ruf('/api/v1/data-tables', {
        method: 'POST',
        body: JSON.stringify({
          name,
          columns: spalten.map(([n, typ]) => ({ name: n, type: typ })),
        }),
      });
      ids[schluessel] = neu.id;
      angelegt++;
      console.log('ANGELEGT ' + name.padEnd(16) + neu.id + '  (' + spalten.length + ' Spalten)');
      continue;
    }

    ids[schluessel] = vorhanden.id;
    const haben = new Set((vorhanden.columns || []).map((c) => c.name));
    const fehlt = spalten.filter(([n]) => !haben.has(n));

    if (!fehlt.length) {
      console.log('ok       ' + name.padEnd(16) + vorhanden.id);
      continue;
    }

    if (NUR_PRUEFEN) {
      console.log('SPALTEN  ' + name.padEnd(16) + vorhanden.id
        + '  fehlt: ' + fehlt.map(([n]) => n).join(', '));
      fehlend++;
      continue;
    }

    // Nur ergänzen, nie löschen: eine Spalte, die in der Instanz existiert und
    // hier fehlt, kann Daten enthalten, die jemand braucht.
    for (const [n, typ] of fehlt) {
      await ruf('/api/v1/data-tables/' + vorhanden.id + '/columns', {
        method: 'POST',
        body: JSON.stringify({ name: n, type: typ }),
      });
      ergaenzt++;
    }
    console.log('ERGÄNZT  ' + name.padEnd(16) + vorhanden.id
      + '  +' + fehlt.map(([n]) => n).join(', '));
  }

  // Spalten, die es in der Instanz gibt, aber nicht hier — nur melden.
  for (const [name] of Object.entries(TABELLEN)) {
    const v = da.find((t) => t.name === PRAEFIX + name);
    if (!v) continue;
    const soll = new Set(TABELLEN[name].map(([n]) => n));
    const zusatz = (v.columns || []).map((c) => c.name).filter((n) => !soll.has(n));
    if (zusatz.length) console.log('         ' + name + ': zusätzlich in der Instanz: ' + zusatz.join(', '));
  }

  if (NUR_PRUEFEN) {
    console.log('\n' + (fehlend === 0
      ? '✓ Die Instanz passt zur verbindlichen Fassung.'
      : '✗ ' + fehlend + ' Tabelle(n) unvollständig — ohne --pruefen ausführen.'));
    process.exit(fehlend === 0 ? 0 : 1);
  }

  if (PRAEFIX) {
    // Präfix-Lauf: der laufende Betrieb bleibt unberührt.
    console.log('\nPräfix-Lauf — tabellen.json wurde NICHT geschrieben.');
    console.log(JSON.stringify(ids, null, 2));
    console.log('\n' + angelegt + ' angelegt, ' + ergaenzt + ' Spalte(n) ergänzt.');
    console.log('Diese Testtabellen anschließend in n8n löschen.');
    return;
  }

  fs.writeFileSync(ZIEL, JSON.stringify(ids, null, 2) + '\n');
  console.log('\nGeschrieben: ' + path.relative(path.join(HIER, '..'), ZIEL));
  console.log(angelegt + ' angelegt, ' + ergaenzt + ' Spalte(n) ergänzt.');
  console.log('\nWeiter mit:');
  console.log('  node oz-logik/baue-oz1-workflow.js');
  console.log('  node oz-logik/baue-oz2-workflow.js');
  console.log('  node oz-logik/baue-oz3-workflow.js');
})().catch((e) => {
  console.error('\nFehlgeschlagen: ' + e.message);
  process.exit(1);
});
