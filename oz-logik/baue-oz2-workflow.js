/**
 * Erzeugt den n8n-Workflow „OZ-2 Antwort" — die Gegenstelle zur Fragebogen-Seite.
 *
 * Zwei Webhooks in einem Workflow:
 *   GET  /webhook/oz-fragebogen          → liefert den Fall zu einem Token
 *   POST /webhook/oz-fragebogen-antwort  → nimmt die Rückmeldung entgegen
 *
 * Die Plausibilitätsprüfung kommt aus oz-logik/normalisieren.js (`pruefeEingabe`)
 * und ist die verbindliche Fassung — der gleichlautende Check im Browser dient nur
 * der sofortigen Rückmeldung.
 *
 * Ausführen:  node oz-logik/baue-oz2-workflow.js [--update <workflowId>]
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

const logik = (() => {
  const q = fs.readFileSync(path.join(HIER, 'normalisieren.js'), 'utf8');
  const i = q.indexOf('module.exports');
  return (i === -1 ? q : q.slice(0, i)).trimEnd();
})();

const tabelle = (id) => ({ __rl: true, mode: 'id', value: id });
const filterAuf = (spalte, wert) => ({
  conditions: [{ keyName: spalte, condition: 'eq', keyValue: wert }],
});

/** IF-Node: prüft einen Ausdruck auf „wahr". */
const wennWahr = (ausdruck) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{
      id: 'bedingung',
      leftValue: ausdruck,
      rightValue: '',
      operator: { type: 'boolean', operation: 'true', singleValue: true },
    }],
    combinator: 'and',
  },
  looseTypeValidation: true,
  options: {},
});

// --- Code: Fragebogen ausliefern ---------------------------------------------
const CODE_AUSLIEFERN = `${logik}

// =============================================================================
// Baut die Antwort für die Fragebogen-Seite. Die Funktionen oberhalb stammen 1:1
// aus oz-logik/normalisieren.js — nicht hier bearbeiten.
//
// ⚠️ Hier wird BEWUSST kein Bearbeitungslink ausgeliefert. Ein Ad-hoc-Link aus
//    destination.data ist ein Zugangsmittel; stünde er in dieser Antwort, läge er
//    im Netzwerk-Tab des Browsers. Alle Rückmeldungen laufen über den Fragebogen.
// =============================================================================

const zugang = $('Token nachsehen').first().json;
const fall = $input.first().json;

if (!fall || !fall.datensatz_id) {
  return [{ json: { status: 'unbekannt' } }];
}

const betrieb = { name: fall.titel, ort: fall.ort };
if (fall.gaeste_link) betrieb.gaesteLink = fall.gaeste_link;
// Bei leeren Öffnungszeiten zeigt der TeutoNavigator "immer geöffnet" — das ist
// der wirksamste Grund zu antworten, also sagen wir es der Person.
if (fall.prio === 1 && !fall.variante_a) betrieb.gaesteStatus = 'immer geöffnet';

if (zugang.status !== 'offen') {
  return [{ json: { status: 'beantwortet', betrieb, varianten: [] } }];
}

const QUELLEN = [
  { spalte: 'variante_a', key: 'A', quelle: 'destination.data', hinweis: 'die aktuell hinterlegten Öffnungszeiten' },
  { spalte: 'variante_b', key: 'B', quelle: 'Beschreibungstext im selben Datensatz', hinweis: '' },
  { spalte: 'variante_c', key: 'C', quelle: 'Webseite des Betriebs', hinweis: 'automatisch von der Webseite gelesen' },
];

const varianten = [];
for (const q of QUELLEN) {
  const text = fall[q.spalte];
  if (!text) continue;
  // Bei Variante C steht in der Datenbank, WIE sie gelesen wurde: maschinenlesbar
  // aus schema.org oder von der KI aus dem Fließtext. Das gehört in den
  // Fragebogen — wer eine Fassung bestätigt, soll wissen, woher sie stammt.
  const hinweis = q.key === 'C' && fall.variante_c_quelle
    ? 'automatisch gelesen — ' + fall.variante_c_quelle
    : q.hinweis;
  varianten.push({ key: q.key, quelle: q.quelle, hinweis, tage: wocheAusText(text) });
}

const frist = fall.frist
  ? new Date(fall.frist).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '';

return [{
  json: {
    status: 'offen',
    betrieb,
    rolle: zugang.rolle,
    frist,
    varianten,
    kuechenzeiten: fall.kuechenzeiten || '',
  },
}];`;

// --- Code: Antwort prüfen -----------------------------------------------------
const CODE_PRUEFEN = `${logik}

// =============================================================================
// Prüft die Rückmeldung, bevor sie gespeichert wird.
// Die Regeln stehen in pruefeEingabe() oben — verbindliche Fassung.
// =============================================================================

const zugang = $input.first().json;
const eingang = $('Antwort annehmen').first().json.body || {};
const auswahl = String(eingang.auswahl || '').trim();

if (!auswahl) {
  return [{ json: { ok: false, fehler: ['Es wurde keine Fassung ausgewählt.'], token: zugang.token } }];
}

let eigeneText = '';
let hinweise = [];

if (auswahl === 'eigene') {
  const geprueft = pruefeEingabe(eingang.eigene);
  if (!geprueft.ok) {
    return [{ json: { ok: false, fehler: geprueft.fehler, token: zugang.token } }];
  }
  eigeneText = wocheAlsText(geprueft.woche);
  hinweise = auffaelligkeiten(geprueft.woche);
} else if (!['A', 'B', 'C'].includes(auswahl)) {
  return [{ json: { ok: false, fehler: ['Unbekannte Auswahl.'], token: zugang.token } }];
}

return [{
  json: {
    ok: true,
    token: zugang.token,
    datensatz_id: zugang.datensatz_id,
    rolle: zugang.rolle,
    auswahl,
    // Bei einer freien Eingabe steht hier die normalisierte Fassung als Text —
    // dieselbe Schreibweise wie variante_a/b/c, damit OZ-3 sie direkt vergleichen kann.
    eigene_json: eigeneText,
    hinweise: hinweise.join(' · '),
    beantwortet_am: new Date().toISOString(),
  },
}];`;

const CODE_ABGELEHNT = `// Ungültiger, verbrauchter oder abgelaufener Zugang.
// Bewusst ohne Details: keine Datensatz-ID, keine Adresse, kein Hinweis darauf,
// ob es das Token überhaupt gab. Der Webhook ist öffentlich erreichbar.
return [{ json: { status: 'unbekannt' } }];`;

const CODE_BESTAETIGUNG = `const geprueft = $('Antwort prüfen').first().json;
if (!geprueft.ok) {
  return [{ json: { ok: false, fehler: geprueft.fehler } }];
}
return [{ json: { ok: true } }];`;

const CODE_ABLEHNUNG_INHALT = `const geprueft = $input.first().json;
return [{ json: { ok: false, fehler: geprueft.fehler || ['Die Angaben waren nicht plausibel.'] } }];`;

// --- Nodes --------------------------------------------------------------------
const nodes = [
  // Weg A — Fragebogen laden
  {
    id: 'wh-laden', name: 'Fragebogen laden', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: [-420, -160],
    parameters: { path: 'oz-fragebogen', httpMethod: 'GET', responseMode: 'lastNode', options: {} },
  },
  {
    id: 'token-laden', name: 'Token nachsehen', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [-180, -160], alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: tabelle(TABELLE_ANTWORTEN),
      filters: filterAuf('token', '={{ $json.query.token }}'), returnAll: false, limit: 1,
    },
  },
  {
    id: 'if-laden', name: 'Zugang gültig?', type: 'n8n-nodes-base.if', typeVersion: 2.2,
    position: [60, -160], parameters: wennWahr('={{ !!$json.token }}'),
  },
  {
    id: 'fall-laden', name: 'Fall nachsehen', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [300, -240], alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: tabelle(TABELLE_FAELLE),
      filters: filterAuf('datensatz_id', '={{ $json.datensatz_id }}'), returnAll: false, limit: 1,
    },
  },
  {
    id: 'ausliefern', name: 'Fragebogen ausliefern', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [540, -240], parameters: { mode: 'runOnceForAllItems', jsCode: CODE_AUSLIEFERN },
  },
  {
    id: 'kein-zugang', name: 'Zugang ungültig', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [300, -80], parameters: { mode: 'runOnceForAllItems', jsCode: CODE_ABGELEHNT },
  },

  // Weg B — Antwort entgegennehmen
  {
    id: 'wh-antwort', name: 'Antwort annehmen', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: [-420, 220],
    parameters: { path: 'oz-fragebogen-antwort', httpMethod: 'POST', responseMode: 'lastNode', options: {} },
  },
  {
    id: 'token-antwort', name: 'Token prüfen', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [-180, 220], alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: tabelle(TABELLE_ANTWORTEN),
      filters: filterAuf('token', '={{ $json.body.token }}'), returnAll: false, limit: 1,
    },
  },
  {
    id: 'if-antwort', name: 'Noch offen?', type: 'n8n-nodes-base.if', typeVersion: 2.2,
    position: [60, 220],
    parameters: wennWahr("={{ !!$json.token && $json.status === 'offen' }}"),
  },
  {
    id: 'pruefen', name: 'Antwort prüfen', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [300, 140], parameters: { mode: 'runOnceForAllItems', jsCode: CODE_PRUEFEN },
  },
  {
    id: 'if-plausibel', name: 'Plausibel?', type: 'n8n-nodes-base.if', typeVersion: 2.2,
    position: [540, 140], parameters: wennWahr('={{ $json.ok }}'),
  },
  {
    id: 'speichern', name: 'Antwort speichern', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [780, 60],
    parameters: {
      resource: 'row', operation: 'update', dataTableId: tabelle(TABELLE_ANTWORTEN),
      filters: filterAuf('token', '={{ $json.token }}'),
      columns: {
        mappingMode: 'defineBelow',
        value: {
          status: 'beantwortet',
          auswahl: '={{ $json.auswahl }}',
          eigene_json: '={{ $json.eigene_json }}',
          beantwortet_am: '={{ $json.beantwortet_am }}',
        },
        matchingColumns: [],
        schema: [],
      },
    },
  },
  {
    id: 'bestaetigung', name: 'Bestätigung', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1020, 60], parameters: { mode: 'runOnceForAllItems', jsCode: CODE_BESTAETIGUNG },
  },
  {
    id: 'nicht-plausibel', name: 'Nicht plausibel', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [780, 240], parameters: { mode: 'runOnceForAllItems', jsCode: CODE_ABLEHNUNG_INHALT },
  },
  {
    id: 'antwort-abgelehnt', name: 'Zugang abgelehnt', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [300, 380], parameters: { mode: 'runOnceForAllItems', jsCode: CODE_ABGELEHNT },
  },
];

const verbindung = (ziel) => [{ node: ziel, type: 'main', index: 0 }];

const connections = {
  'Fragebogen laden': { main: [verbindung('Token nachsehen')] },
  'Token nachsehen': { main: [verbindung('Zugang gültig?')] },
  // IF: Ausgang 0 = wahr, Ausgang 1 = falsch
  'Zugang gültig?': { main: [verbindung('Fall nachsehen'), verbindung('Zugang ungültig')] },
  'Fall nachsehen': { main: [verbindung('Fragebogen ausliefern')] },

  'Antwort annehmen': { main: [verbindung('Token prüfen')] },
  'Token prüfen': { main: [verbindung('Noch offen?')] },
  'Noch offen?': { main: [verbindung('Antwort prüfen'), verbindung('Zugang abgelehnt')] },
  'Antwort prüfen': { main: [verbindung('Plausibel?')] },
  'Plausibel?': { main: [verbindung('Antwort speichern'), verbindung('Nicht plausibel')] },
  'Antwort speichern': { main: [verbindung('Bestätigung')] },
};

const notiz = (name, x, y, w, h, farbe, text) => ({
  id: 'doku-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name: 'Doku: ' + name,
  type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [x, y],
  parameters: { color: farbe, width: w, height: h, content: text },
});

nodes.push(
  notiz('Uebersicht', -800, -420, 460, 300, 4, `## OZ-2 — Rückmeldungen entgegennehmen

Die Gegenstelle zur Fragebogen-Seite. Zwei Wege:

**Oben (GET \`oz-fragebogen\`)** — jemand öffnet den Link aus seiner Mail. Der Token wird nachgeschlagen, der Fall geladen, die Seite bekommt die Fassungen zum Ankreuzen.

**Unten (POST \`oz-fragebogen-antwort\`)** — die Rückmeldung kommt zurück, wird geprüft und gespeichert.

**Alle** antworten über denselben Weg: Gastronom wie Touristiker:in. Ein Weg heißt eine Prüfung und ein Protokoll.`),

  notiz('Sicherheit', -800, -100, 460, 260, 2, `### Warum so wenig zurückkommt

Beide Webhooks sind **öffentlich erreichbar**. Deshalb:

- Ohne gültiges Token gibt es nur \`{ status: "unbekannt" }\` — keine Datensatz-ID, keine Adresse, kein Hinweis darauf, ob es das Token je gab
- Der Token ist einmal verwendbar: nach dem Speichern steht \`status = beantwortet\`, ein zweiter Aufruf läuft in denselben Zweig
- **Kein Ad-hoc-Bearbeitungslink** in der Antwort — der wäre ein Zugangsmittel im Netzwerk-Tab des Browsers`),

  notiz('Pruefung', 240, 480, 420, 240, 3, `### Die Prüfung entscheidet hier, nicht im Browser

\`pruefeEingabe()\` stammt aus \`oz-logik/normalisieren.js\` und ist die **verbindliche** Fassung. Der gleichlautende Check auf der Seite dient nur der sofortigen Rückmeldung — wer die Regeln ändert, ändert sie in \`normalisieren.js\`.

Geprüft wird: Öffnen ≠ Schließen, keine Überschneidungen, höchstens zwei Zeiträume pro Tag, mindestens ein Öffnungstag. Über Mitternacht ist erlaubt.

Auffälligkeiten (durchgehend offen, Öffnung vor 05:00, viele Ruhetage) blockieren **nicht** — sie werden vermerkt und OZ-3 zeigt sie einem Menschen.

⚠️ Nicht hier bearbeiten: \`node oz-logik/baue-oz2-workflow.js --update <id>\``),
);

const workflow = { name: 'OZ-2 Antwort (Fragebogen)', settings: { executionOrder: 'v1' }, nodes, connections };

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
