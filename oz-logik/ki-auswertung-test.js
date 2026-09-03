/**
 * Testet die KI-Stufe von Quelle C — ohne n8n, ohne Modellaufruf, ohne Kosten.
 *
 * Geprüft wird der Code, der später im Node „KI-Ergebnis prüfen" läuft: er wird
 * hier aus baue-oz1-workflow.js herausgeholt und mit erfundenen KI-Antworten
 * gefüttert. Genau so lassen sich die Fälle testen, die im Echtlauf selten sind
 * — vor allem die, in denen die KI Unsinn liefert.
 *
 * Zusätzlich der Hin-und-Rück-Test für wocheAusFassung(): eine Fassung, die
 * durch Text und zurück geht, muss dieselbe Woche ergeben. Daran hängt der
 * ganze Vergleich, weil variante_a an dieser Stelle nur noch Text ist.
 *
 * Ausführen:  node oz-logik/ki-auswertung-test.js
 */

const fs = require('fs');
const path = require('path');
const N = require('./normalisieren');

const HIER = __dirname;

// --- Den erzeugten Node-Code aus dem Bauskript holen -------------------------
function treiberHolen(name) {
  const src = fs.readFileSync(path.join(HIER, 'baue-oz1-workflow.js'), 'utf8');
  const marke = 'const ' + name + ' = `';
  const start = src.indexOf(marke);
  if (start === -1) throw new Error(marke + ' nicht gefunden');
  const ab = start + marke.length;
  const ende = src.indexOf('\n`;', ab);
  if (ende === -1) throw new Error('Ende von ' + name + ' nicht gefunden');
  // Im Template-Literal steht \\d, im ausgeführten Code steht \d.
  const BS = String.fromCharCode(92);
  return src.slice(ab, ende).split(BS + BS).join(BS);
}

const logik = (() => {
  const q = fs.readFileSync(path.join(HIER, 'normalisieren.js'), 'utf8');
  const i = q.indexOf('module.exports');
  return (i === -1 ? q : q.slice(0, i)).trimEnd();
})();

const kiCode = logik + '\n' + treiberHolen('TREIBER_KI');
const kiNode = new Function('$', '$input', kiCode);

/** Führt den Node einmal aus. */
function lauf(faelle, kiAntworten) {
  const dollar = (name) => {
    if (name !== 'Webseite auswerten') throw new Error('unerwarteter Node-Zugriff: ' + name);
    return { all: () => faelle.map((json) => ({ json })) };
  };
  const eingang = { all: () => kiAntworten.map((json) => ({ json })) };
  return kiNode(dollar, eingang);
}

let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log((ok ? '  ok   ' : '  FEHL ') + name
    + (ok ? '' : '\n         ist:  ' + JSON.stringify(ist) + '\n         soll: ' + JSON.stringify(soll)));
};

// =============================================================================
// Teil 1 — wocheAusFassung(): Text zurück in Minuten
// =============================================================================
console.log('\n1) Hin und zurück: wocheAlsText → wocheAusFassung\n');

const proben = {
  'alles unbekannt': N.leereWoche(),
  'Ruhetag + zwei Spannen': (() => {
    const w = N.leereWoche();
    w.Monday.status = 'geschlossen';
    N.ergaenze(w.Tuesday, 11 * 60, 14 * 60);
    N.ergaenze(w.Tuesday, 17 * 60, 22 * 60);
    return w;
  })(),
  'offenes Ende': (() => {
    const w = N.leereWoche();
    N.ergaenze(w.Friday, 17 * 60, 1440);
    w.Friday.offenesEnde = true;
    return w;
  })(),
  'durchgehend offen': (() => {
    const w = N.leereWoche();
    N.ergaenze(w.Saturday, 0, 1440);
    return w;
  })(),
  'über Mitternacht': (() => {
    const w = N.leereWoche();
    N.ergaenze(w.Saturday, 20 * 60, 2 * 60);
    return w;
  })(),
  // Ein Ende genau um Mitternacht kommt in echten Datensätzen vor (Steigenberger:
  // "07:00 - 00:00"). Ohne den Zusatz liest man das als "geschlossen".
  'bis Mitternacht': (() => {
    const w = N.leereWoche();
    N.ergaenze(w.Monday, 7 * 60, 0);
    return w;
  })(),
  'halbe Stunden': (() => {
    const w = N.leereWoche();
    N.ergaenze(w.Sunday, 9 * 60 + 30, 18 * 60 + 45);
    return w;
  })(),
};

for (const [name, woche] of Object.entries(proben)) {
  const text = N.wocheAlsText(woche);
  const zurueck = N.wocheAusFassung(text);
  pruefe(name + '  → "' + text.slice(0, 60) + (text.length > 60 ? '…' : '') + '"',
    N.wocheAlsText(zurueck), text);
}

// Der eigentliche Punkt: nach dem Hin und Zurück darf vergleiche() keine
// Abweichung mehr finden. Sonst wird jeder Web-Kandidat zum Fehlalarm.
for (const [name, woche] of Object.entries(proben)) {
  const v = N.vergleiche(N.wocheAusFassung(N.wocheAlsText(woche)), woche);
  pruefe('vergleiche nach Rückweg einig — ' + name, v.einig, true);
}

// =============================================================================
// Teil 2 — die KI-Stufe
// =============================================================================
console.log('\n2) KI-Ergebnis prüfen\n');

const TAGE_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Baut eine KI-Antwort: {Mi: ['17:00','23:59', true], …} */
function kiAntwort(tage, extra = {}) {
  const out = { ableitbar: true, kuechenzeitenImText: false, saisonHinweisImText: false, tage: {} };
  for (const t of TAGE_EN) out.tage[t] = { status: 'unbekannt', intervalle: [], offenesEnde: false };
  for (const [t, wert] of Object.entries(tage)) {
    if (wert === 'zu') { out.tage[t] = { status: 'geschlossen', intervalle: [], offenesEnde: false }; continue; }
    out.tage[t] = {
      status: 'offen',
      intervalle: wert.spannen.map(([von, bis]) => ({ von, bis })),
      offenesEnde: !!wert.offen,
    };
  }
  return { output: { ...out, ...extra } };
}

function fall(zusatz) {
  return {
    datensatz_id: '900001', titel: 'Testbetrieb', ort: 'Musterstadt',
    prio: 3, grund: 'kein eigener Freitext — Webseite prüfen', weg: 'web-pruefen',
    variante_a: '', variante_b: '', variante_c: '', variante_c_quelle: '',
    kuechenzeiten: '', gaeste_link: '', bearbeitungslink: '',
    bearbeitungslink_gueltig_bis: null, status: 'neu',
    frist: '2026-09-08T00:00:00.000Z', angelegt_am: '2026-09-01T00:00:00.000Z',
    webtext: '', ...zusatz,
  };
}

// --- 1: echter Widerspruch → neuer Fall --------------------------------------
{
  const r = lauf(
    [fall({
      webtext: '[Abschnitt 1]\nÖffnungszeiten\n Mi – Sa ab 17:00 Uhr',
      variante_a: 'Mo 12:00–22:00 · Di 12:00–22:00 · Mi 12:00–22:00 · Do 12:00–22:00 '
        + '· Fr 12:00–22:00 · Sa 12:00–22:00 · So 12:00–22:00',
    })],
    [kiAntwort({
      Wednesday: { spannen: [['17:00', '23:59']], offen: true },
      Thursday: { spannen: [['17:00', '23:59']], offen: true },
      Friday: { spannen: [['17:00', '23:59']], offen: true },
      Saturday: { spannen: [['17:00', '23:59']], offen: true },
    })],
  );
  pruefe('Widerspruch: ein Fall entsteht', r.length, 1);
  pruefe('Widerspruch: Priorität 2', r[0].json.prio, 2);
  pruefe('Widerspruch: Weg anfrage', r[0].json.weg, 'anfrage');
  pruefe('Widerspruch: Fassung C',
    r[0].json.variante_c,
    'Mo unbekannt · Di unbekannt · Mi ab 17:00 · Do ab 17:00 · Fr ab 17:00 · Sa ab 17:00 · So unbekannt');
  pruefe('Widerspruch: Herkunft steht dabei',
    r[0].json.variante_c_quelle, 'Webseite (Fließtext, von der KI gelesen)');
  pruefe('Widerspruch: Grund nennt die Tage und die Herkunft',
    r[0].json.grund, 'widerspricht der Betriebs-Webseite (We,Th,Fr,Sa, KI-gelesen)');
  pruefe('Widerspruch: Zähler', r[0].json.statistik_ki.neue_faelle, 1);
}

// --- 2: erfundene Zeit → verworfen -------------------------------------------
{
  const r = lauf(
    [fall({
      webtext: '[Abschnitt 1]\nÖffnungszeiten\n Mi – Sa ab 17:00 Uhr',
      variante_a: 'Mo 12:00–22:00 · Di unbekannt · Mi unbekannt · Do unbekannt '
        + '· Fr unbekannt · Sa unbekannt · So unbekannt',
    })],
    [kiAntwort({ Wednesday: { spannen: [['19:30', '22:00']] } })],
  );
  pruefe('Halluzination: kein Fall', r.length, 0);
}

// --- 3: die KI passt selbst → verworfen --------------------------------------
{
  const r = lauf(
    [fall({ webtext: 'Öffnungszeiten auf Anfrage', variante_a: 'Mo 12:00–22:00 · Di unbekannt · Mi unbekannt · Do unbekannt · Fr unbekannt · Sa unbekannt · So unbekannt' })],
    [{ output: { ableitbar: false, grundWennNicht: 'nur "auf Anfrage" im Text', kuechenzeitenImText: false, saisonHinweisImText: false, tage: {} } }],
  );
  pruefe('ableitbar=false: kein Fall', r.length, 0);
}

// --- 4: Saisonhinweis → verworfen, obwohl ableitbar=true ---------------------
{
  const r = lauf(
    [fall({ webtext: 'Sommer: Mo–So 11:00–22:00 · Winter: Mo–So 12:00–20:00', variante_a: 'Mo 09:00–18:00 · Di unbekannt · Mi unbekannt · Do unbekannt · Fr unbekannt · Sa unbekannt · So unbekannt' })],
    [kiAntwort({ Monday: { spannen: [['11:00', '22:00']] } }, { saisonHinweisImText: true })],
  );
  pruefe('Saison im Text: kein Fall', r.length, 0);
}

// --- 5: 24/7 ist unplausibel -------------------------------------------------
{
  const r = lauf(
    [fall({
      webtext: 'Öffnungszeiten: 0:00 - 24:00 Uhr, täglich für Sie da',
      variante_a: 'Mo 12:00–22:00 · Di unbekannt · Mi unbekannt · Do unbekannt · Fr unbekannt · Sa unbekannt · So unbekannt',
    })],
    [kiAntwort(Object.fromEntries(TAGE_EN.map((t) => [t, { spannen: [['00:00', '23:59']] }])))],
  );
  pruefe('24/7: kein Fall', r.length, 0);
}

// --- 6: Webseite bestätigt die Datenbank → kein Fall -------------------------
{
  const r = lauf(
    [fall({
      webtext: 'Di bis So 11:00 - 14:00 und 17:00 - 22:00 Uhr, Montag Ruhetag',
      variante_a: 'Mo geschlossen · Di 11:00–14:00, 17:00–22:00 · Mi 11:00–14:00, 17:00–22:00 '
        + '· Do 11:00–14:00, 17:00–22:00 · Fr 11:00–14:00, 17:00–22:00 '
        + '· Sa 11:00–14:00, 17:00–22:00 · So 11:00–14:00, 17:00–22:00',
    })],
    [kiAntwort({
      Monday: 'zu',
      Tuesday: { spannen: [['11:00', '14:00'], ['17:00', '22:00']] },
      Wednesday: { spannen: [['11:00', '14:00'], ['17:00', '22:00']] },
      Thursday: { spannen: [['11:00', '14:00'], ['17:00', '22:00']] },
      Friday: { spannen: [['11:00', '14:00'], ['17:00', '22:00']] },
      Saturday: { spannen: [['11:00', '14:00'], ['17:00', '22:00']] },
      Sunday: { spannen: [['11:00', '14:00'], ['17:00', '22:00']] },
    })],
  );
  pruefe('Bestätigung: kein Fall', r.length, 0);
}

// --- 7: "unbekannt" ist kein Widerspruch ------------------------------------
// Die Webseite nennt nur Fr und Sa. Für die anderen Tage sagt sie NICHTS —
// das darf den gepflegten Eintrag nicht in Frage stellen.
{
  const r = lauf(
    [fall({
      webtext: 'Wir öffnen freitags und samstags von 17:00 bis 22:00 Uhr.',
      variante_a: 'Mo 17:00–22:00 · Di 17:00–22:00 · Mi 17:00–22:00 · Do 17:00–22:00 '
        + '· Fr 17:00–22:00 · Sa 17:00–22:00 · So 17:00–22:00',
    })],
    [kiAntwort({
      Friday: { spannen: [['17:00', '22:00']] },
      Saturday: { spannen: [['17:00', '22:00']] },
    })],
  );
  pruefe('Schweigen ist kein Widerspruch: kein Fall', r.length, 0);
}

// --- 8: schon erkannter Fall bekommt eine dritte Fassung ---------------------
{
  const r = lauf(
    [fall({
      prio: 2, weg: 'anfrage', grund: 'widerspricht dem eigenen Freitext (We)',
      webtext: 'Küche: Mo–Fr 12:00 bis 21:00 Uhr geöffnet',
      variante_a: 'Mo 09:00–18:00 · Di 09:00–18:00 · Mi 09:00–18:00 · Do 09:00–18:00 · Fr 09:00–18:00 · Sa unbekannt · So unbekannt',
      variante_b: 'Mo 10:00–18:00 · Di unbekannt · Mi unbekannt · Do unbekannt · Fr unbekannt · Sa unbekannt · So unbekannt',
    })],
    [kiAntwort({
      Monday: { spannen: [['12:00', '21:00']] },
      Tuesday: { spannen: [['12:00', '21:00']] },
      Wednesday: { spannen: [['12:00', '21:00']] },
      Thursday: { spannen: [['12:00', '21:00']] },
      Friday: { spannen: [['12:00', '21:00']] },
    })],
  );
  pruefe('Bestandsfall: bleibt erhalten', r.length, 1);
  pruefe('Bestandsfall: Grund unverändert', r[0].json.grund, 'widerspricht dem eigenen Freitext (We)');
  pruefe('Bestandsfall: dritte Fassung gesetzt',
    r[0].json.variante_c,
    'Mo 12:00–21:00 · Di 12:00–21:00 · Mi 12:00–21:00 · Do 12:00–21:00 · Fr 12:00–21:00 · Sa unbekannt · So unbekannt');
  pruefe('Bestandsfall: Zähler', r[0].json.statistik_ki.dritte_fassung, 1);
}

// --- 8b: Mittagstisch UND offener Abend am selben Tag -----------------------
// Echter Fall (Restaurant Alte Schule): die KI liefert zwei Spannen und setzt
// offenesEnde für den Tag. Gemeint ist nur die zweite. Wird das falsch
// übernommen, steht im Fragebogen "ab 11:30, ab 18:00".
{
  const r = lauf(
    [fall({
      prio: 2, weg: 'anfrage', grund: 'widerspricht dem eigenen Freitext (Tu)',
      webtext: 'Dienstag - Samstag geöffnet von 11.30 - 14.00 Uhr und ab 18.00 Uhr. '
        + 'Montags sowie an allen Sonntagen und Feiertagen geschlossen.',
      variante_a: 'Mo geschlossen · Di 11:30–14:00, 18:00–21:30 · Mi unbekannt · Do unbekannt · Fr unbekannt · Sa unbekannt · So geschlossen',
    })],
    [kiAntwort({
      Monday: 'zu',
      Tuesday: { spannen: [['11:30', '14:00'], ['18:00', '23:59']], offen: true },
      Sunday: 'zu',
    })],
  );
  pruefe('Mittagstisch + offener Abend: nur der Abend ist offen',
    r[0].json.variante_c,
    'Mo geschlossen · Di 11:30–14:00, ab 18:00 · Mi unbekannt · Do unbekannt · Fr unbekannt · Sa unbekannt · So geschlossen');
}

// --- 9: Bestandsfall ohne KI-Ergebnis bleibt trotzdem im Ablauf -------------
{
  const r = lauf(
    [fall({ prio: 1, weg: 'anfrage', grund: 'leer — öffentlich "immer geöffnet"', webtext: 'Herzlich willkommen!' })],
    [{ output: { ableitbar: false, grundWennNicht: 'keine Zeiten im Text', kuechenzeitenImText: false, saisonHinweisImText: false, tage: {} } }],
  );
  pruefe('Bestandsfall ohne Fund: bleibt erhalten', r.length, 1);
  pruefe('Bestandsfall ohne Fund: keine Fassung C', r[0].json.variante_c, '');
}

// --- 10: kaputte KI-Antwort bricht nichts ------------------------------------
{
  const r = lauf(
    [fall({ webtext: 'Mo–Fr 12:00–21:00', variante_a: 'Mo 09:00–18:00 · Di unbekannt · Mi unbekannt · Do unbekannt · Fr unbekannt · Sa unbekannt · So unbekannt' }),
      fall({ prio: 2, weg: 'anfrage', webtext: 'Mo–Fr 12:00–21:00', variante_a: 'Mo 09:00–18:00 · Di unbekannt · Mi unbekannt · Do unbekannt · Fr unbekannt · Sa unbekannt · So unbekannt' })],
    [{ error: 'Zeitüberschreitung' }, { irgendwas: 'kein Schema' }],
  );
  pruefe('Fehler-Antwort: Web-Kandidat fällt weg, Bestandsfall bleibt', r.length, 1);
  pruefe('Fehler-Antwort: als KI-Fehler gezählt', r[0].json.statistik_ki.ki_fehler, 2);
}

// --- 11: Anzahl passt nicht → gar nichts von der Webseite übernehmen --------
// Kämen die KI-Antworten in anderer Reihenfolge oder Zahl zurück, würden
// Öffnungszeiten dem falschen Betrieb zugeordnet. Dann lieber nichts.
{
  const r = lauf(
    [fall({ webtext: 'Mo–Fr 12:00–21:00' }),
      fall({ prio: 2, weg: 'anfrage', grund: 'widerspricht dem eigenen Freitext (We)', webtext: 'Mo–Fr 12:00–21:00' })],
    [],
  );
  pruefe('Zuordnung unsicher: Web-Kandidat fällt weg', r.length, 1);
  pruefe('Zuordnung unsicher: Bestandsfall bleibt, aber ohne Fassung C',
    [r[0].json.weg, r[0].json.variante_c], ['anfrage', '']);
}

console.log('\n' + (fehler === 0 ? '✓ alle Prüfungen bestanden' : '✗ ' + fehler + ' Prüfung(en) fehlgeschlagen') + '\n');
process.exit(fehler === 0 ? 0 : 1);
