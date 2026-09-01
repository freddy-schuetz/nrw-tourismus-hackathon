/**
 * Erzeugt den n8n-Workflow „OZ-1 Prüflauf" und legt ihn in der Instanz an.
 *
 * Der Code-Node bekommt die geprüfte Logik direkt aus normalisieren.js eingesetzt —
 * dadurch gibt es keine zweite Fassung, die auseinanderlaufen kann. Nach dem Anlegen
 * wird der Workflow über die MCP-Werkzeuge validiert (n8n_validate_workflow).
 *
 * Ausführen:  node oz-logik/baue-oz1-workflow.js [--update <workflowId>]
 */

const fs = require('fs');
const path = require('path');

const HIER = __dirname;
const MCP = path.join(HIER, '..', '.mcp.json');

const konfig = JSON.parse(fs.readFileSync(MCP, 'utf8'));
const env = konfig.mcpServers['n8n-mcp'].env;
const BASIS = env.N8N_API_URL.replace(/\/$/, '');
const KEY = env.N8N_API_KEY;

const TABELLE_FAELLE = 'ZqtInTqjOEJBFtba';

// --- Logik aus normalisieren.js übernehmen (ohne module.exports) ---------------
const logik = (() => {
  const q = fs.readFileSync(path.join(HIER, 'normalisieren.js'), 'utf8');
  const i = q.indexOf('module.exports');
  return (i === -1 ? q : q.slice(0, i)).trimEnd();
})();

// --- Treiber: das, was NUR OZ-1 tut ------------------------------------------
const treiber = `
// =============================================================================
// OZ-1 Prüflauf — Auswahl und Vergleich
// Die Funktionen oberhalb stammen 1:1 aus oz-logik/normalisieren.js.
// Nicht hier bearbeiten: mit "node oz-logik/baue-oz1-workflow.js" neu erzeugen.
// =============================================================================

// Obergrenze pro Lauf. Schützt davor, dass ein Fehler gleich hunderte Fälle
// anlegt. Für den Echtbetrieb hochsetzen.
const MAX_FAELLE = 40;
const FRIST_TAGE = 7;

// Wie viele Betriebs-Webseiten pro Lauf abgefragt werden. Jede Abfrage ist ein
// HTTP-Aufruf nach außen; 6 % der Seiten sind tot und laufen in den Timeout.
// Bewusst klein gehalten, bis der Ablauf im Echtbetrieb steht.
const MAX_WEBSEITEN = 40;

// Der HTTP-Node liefert pro Seite ein Item mit einem items-Array.
const datensaetze = [];
for (const eingang of $input.all()) {
  for (const d of (eingang.json.items || [])) datensaetze.push(d);
}

const freitext = (datensatz, rel) => {
  const t = (datensatz.texts || []).find((x) => x.rel === rel && x.value);
  return t ? t.value : '';
};

/** Überlappende oder mehr als zwei Spannen pro Tag = Parser hat Zeiten vermischt. */
function vorschlagIstSauber(woche) {
  for (const t of TAGE) {
    const iv = woche[t].iv || [];
    if (iv.length > 2) return false;
    for (let i = 1; i < iv.length; i++) if (iv[i][0] < iv[i - 1][1]) return false;
  }
  return true;
}

const statistik = {
  gelesen: datensaetze.length,
  prio1_leer: 0,
  prio2_widerspruch: 0,
  einig: 0,
  kein_fall: 0,
  web_kandidaten: 0,
};
let webKandidaten = 0;
let echteFaelle = 0;
const faelle = [];
const jetzt = new Date();
const frist = new Date(jetzt.getTime() + FRIST_TAGE * 24 * 60 * 60 * 1000);

for (const d of datensaetze) {
  const a = ausTimeIntervals(d.timeIntervals);
  const hatStruktur = TAGE.some((t) => a[t].status !== 'unbekannt');
  const frei = ausFreitext(freitext(d, 'openings'), freitext(d, 'dayoff'));

  let prio = null; let grund = ''; let weg = ''; let varianteB = '';

  if (!hatStruktur) {
    // Priorität 1: leere Öffnungszeiten erscheinen im TeutoNavigator als
    // "immer geöffnet" — also aktiv falsche Information, nicht bloß eine Lücke.
    prio = 1;
    if (frei.typ === 'strukturiert') {
      const sauber = vorschlagIstSauber(frei.woche);
      grund = sauber
        ? 'leer — öffentlich "immer geöffnet", Zeiten stehen im eigenen Freitext'
        : 'leer — Freitext lesbar, aber Zeiten überlappen: Vorschlag prüfen';
      weg = sauber ? 'direkt-vorschlag' : 'vorschlag-pruefen';
      varianteB = wocheAlsText(frei.woche);
    } else {
      grund = 'leer — öffentlich "immer geöffnet" (' + frei.typ + ')';
      weg = 'anfrage';
    }
    statistik.prio1_leer++;
  } else if (frei.typ === 'strukturiert') {
    const v = vergleiche(a, frei.woche);
    if (v.einig) {
      statistik.einig++;
      continue;
    }
    prio = 2;
    grund = 'widerspricht dem eigenen Freitext ('
      + v.abweichungen.map((x) => x.tag.slice(0, 2)).join(',') + ')';
    weg = 'anfrage';
    varianteB = wocheAlsText(frei.woche);
    statistik.prio2_widerspruch++;
  } else if (d.web && /^https?:\\/\\//i.test(d.web) && webKandidaten < MAX_WEBSEITEN) {
    // Struktur da, aber kein verwertbarer Freitext im Datensatz. Das sind die
    // rund 459 Fälle, die sich AUS SICH SELBST nicht prüfen lassen — für sie ist
    // die Betriebs-Webseite die einzige zweite Quelle.
    //
    // Hier noch KEIN Fall: erst holt "Webseite holen" die Seite, dann entscheidet
    // "Webseite auswerten", ob es wirklich eine Abweichung gibt.
    prio = 3;
    grund = 'kein eigener Freitext — Webseite prüfen';
    weg = 'web-pruefen';
    webKandidaten++;
    statistik.web_kandidaten++;
  } else {
    // "auf Anfrage", mehrere Saisons, kein lesbarer Text und keine Webseite
    // → bewusst kein Fall.
    statistik.kein_fall++;
    continue;
  }

  // Web-Kandidaten zählen nicht gegen MAX_FAELLE: sie werden meist wieder
  // verworfen, wenn die Webseite dasselbe sagt. Deshalb ein eigener Zähler —
  // faelle.length enthält beide Sorten und würde das Budget aufbrauchen.
  if (weg !== 'web-pruefen') {
    if (echteFaelle >= MAX_FAELLE) continue;
    echteFaelle++;
  }

  faelle.push({
    datensatz_id: String(d.id),
    titel: String(d.title || '').trim(),
    ort: String(d.city || ''),
    prio,
    grund,
    weg,
    variante_a: hatStruktur ? wocheAlsText(a) : '',
    variante_b: varianteB,
    variante_c: '',
    kuechenzeiten: freitext(d, 'KITCHEN_ZEITEN').replace(/\\s+/g, ' ').slice(0, 200),
    gaeste_link: oeffentlicherLink(d) || '',
    // Wird nicht in oz_faelle gespeichert (dort gibt es keine Spalte dafür),
    // sondern von der Empfänger-Ermittlung weiter unten aus diesem Node gelesen.
    betrieb_email: String(d.email || '').trim(),
    // Für den Webseiten-Abruf im nächsten Node (Quelle C).
    web: String(d.web || '').trim(),
    // Der Ad-hoc-Bearbeitungslink aus destination.data wird erst beim Versand
    // erzeugt (er läuft nach zwei Wochen ab) und geht NUR an Ersteller bzw.
    // letzten Bearbeiter — für den Gastronomen ist die Datenbank-Oberfläche zu viel.
    bearbeitungslink: '',
    bearbeitungslink_gueltig_bis: null,
    status: 'neu',
    frist: frist.toISOString(),
    angelegt_am: jetzt.toISOString(),
  });
}

// Die Kennzahlen hängen an jedem Fall, damit ein Lauf ohne Zusatz-Node
// nachvollziehbar ist.
return faelle.map((f) => ({ json: { ...f, statistik } }));
`;

const jsCode = logik + '\n' + treiber;

// --- Quelle C: Betriebs-Webseite ---------------------------------------------
// webseite.js wird genauso eingesetzt wie normalisieren.js — eine Quelle, keine Kopie.
const webLogik = (() => {
  const q = fs.readFileSync(path.join(HIER, 'webseite.js'), 'utf8');
  const ohneRequire = q.replace(/^const N = require\(['"]\.\/normalisieren['"]\);\s*$/m, '');
  const i = ohneRequire.indexOf('module.exports');
  return (i === -1 ? ohneRequire : ohneRequire.slice(0, i)).trimEnd();
})();

// webseite.js greift über N auf normalisieren.js zu (siehe baue-n8n-bundle.js).
const BRUECKE = '\nconst N = { TAGE, leereWoche: UNBEKANNT, ergaenze, zeitZuMinuten };\n';

const TREIBER_WEB = `
// =============================================================================
// Quelle C — die Betriebs-Webseite auswerten
//
// Zwei Wege, siehe webseite.js:
//   schema.org / JSON-LD  → exakte Zeiten, KEINE KI nötig (in der Stichprobe 8 %)
//   nur Textabschnitte    → gehen an die KI; dieser Zweig ist noch NICHT gebaut,
//                           die Abschnitte werden vorerst nur vermerkt (61 %)
//
// ⚠️ Kodierungs-Falle, in webseite.js behandelt: 00:00–00:00 heißt bei schema.org
//    GESCHLOSSEN, in destination.data dagegen 24 STUNDEN OFFEN.
// =============================================================================

const kandidaten = $('Zeiten vergleichen').all().map((i) => i.json);
const abrufe = $input.all();

const statistik = {
  geprueft: 0, json_ld: 0, nur_text: 0, kein_fund: 0, nicht_erreichbar: 0,
  verworfen_fremder_typ: 0, neue_faelle: 0, bestaetigt: 0,
};

// Der HTTP-Node liefert ein Item pro Eingabe-Item, in derselben Reihenfolge.
// Stimmt das nicht, wird die Webseite ignoriert statt falsch zugeordnet.
const zuordnungOk = abrufe.length === kandidaten.length;

const ergebnis = [];

for (let i = 0; i < kandidaten.length; i++) {
  const k = { ...kandidaten[i] };
  // URL zuerst sichern: sie wird gleich aus k entfernt, weil oz_faelle keine
  // Spalte dafür hat. (Erst löschen und dann k.web prüfen ging schief.)
  const webUrl = k.web;
  delete k.web;

  let woche = null;
  let textAbschnitte = null;
  let webQuelle = '';

  if (zuordnungOk && webUrl) {
    statistik.geprueft++;
    const roh = (abrufe[i] && abrufe[i].json) || {};
    // responseFormat "text" legt den Seiteninhalt unter data ab.
    const html = typeof roh === 'string' ? roh : String(roh.data || '');
    const fehler = roh.error || (!html ? 'leere Antwort' : null);

    if (fehler) {
      statistik.nicht_erreichbar++;
    } else {
      const jsonLd = ausJsonLd(html);
      if (jsonLd && jsonLd.woche) {
        statistik.json_ld++;
        woche = jsonLd.woche;
        // Woher die Fassung stammt, gehört sichtbar in den Fall: bei einem
        // "Restaurant"-Knoten ist sie belastbarer als bei einem ohne Typangabe.
        // Manche Baukasten-Seiten liefern Vorgabewerte wie Mo–So 09:00–17:00 —
        // die sieht man nur, wenn die Herkunft mitläuft.
        webQuelle = jsonLd.quelle || '';
      } else if (jsonLd && jsonLd.verworfen) {
        // JSON-LD war da, beschrieb aber Hotel oder Organisation, nicht das Lokal.
        statistik.verworfen_fremder_typ++;
        const abschnitte = textKandidaten(html);
        if (abschnitte.length) {
          statistik.nur_text++;
          textAbschnitte = kandidatenAlsPrompt(abschnitte).slice(0, 1500);
        } else {
          statistik.kein_fund++;
        }
      } else {
        const abschnitte = textKandidaten(html);
        if (abschnitte.length) {
          statistik.nur_text++;
          textAbschnitte = kandidatenAlsPrompt(abschnitte).slice(0, 1500);
        } else {
          statistik.kein_fund++;
        }
      }
    }
  }

  if (woche) k.variante_c = wocheAlsText(woche);
  if (textAbschnitte) k.webtext = textAbschnitte;

  if (k.weg !== 'web-pruefen') {
    // Bereits erkannter Fall — die Webseite ist hier nur eine dritte Fassung
    // zum Ankreuzen, sie ändert nichts an der Einordnung.
    ergebnis.push({ json: { ...k, statistik_web: statistik } });
    continue;
  }

  // Web-Kandidat: nur ein echter Widerspruch macht daraus einen Fall.
  if (!woche) continue; // ohne exakte Zeiten (noch) keine Entscheidung möglich

  // Beide Fassungen liegen als normalisierter Text vor ("Mo geschlossen · Di …"),
  // erzeugt von derselben Funktion. Gleicher Text heißt deshalb gleiche Aussage —
  // ein Vergleich Zeichen für Zeichen genügt hier.
  const gleich = k.variante_c === k.variante_a;

  if (gleich) {
    statistik.bestaetigt++;
    continue;
  }

  statistik.neue_faelle++;
  ergebnis.push({
    json: {
      ...k,
      prio: 2,
      grund: 'widerspricht der Betriebs-Webseite — ' + webQuelle,
      weg: 'anfrage',
      statistik_web: statistik,
    },
  });
}

return ergebnis;
`;

const CODE_WEB = logik + BRUECKE + webLogik + '\n' + TREIBER_WEB;

const WEB_NODES = [
  {
    id: 'webholen',
    name: 'Webseite holen',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [360, 90],
    // Tote Domains, Zertifikatsfehler und Timeouts sind hier normal (6 % in der
    // Stichprobe). Ein Fehlschlag darf den Lauf nicht abbrechen.
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    parameters: {
      url: '={{ $json.web || "https://kein-eintrag.invalid/" }}',
      options: {
        response: { response: { responseFormat: 'text', neverError: true } },
        timeout: 12000,
        redirect: { redirect: { followRedirects: true, maxRedirects: 5 } },
        batching: { batch: { batchSize: 8, batchInterval: 300 } },
      },
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'User-Agent',
            value: 'destination-data-Oeffnungszeiten-Abgleich/0.1 (Datenpflege teutoburgerwald)',
          },
          { name: 'Accept', value: 'text/html,application/xhtml+xml' },
          { name: 'Accept-Language', value: 'de-DE,de;q=0.9' },
        ],
      },
    },
  },
  {
    id: 'webauswerten',
    name: 'Webseite auswerten',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [600, 90],
    parameters: { mode: 'runOnceForAllItems', jsCode: CODE_WEB },
  },
];

// --- Workflow-Definition -----------------------------------------------------
const workflow = {
  name: 'OZ-1 Prüflauf (Öffnungszeiten Gastro)',
  settings: { executionOrder: 'v1' },
  nodes: [
    {
      id: 'trigger-manuell',
      name: 'Manuell starten',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [-360, 0],
      parameters: {},
    },
    {
      id: 'trigger-plan',
      name: 'Montags früh',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [-360, 180],
      parameters: {
        rule: {
          interval: [{ field: 'weeks', triggerAtDay: [1], triggerAtHour: 6, triggerAtMinute: 0 }],
        },
      },
    },
    {
      id: 'holen',
      name: 'Gastro-Datensätze holen',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [-120, 90],
      parameters: {
        url: 'https://meta.et4.de/rest.ashx/search/',
        sendQuery: true,
        queryParameters: {
          parameters: [
            { name: 'experience', value: 'teutoburgerwald' },
            { name: 'type', value: 'Gastro' },
            { name: 'template', value: 'ET2014A.json' },
            { name: 'limit', value: '400' },
            { name: 'offset', value: '0' },
          ],
        },
        options: {
          pagination: {
            pagination: {
              paginationMode: 'updateAParameterInEachRequest',
              parameters: {
                parameters: [{ type: 'qs', name: 'offset', value: '={{ $pageCount * 400 }}' }],
              },
              paginationCompleteWhen: 'other',
              completeExpression: '={{ ($response.body.items || []).length < 400 }}',
              limitPagesFetched: true,
              maxRequests: 10,
            },
          },
        },
      },
    },
    {
      id: 'vergleichen',
      name: 'Zeiten vergleichen',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [120, 90],
      parameters: { mode: 'runOnceForAllItems', jsCode },
    },
    {
      id: 'speichern',
      name: 'Fall speichern',
      type: 'n8n-nodes-base.dataTable',
      typeVersion: 1.1,
      position: [360, 90],
      parameters: {
        resource: 'row',
        operation: 'insert',
        dataTableId: { __rl: true, mode: 'id', value: TABELLE_FAELLE },
        // Bewusst explizit statt autoMapInputData: der Code-Node hängt an jedem Fall
        // ein statistik-Objekt, und verschachtelte Objekte lehnt die Data Table ab
        // ("unexpected object input"). Explizite Zuordnung ignoriert Zusatzfelder.
        columns: {
          mappingMode: 'defineBelow',
          // Die Spaltennamen der Data Table werden 1:1 aus den Feldern des
          // Code-Nodes gefüllt — deshalb reicht eine Liste der Namen.
          value: Object.fromEntries([
            'datensatz_id', 'titel', 'ort', 'prio', 'grund', 'weg',
            'variante_a', 'variante_b', 'variante_c', 'kuechenzeiten',
            'gaeste_link', 'bearbeitungslink', 'bearbeitungslink_gueltig_bis',
            'status', 'frist', 'angelegt_am',
          ].map((spalte) => [spalte, '={{ $json.' + spalte + ' }}'])),
          matchingColumns: [],
          schema: [],
        },
        options: {},
      },
    },
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Gastro-Datensätze holen', type: 'main', index: 0 }]] },
    'Montags früh': { main: [[{ node: 'Gastro-Datensätze holen', type: 'main', index: 0 }]] },
    'Gastro-Datensätze holen': { main: [[{ node: 'Zeiten vergleichen', type: 'main', index: 0 }]] },
    'Zeiten vergleichen': { main: [[{ node: 'Webseite holen', type: 'main', index: 0 }]] },
  'Webseite holen': { main: [[{ node: 'Webseite auswerten', type: 'main', index: 0 }]] },
  'Webseite auswerten': { main: [[{ node: 'Fall speichern', type: 'main', index: 0 }]] },
  },
};

// --- Mail-Strecke -------------------------------------------------------------
// ⚠️ Vor dem ersten echten Versand ZWINGEND anzupassen:
const FRAGEBOGEN_BASIS = 'https://app-0755d440.buildbar.de';
const ABSENDER = 'Teutoburger Wald Tourismus <noreply@BITTE-EINTRAGEN>';
const RUECKFALL_REDAKTION = 'redaktion@teutoburgerwald.de';

/**
 * Testmodus — standardmäßig AN.
 *
 * Die Gastronomen-Adressen kommen live aus der Schnittstelle, es sind also echte
 * Betriebsadressen. Beim ersten Probelauf landeten 63 von 70 Empfängern auf echten
 * Domains. Solange TESTMODUS true ist, wird JEDE Empfängeradresse durch
 * TEST_EMPFAENGER ersetzt; die eigentliche Adresse steht dann nur in
 * `echter_empfaenger` und wird nirgends angeschrieben.
 *
 * So hängt der Versand an echte Betriebe nicht am Häkchen eines einzelnen Nodes.
 */
const TESTMODUS = true;
const TEST_EMPFAENGER = 'test-empfaenger@example.invalid';

const CODE_EMPFAENGER = `
// =============================================================================
// Empfänger bestimmen, Zugänge erzeugen, Mailtext bauen.
//
// Direkt-Vorschläge bekommen KEINE Mail — dort ist nichts zu fragen.
// Der Ad-hoc-Bearbeitungslink aus destination.data taucht hier bewusst NICHT auf:
// alle antworten über den Fragebogen, damit es eine Prüfung und ein Protokoll gibt.
// =============================================================================

const RUECKFALL_REDAKTION = ${JSON.stringify(RUECKFALL_REDAKTION)};
const TESTMODUS = ${JSON.stringify(TESTMODUS)};
const TEST_EMPFAENGER = ${JSON.stringify(TEST_EMPFAENGER)};

const ANREDE = {
  gastronom: 'Sie kennen Ihren Betrieb am besten.',
  bearbeiter: 'Sie haben diesen Eintrag in destination.data zuletzt bearbeitet.',
  ersteller: 'Sie haben diesen Eintrag in destination.data angelegt.',
  redaktion: 'Für diesen Eintrag ist keine zuständige Person hinterlegt.',
};

/** Unrat-Adressen aussortieren, bevor daraus eine Mail wird. */
const istMail = (s) => /^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(String(s || '').trim());

// Der Token wird NICHT hier erzeugt: im n8n Code Node ist crypto.randomUUID nicht
// verfügbar (am 01.09.2026 geprüft — der Rückfall auf Math.random griff), und
// Math.random ist vorhersagbar. Da der Token der einzige Schutz des Fragebogens
// ist, übernimmt das der nachfolgende Crypto-Node mit "generate / uuid".

const faelle = $('Zeiten vergleichen').all().map((i) => i.json);
const zustaendige = new Map(
  $('Zuständige lesen').all()
    .map((i) => i.json)
    .filter((z) => z && z.datensatz_id)
    .map((z) => [String(z.datensatz_id), z]),
);

const jetzt = new Date();
const zeilen = [];

for (const fall of faelle) {
  // Nur Fälle, bei denen es wirklich etwas zu fragen gibt.
  if (fall.weg !== 'anfrage') continue;

  const z = zustaendige.get(String(fall.datensatz_id)) || {};
  const empfaenger = [];
  if (istMail(fall.betrieb_email)) empfaenger.push({ rolle: 'gastronom', email: fall.betrieb_email.trim() });
  if (istMail(z.bearbeiter_email)) empfaenger.push({ rolle: 'bearbeiter', email: String(z.bearbeiter_email).trim() });
  if (istMail(z.ersteller_email) && String(z.ersteller_email).trim() !== String(z.bearbeiter_email || '').trim()) {
    empfaenger.push({ rolle: 'ersteller', email: String(z.ersteller_email).trim() });
  }
  // Fällt niemand aus der Redaktion an, geht die Anfrage an die Region.
  if (!empfaenger.some((e) => e.rolle !== 'gastronom')) {
    empfaenger.push({ rolle: 'redaktion', email: RUECKFALL_REDAKTION });
  }

  const frist = fall.frist
    ? new Date(fall.frist).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const leer = fall.prio === 1 && !fall.variante_a;

  for (const e of empfaenger) {
    zeilen.push({
      datensatz_id: String(fall.datensatz_id),
      rolle: e.rolle,
      // Im Testmodus geht ALLES an die Testadresse. Die echte steht daneben,
      // wird aber nicht angeschrieben.
      email: TESTMODUS ? TEST_EMPFAENGER : e.email,
      echter_empfaenger: e.email,
      // Für den Mailtext im nächsten Schritt:
      titel: fall.titel,
      ort: fall.ort || '',
      gaeste_link: fall.gaeste_link || '',
      frist_text: frist,
      leer,
      gesendet_am: jetzt.toISOString(),
    });
  }
}

return zeilen.map((z) => ({ json: z }));`;

const CODE_MAILTEXT = `
// =============================================================================
// Mailtext bauen — läuft NACH dem Crypto-Node, damit der Token schon da ist.
// =============================================================================

const FRAGEBOGEN_BASIS = ${JSON.stringify(FRAGEBOGEN_BASIS)};

const ANREDE = {
  gastronom: 'Sie kennen Ihren Betrieb am besten.',
  bearbeiter: 'Sie haben diesen Eintrag in destination.data zuletzt bearbeitet.',
  ersteller: 'Sie haben diesen Eintrag in destination.data angelegt.',
  redaktion: 'Für diesen Eintrag ist keine zuständige Person hinterlegt.',
};

return $input.all().map((eingang) => {
  const z = eingang.json;
  const token = String(z.token || '').replace(/-/g, '');
  const link = FRAGEBOGEN_BASIS + '/fragebogen?token=' + token;

  const text = [
    'Guten Tag,',
    '',
    'für ' + z.titel + (z.ort ? ' in ' + z.ort : '')
      + ' liegen uns unterschiedliche Öffnungszeiten vor.',
    ANREDE[z.rolle] || '',
    '',
    'So sieht der Eintrag gerade für Gäste aus:',
    z.gaeste_link,
    // null statt '' — leere Strings sind gewollte Leerzeilen und müssen bleiben.
    z.leer
      ? 'Dort steht derzeit "immer geöffnet" — weil keine Öffnungszeiten hinterlegt sind.'
      : null,
    '',
    'Bitte bestätigen Sie mit einem Klick, welche Angabe stimmt:',
    link,
    '',
    'Das dauert weniger als eine Minute.'
      + (z.frist_text ? ' Wir warten bis zum ' + z.frist_text + '.' : ''),
    '',
    'Vielen Dank für Ihre Hilfe',
    'Teutoburger Wald Tourismus',
    '',
    '--',
    'Sie bekommen diese Nachricht, weil Ihre Adresse zu diesem Eintrag in',
    'destination.data hinterlegt ist. Der Link oben gilt nur für Sie und nur einmal.',
  ].filter((zeile) => zeile !== null).join('\\n');

  return {
    json: {
      token,
      datensatz_id: z.datensatz_id,
      rolle: z.rolle,
      email: z.email,
      status: 'offen',
      auswahl: '',
      eigene_json: '',
      gesendet_am: z.gesendet_am,
      // Nur für den Mail-Node, nicht für die Tabelle:
      an: z.email,
      betreff: 'Stimmen die Öffnungszeiten von ' + z.titel + '?',
      text,
    },
  };
});`;

const MAIL_NODES = [
  {
    id: 'zustaendige', name: 'Zuständige lesen', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [600, 90], alwaysOutputData: true, executeOnce: true,
    parameters: {
      resource: 'row', operation: 'get',
      dataTableId: { __rl: true, mode: 'id', value: 'jzo1cE3eKqLZE8Ln' },
      filters: { conditions: [] }, returnAll: true,
    },
  },
  {
    id: 'empfaenger', name: 'Empfänger bestimmen', type: 'n8n-nodes-base.code',
    typeVersion: 2, position: [840, 90],
    parameters: { mode: 'runOnceForAllItems', jsCode: CODE_EMPFAENGER },
  },
  {
    // Erzeugt den Zugangs-Token. Bewusst NICHT im Code-Node: dort ist
    // crypto.randomUUID nicht verfügbar und Math.random wäre vorhersagbar.
    id: 'tokengen', name: 'Token erzeugen', type: 'n8n-nodes-base.crypto', typeVersion: 2,
    position: [1080, 90],
    parameters: { action: 'generate', dataPropertyName: 'token', encodingType: 'uuid' },
  },
  {
    id: 'mailtext', name: 'Mailtext bauen', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1320, 90],
    parameters: { mode: 'runOnceForAllItems', jsCode: CODE_MAILTEXT },
  },
  {
    id: 'zugang', name: 'Zugang anlegen', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    position: [1560, 90],
    parameters: {
      resource: 'row', operation: 'insert',
      dataTableId: { __rl: true, mode: 'id', value: 'ugZId5KxR3sRnsOe' },
      columns: {
        mappingMode: 'defineBelow',
        value: Object.fromEntries([
          'token', 'datensatz_id', 'rolle', 'email', 'status',
          'auswahl', 'eigene_json', 'gesendet_am',
        ].map((s) => [s, '={{ $json.' + s + ' }}'])),
        matchingColumns: [], schema: [],
      },
    },
  },
  {
    id: 'senden', name: 'Anfrage senden', type: 'n8n-nodes-base.emailSend', typeVersion: 2.1,
    position: [1800, 90],
    // ⚠️ ABSICHTLICH DEAKTIVIERT. Erst einschalten, wenn
    //    1. eine SMTP-Credential hinterlegt ist,
    //    2. FRAGEBOGEN_BASIS auf die veröffentlichte Adresse zeigt,
    //    3. die Empfänger in oz_zustaendige echte Adressen sind (im Test: @example.invalid).
    disabled: true,
    parameters: {
      fromEmail: ABSENDER,
      toEmail: "={{ $('Mailtext bauen').itemMatching($itemIndex).json.an }}",
      subject: "={{ $('Mailtext bauen').itemMatching($itemIndex).json.betreff }}",
      emailFormat: 'text',
      text: "={{ $('Mailtext bauen').itemMatching($itemIndex).json.text }}",
      options: {},
    },
  },
];

// --- Doku im Workflow: Sticky Notes ------------------------------------------
// Gehören ins Skript, nicht nur in die Instanz — sonst verschwinden sie beim
// nächsten Neubau.
const N_ = (name, x, y, w, h, farbe, text) => ({
  id: 'doku-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name: 'Doku: ' + name,
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position: [x, y],
  parameters: { color: farbe, width: w, height: h, content: text },
});

workflow.nodes.push(...WEB_NODES, ...MAIL_NODES);
Object.assign(workflow.connections, {
  'Fall speichern': { main: [[{ node: 'Zuständige lesen', type: 'main', index: 0 }]] },
  'Zuständige lesen': { main: [[{ node: 'Empfänger bestimmen', type: 'main', index: 0 }]] },
  'Empfänger bestimmen': { main: [[{ node: 'Token erzeugen', type: 'main', index: 0 }]] },
  'Token erzeugen': { main: [[{ node: 'Mailtext bauen', type: 'main', index: 0 }]] },
  'Mailtext bauen': { main: [[{ node: 'Zugang anlegen', type: 'main', index: 0 }]] },
  'Zugang anlegen': { main: [[{ node: 'Anfrage senden', type: 'main', index: 0 }]] },
});

workflow.nodes.push(
  N_('Worum es geht', -700, -220, 500, 320, 4, `## Öffnungszeiten-Abgleich Gastronomie

Dieser Ablauf sucht in **destination.data** (Mandant \`teutoburgerwald\`, experience **18395**) Gastro-Datensätze mit falschen oder fehlenden Öffnungszeiten und legt daraus eine Arbeitsliste an.

**Warum das wichtig ist:** Sind die Öffnungszeiten leer, zeigt der TeutoNavigator dem Gast **„immer geöffnet"** — also keine Lücke, sondern aktiv falsche Information.

**Er verschickt noch KEINE E-Mails.** Erst muss die Erkennung sauber sein; das Nachfragen kommt in \`OZ-2\`.

**Ergebnis:** Zeilen in der Data Table \`oz_faelle\`.

Ausführlich: \`docs/destination-data-felder.md\` im Projekt.`),

  N_('Start', -420, 330, 260, 200, 7, `### Zwei Wege zu starten

**Manuell starten** — zum Ausprobieren, jederzeit per Knopfdruck.

**Montags früh** — der geplante Lauf, jeden Montag 6:00 Uhr.

Der Zeitplan greift nur, wenn der Workflow **aktiv** ist. Solange er gebaut wird, bleibt er absichtlich inaktiv.`),

  N_('Daten holen', -140, 330, 260, 220, 7, `### Alle Gastro-Datensätze holen

Ruft die öffentliche Such-Schnittstelle von destination.data auf — **kein Lizenzschlüssel nötig**.

Rund **1132 Datensätze**, die in Seiten von 400 kommen. Das Blättern übernimmt die eingebaute *Pagination*: sie erhöht \`offset\` und hört auf, sobald eine Seite weniger als 400 Einträge liefert.

Obergrenze 10 Seiten als Bremse.`),

  N_('Herzstück', 140, 330, 300, 400, 3, `### Das Herzstück: vergleichen

Hier entscheidet sich alles. Der Code bringt zwei Quellen auf **ein** Format und vergleicht sie **bedeutungsgleich**, nicht zeichengleich:

- **A**: das strukturierte Feld \`timeIntervals\`
- **B**: der Freitext \`openings\` / \`dayoff\` im selben Datensatz

\`Mo 11-14, 17-22\` und \`Montag 11:00–14:00 und 17:00–22:00 Uhr\` gelten als **gleich**.

**Wichtige Regeln:**
- \`00:00–00:00\` heißt hier **24 Stunden offen**, nicht „geschlossen"
- Küchen-, Buffet- und Brunchzeiten sind **keine** Öffnungszeiten
- „auf Anfrage" und mehrere Saisons → **bewusst kein Fall**

⚠️ **Nicht hier bearbeiten.** Der Code wird erzeugt aus \`oz-logik/normalisieren.js\` mit:
\`node oz-logik/baue-oz1-workflow.js --update <id>\`

**Fehlalarme sind gefährlicher als übersehene Fälle** — nach der zweiten unnötigen Mail liest niemand die dritte.`),

  N_('Speichern', 460, 330, 300, 300, 7, `### Fall speichern

Schreibt je Fall eine Zeile in \`oz_faelle\` — mit beiden Fassungen nebeneinander, dem Grund, der Priorität und dem **Gäste-Link** auf den TeutoNavigator.

**Priorität 1** = Öffnungszeiten leer (öffentlich „immer geöffnet")
**Priorität 2** = widerspricht dem eigenen Freitext

Die Spalten sind **einzeln zugeordnet**, nicht automatisch: der Code hängt an jeden Fall ein \`statistik\`-Objekt, und verschachtelte Objekte nimmt die Data Table nicht an.

\`bearbeitungslink\` bleibt hier leer — der Ad-hoc-Link aus destination.data wird erst beim Versand erzeugt (zwei Wochen gültig) und geht **nur** an Ersteller/Bearbeiter, nicht an den Gastronomen.`),
);

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
    console.error(text.slice(0, 800));
    process.exit(1);
  }
  const w = JSON.parse(text);
  console.log(`${id ? 'Aktualisiert' : 'Angelegt'}: ${w.name}`);
  console.log(`Workflow-ID: ${w.id}`);
  console.log(`Code-Node: ${(jsCode.length / 1024).toFixed(1)} kB (davon Logik ${(logik.length / 1024).toFixed(1)} kB)`);
  console.log(`Nodes: ${(w.nodes || []).length}`);
})();
