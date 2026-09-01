/**
 * Erzeugt den n8n-Workflow „OZ-3 Entscheiden & Abschließen".
 *
 * Nimmt die Fälle aus `oz_faelle` und die Rückmeldungen aus `oz_antworten`,
 * entscheidet nach Konsens-Regeln und schreibt das Ergebnis nach `oz_ergebnisse`.
 *
 * Der Code-Node braucht hier NICHT die Normalisierungs-Bibliothek: OZ-2 legt jede
 * Antwort schon in derselben Schreibweise ab wie die Fassungen aus der Datenbank
 * ("Mo geschlossen · Di 08:00–18:30 · …"). Verglichen wird also Text gegen Text.
 *
 * Ausführen:  node oz-logik/baue-oz3-workflow.js [--update <workflowId>]
 */

const fs = require('fs');
const path = require('path');

const HIER = __dirname;
const konfig = JSON.parse(fs.readFileSync(path.join(HIER, '..', '.mcp.json'), 'utf8'));
const env = konfig.mcpServers['n8n-mcp'].env;
const BASIS = env.N8N_API_URL.replace(/\/$/, '');
const KEY = env.N8N_API_KEY;

const TABELLE_FAELLE = 'ZqtInTqjOEJBFtba';
const TABELLE_ANTWORTEN = 'ugZId5KxR3sRnsOe';
const TABELLE_ERGEBNISSE = '21sGs7vXDCiVDKhF';

const tabelle = (id) => ({ __rl: true, mode: 'id', value: id });

const CODE_ENTSCHEIDEN = `
// =============================================================================
// OZ-3 — Entscheiden
//
// Regeln (aus mein-use-case.md):
//   alle einig                      → übernehmen, Konfidenz hoch
//   Mehrheit einig                  → übernehmen, Konfidenz mittel
//   Widerspruch mit Gastronom dabei → der Gastronom gewinnt (er kennt seinen
//                                     Betrieb), Konfidenz mittel
//   Widerspruch ohne Gastronom      → Eskalation, ein Mensch entscheidet
//   niemand geantwortet, Frist um   → Status "unbeantwortet", KEIN Dauer-Nachfassen
//   Direkt-Vorschlag                → übernehmen, Konfidenz hoch
//   Vorschlag mit Warnung           → Eskalation
//
// Solange die Frist läuft und noch nicht alle geantwortet haben, wird bewusst
// NICHT entschieden — der Fall bleibt liegen und kommt beim nächsten Lauf wieder.
// =============================================================================

const faelle = $('Fälle lesen').all().map((i) => i.json).filter((f) => f && f.datensatz_id);
const antworten = $('Antworten lesen').all().map((i) => i.json).filter((a) => a && a.token);

const jetzt = new Date();
const ROLLE_TEXT = { gastronom: 'Gastronom', ersteller: 'Ersteller', bearbeiter: 'Bearbeiter' };

/** Welche Fassung hat diese Person gewählt? Gibt den normalisierten Text zurück. */
function gewaehlteFassung(antwort, fall) {
  if (antwort.auswahl === 'eigene') return (antwort.eigene_json || '').trim();
  if (antwort.auswahl === 'A') return (fall.variante_a || '').trim();
  if (antwort.auswahl === 'B') return (fall.variante_b || '').trim();
  if (antwort.auswahl === 'C') return (fall.variante_c || '').trim();
  return '';
}

const ergebnisse = [];

for (const fall of faelle) {
  // Schon abgeschlossene Fälle nicht erneut anfassen.
  if (fall.status && fall.status !== 'neu' && fall.status !== 'entscheidungsreif') continue;

  const meine = antworten.filter((a) => String(a.datensatz_id) === String(fall.datensatz_id));
  const beantwortet = meine.filter((a) => a.status === 'beantwortet');
  const fristAbgelaufen = fall.frist ? new Date(fall.frist) < jetzt : false;

  let nachher = '';
  let konfidenz = 'keine';
  let grund = '';
  let neuerStatus = 'entschieden';
  const hinweise = [];

  if (fall.weg === 'direkt-vorschlag') {
    nachher = (fall.variante_b || '').trim();
    konfidenz = 'hoch';
    grund = 'Direkt-Vorschlag aus dem eigenen Freitext des Datensatzes — keine Rückfrage nötig';
    hinweise.push('im Prüfbericht ausweisen: automatisch übernommen');
  } else if (fall.weg === 'vorschlag-pruefen') {
    konfidenz = 'keine';
    grund = 'Freitext lesbar, aber die Zeiten überlappen — ein Mensch muss den Vorschlag prüfen';
    neuerStatus = 'eskalation';
    nachher = (fall.variante_b || '').trim();
  } else {
    // Weg "anfrage": auf Rückmeldungen warten.
    const alleDa = meine.length > 0 && beantwortet.length === meine.length;
    if (!alleDa && !fristAbgelaufen) continue; // noch nicht dran

    if (beantwortet.length === 0) {
      konfidenz = 'keine';
      grund = 'Frist abgelaufen, niemand hat geantwortet';
      neuerStatus = 'unbeantwortet';
      hinweise.push('einmal erinnern, danach nicht weiter nachfassen');
    } else {
      // Fassungen gruppieren — gleiche Schreibweise heißt gleiche Aussage,
      // weil OZ-2 alles normalisiert ablegt.
      const gruppen = new Map();
      for (const a of beantwortet) {
        const text = gewaehlteFassung(a, fall);
        if (!text) continue;
        if (!gruppen.has(text)) gruppen.set(text, []);
        gruppen.get(text).push(a);
      }

      const rollen = beantwortet.map((a) => ROLLE_TEXT[a.rolle] || a.rolle).join(', ');
      hinweise.push('geantwortet: ' + rollen + ' (' + beantwortet.length + ' von ' + meine.length + ')');
      if (fristAbgelaufen && !alleDa) hinweise.push('nach Fristablauf entschieden');

      if (gruppen.size === 0) {
        konfidenz = 'keine';
        grund = 'Rückmeldungen enthielten keine verwertbare Fassung';
        neuerStatus = 'eskalation';
      } else if (gruppen.size === 1) {
        nachher = [...gruppen.keys()][0];
        if (alleDa) {
          konfidenz = 'hoch';
          grund = 'alle Beteiligten sind sich einig';
        } else {
          konfidenz = 'mittel';
          grund = beantwortet.length + ' von ' + meine.length + ' haben geantwortet und sind sich einig';
        }
      } else {
        // Widerspruch. Der Gastronom kennt seinen Betrieb.
        const vomGastronom = beantwortet.filter((a) => a.rolle === 'gastronom');
        const gastroFassungen = new Set(
          vomGastronom.map((a) => gewaehlteFassung(a, fall)).filter(Boolean),
        );
        const sortiert = [...gruppen.entries()].sort((a, b) => b[1].length - a[1].length);

        if (gastroFassungen.size > 1) {
          // Mehrere Rückmeldungen aus dem Betrieb, die sich untereinander
          // widersprechen. Dann gibt es keine Instanz mehr, die entscheidet —
          // das muss ein Mensch klären.
          konfidenz = 'keine';
          grund = 'mehrere Rückmeldungen aus dem Betrieb widersprechen sich';
          neuerStatus = 'eskalation';
          hinweise.push('Fassungen des Betriebs: ' + [...gastroFassungen].map((t) => t.slice(0, 60)).join(' || '));
        } else if (gastroFassungen.size === 1) {
          nachher = [...gastroFassungen][0];
          konfidenz = 'mittel';
          grund = 'Widerspruch zwischen den Rückmeldungen — die Angabe des Gastronomen zählt';
          hinweise.push(gruppen.size + ' verschiedene Fassungen gemeldet');
        } else if (sortiert[0][1].length > sortiert[1][1].length) {
          nachher = sortiert[0][0];
          konfidenz = 'mittel';
          grund = 'Widerspruch, aber eine Mehrheit von ' + sortiert[0][1].length
            + ' von ' + beantwortet.length;
        } else {
          konfidenz = 'keine';
          grund = 'Widerspruch ohne Mehrheit und ohne Angabe des Gastronomen';
          neuerStatus = 'eskalation';
          hinweise.push('Fassungen: ' + [...gruppen.keys()].map((t) => t.slice(0, 60)).join(' || '));
        }
      }
    }
  }

  if (neuerStatus === 'entschieden' && !nachher) {
    neuerStatus = 'eskalation';
    konfidenz = 'keine';
    grund = grund || 'keine übernehmbare Fassung ermittelbar';
  }

  // Ändert sich gar nichts, ist der Fall erledigt — ohne Schreibvorgang.
  const unveraendert = nachher && nachher === (fall.variante_a || '').trim();
  if (unveraendert) {
    neuerStatus = 'bestaetigt';
    grund = grund + ' — bestätigt den bestehenden Eintrag, nichts zu ändern';
  }

  ergebnisse.push({
    datensatz_id: String(fall.datensatz_id),
    titel: fall.titel,
    vorher: (fall.variante_a || '').trim(),
    nachher,
    konfidenz,
    entscheidungsgrund: grund,
    entschieden_am: jetzt.toISOString(),
    // Geschrieben wird erst durch oz-schreiben — dafür fehlen noch die
    // quickedit-Rechte. Bis dahin ist dies die geprüfte Änderungsliste.
    geschrieben: false,
    hinweis: hinweise.join(' · '),
    neuer_status: neuerStatus,
    zu_aendern: !unveraendert && neuerStatus === 'entschieden',
  });
}

return ergebnisse.map((e) => ({ json: e }));`;

const nodes = [
  {
    id: 'trigger-manuell', name: 'Manuell starten', type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1, position: [-420, -60], parameters: {},
  },
  {
    id: 'trigger-plan', name: 'Täglich früh', type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2, position: [-420, 120],
    parameters: { rule: { interval: [{ field: 'days', triggerAtHour: 7, triggerAtMinute: 0 }] } },
  },
  {
    id: 'faelle', name: 'Fälle lesen', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [-180, 30], alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: tabelle(TABELLE_FAELLE),
      filters: { conditions: [] }, returnAll: true,
    },
  },
  {
    id: 'antworten', name: 'Antworten lesen', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [60, 30], alwaysOutputData: true, executeOnce: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: tabelle(TABELLE_ANTWORTEN),
      filters: { conditions: [] }, returnAll: true,
    },
  },
  {
    id: 'entscheiden', name: 'Entscheiden', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [300, 30], parameters: { mode: 'runOnceForAllItems', jsCode: CODE_ENTSCHEIDEN },
  },
  {
    id: 'ergebnis', name: 'Ergebnis festhalten', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [540, 30],
    parameters: {
      resource: 'row', operation: 'insert', dataTableId: tabelle(TABELLE_ERGEBNISSE),
      columns: {
        mappingMode: 'defineBelow',
        value: Object.fromEntries([
          'datensatz_id', 'vorher', 'nachher', 'konfidenz',
          'entscheidungsgrund', 'entschieden_am', 'geschrieben', 'hinweis',
        ].map((s) => [s, '={{ $json.' + s + ' }}'])),
        matchingColumns: [],
        schema: [],
      },
    },
  },
  {
    id: 'abschliessen', name: 'Fall abschließen', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [780, 30],
    parameters: {
      resource: 'row', operation: 'update', dataTableId: tabelle(TABELLE_FAELLE),
      filters: {
        conditions: [{
          keyName: 'datensatz_id', condition: 'eq',
          keyValue: '={{ $json.datensatz_id }}',
        }],
      },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: "={{ $('Entscheiden').itemMatching($itemIndex).json.neuer_status }}" },
        matchingColumns: [],
        schema: [],
      },
    },
  },
];

const notiz = (name, x, y, w, h, farbe, text) => ({
  id: 'doku-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name: 'Doku: ' + name,
  type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [x, y],
  parameters: { color: farbe, width: w, height: h, content: text },
});

nodes.push(
  notiz('Uebersicht', -800, -400, 460, 300, 4, `## OZ-3 — Entscheiden & Abschließen

Läuft täglich um 7:00 und nimmt sich die Fälle, die **entscheidungsreif** sind: alle haben geantwortet, oder die Frist ist abgelaufen.

Solange die Frist läuft und noch Rückmeldungen fehlen, wird **bewusst nicht** entschieden — der Fall bleibt liegen und kommt beim nächsten Lauf wieder.

**Ergebnis:** eine Zeile in \`oz_ergebnisse\` mit Vorher, Nachher, Konfidenz und Begründung. Der Fall in \`oz_faelle\` bekommt einen Endstatus.

**Geschrieben wird hier noch nichts.** Das übernimmt später \`oz-schreiben\`, sobald die quickedit-Rechte da sind. Bis dahin ist \`oz_ergebnisse\` die geprüfte Änderungsliste.`),

  notiz('Regeln', 240, 260, 440, 400, 3, `### Die Entscheidungsregeln

| Lage | Ergebnis | Konfidenz |
|---|---|---|
| alle einig | übernehmen | **hoch** |
| Mehrheit einig | übernehmen | mittel |
| Widerspruch, Gastronom dabei | **Gastronom gewinnt** | mittel |
| Widerspruch ohne Gastronom | Eskalation | keine |
| niemand geantwortet, Frist um | "unbeantwortet" | keine |
| Direkt-Vorschlag | übernehmen | **hoch** |
| Vorschlag mit Warnung | Eskalation | keine |

**Warum der Gastronom gewinnt:** er kennt seinen Betrieb. Die Redaktion kennt den Datensatz.

**Kein Dauer-Nachfassen.** Antwortet niemand, gibt es eine Erinnerung — danach Ruhe. Sonst wird der Ablauf zum Spam-Absender und niemand liest die nächste Mail.

**Bestätigt der Konsens den bestehenden Eintrag**, endet der Fall als \`bestaetigt\` — ohne Schreibvorgang. Auch das ist ein Ergebnis: die Daten waren richtig.

⚠️ Nicht hier bearbeiten: \`node oz-logik/baue-oz3-workflow.js --update <id>\``),

  notiz('Vergleich', 240, 690, 440, 170, 7, `### Warum hier Text gegen Text verglichen wird

\`OZ-2\` legt **jede** Rückmeldung in derselben Schreibweise ab wie die Fassungen aus der Datenbank:

\`Mo geschlossen · Di 08:00–18:30 · …\`

Auch eine freie Eingabe wird vorher normalisiert. Zwei gleiche Aussagen ergeben deshalb denselben Text — und der Konsens lässt sich durch Gruppieren feststellen, ohne die Zeiten erneut zu parsen.`),
);

const verbindung = (ziel) => [{ node: ziel, type: 'main', index: 0 }];
const connections = {
  'Manuell starten': { main: [verbindung('Fälle lesen')] },
  'Täglich früh': { main: [verbindung('Fälle lesen')] },
  'Fälle lesen': { main: [verbindung('Antworten lesen')] },
  'Antworten lesen': { main: [verbindung('Entscheiden')] },
  Entscheiden: { main: [verbindung('Ergebnis festhalten')] },
  'Ergebnis festhalten': { main: [verbindung('Fall abschließen')] },
};

const workflow = {
  name: 'OZ-3 Entscheiden & Abschließen',
  settings: { executionOrder: 'v1' },
  nodes,
  connections,
};

(async () => {
  const idx = process.argv.indexOf('--update');
  const id = idx >= 0 ? process.argv[idx + 1] : null;
  const res = await fetch(`${BASIS}/api/v1/workflows${id ? '/' + id : ''}`, {
    method: id ? 'PUT' : 'POST',
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('HTTP', res.status);
    console.error(text.slice(0, 900));
    process.exit(1);
  }
  const w = JSON.parse(text);
  console.log(`${id ? 'Aktualisiert' : 'Angelegt'}: ${w.name}`);
  console.log(`Workflow-ID: ${w.id}`);
  console.log(`Nodes: ${(w.nodes || []).length}`);
})();
