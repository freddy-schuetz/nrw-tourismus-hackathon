/**
 * Misst, wie ergiebig die Betriebs-Webseiten als dritte Quelle sind.
 *
 * Die entscheidende Frage: Wie viele Seiten liefern Öffnungszeiten maschinenlesbar
 * (schema.org / JSON-LD)? Für die brauchen wir KEINE KI und bekommen exakte Werte.
 *
 * Ausführen:  node oz-logik/webseiten-test.js
 *             node oz-logik/webseiten-test.js --anzahl 150 --parallel 10
 */

const N = require('./normalisieren');
const W = require('./webseite');

const BASE = 'https://meta.et4.de/rest.ashx/search/'
  + '?experience=teutoburgerwald&type=Gastro&template=ET2014A.json';

const arg = (name, standard) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : standard;
};
const ANZAHL = arg('--anzahl', 80);
const PARALLEL = arg('--parallel', 8);

async function laden() {
  let alle = [];
  let offset = 0;
  for (;;) {
    const d = await (await fetch(`${BASE}&limit=400&offset=${offset}`)).json();
    const items = d.items || [];
    alle = alle.concat(items);
    if (items.length < 400 || alle.length >= d.overallcount) return alle;
    offset += 400;
  }
}

/** Einfacher Parallel-Pool — nicht mehr als PARALLEL Abrufe gleichzeitig. */
async function poolMap(liste, grenze, fn) {
  const ergebnis = new Array(liste.length);
  let naechster = 0;
  const arbeiter = Array.from({ length: Math.min(grenze, liste.length) }, async () => {
    for (;;) {
      const i = naechster++;
      if (i >= liste.length) return;
      ergebnis[i] = await fn(liste[i], i);
    }
  });
  await Promise.all(arbeiter);
  return ergebnis;
}

(async () => {
  const alle = await laden();
  const mitWeb = alle.filter((i) => i.web && /^https?:\/\//i.test(i.web));

  // Gleichmäßige Stichprobe über den ganzen Pool, reproduzierbar (kein Zufall).
  const schritt = Math.max(1, Math.floor(mitWeb.length / ANZAHL));
  const probe = mitWeb.filter((_, i) => i % schritt === 0).slice(0, ANZAHL);

  console.log(`Datensätze gesamt: ${alle.length} · mit web-URL: ${mitWeb.length}`);
  console.log(`Stichprobe: ${probe.length} Seiten, ${PARALLEL} gleichzeitig\n`);

  const start = Date.now();
  const ergebnisse = await poolMap(probe, PARALLEL, async (it) => {
    const res = await W.leseWebseite(it.web, 12000);
    return { it, res };
  });
  const dauer = ((Date.now() - start) / 1000).toFixed(0);

  const z = { 'json-ld': 0, text: 0, 'kein-fund': 0, 'nicht-erreichbar': 0 };
  const fehlerArten = {};
  const vergleiche = { einig: 0, abweichend: 0, keinVergleich: 0 };
  const beispiele = { jsonLd: [], abweichend: [], text: [] };

  for (const { it, res } of ergebnisse) {
    z[res.status]++;
    if (res.status === 'nicht-erreichbar') {
      const art = String(res.fehler).slice(0, 28);
      fehlerArten[art] = (fehlerArten[art] || 0) + 1;
      continue;
    }
    if (res.status === 'text') {
      if (beispiele.text.length < 3) beispiele.text.push({ it, res });
      continue;
    }
    if (res.status !== 'json-ld') continue;

    if (beispiele.jsonLd.length < 4) beispiele.jsonLd.push({ it, res });

    const a = N.ausTimeIntervals(it.timeIntervals);
    if (!N.TAGE.some((t) => a[t].status !== 'unbekannt')) {
      vergleiche.keinVergleich++;
      continue;
    }
    const v = N.vergleiche(a, res.woche);
    if (v.einig) {
      vergleiche.einig++;
    } else {
      vergleiche.abweichend++;
      if (beispiele.abweichend.length < 5) beispiele.abweichend.push({ it, res, a });
    }
  }

  const p = (n) => `${String(n).padStart(3)}  (${(n / probe.length * 100).toFixed(0)}%)`;
  console.log(`=== ERGEBNIS (${dauer}s) ===`);
  console.log('schema.org / JSON-LD gefunden → exakte Zeiten, keine KI:', p(z['json-ld']));
  console.log('nur Textkandidaten → KI nötig                          :', p(z.text));
  console.log('Seite da, aber nichts zu Öffnungszeiten                :', p(z['kein-fund']));
  console.log('nicht erreichbar                                       :', p(z['nicht-erreichbar']));

  console.log('\nGründe für "nicht erreichbar":');
  for (const [grund, n] of Object.entries(fehlerArten).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)} × ${grund}`);
  }

  const verglichen = vergleiche.einig + vergleiche.abweichend;
  console.log('\n=== JSON-LD gegen destination.data ===');
  console.log('vergleichbar    :', verglichen);
  console.log('  einig         :', vergleiche.einig);
  console.log('  ABWEICHUNG    :', vergleiche.abweichend,
    verglichen ? `(${(vergleiche.abweichend / verglichen * 100).toFixed(0)}%)` : '');
  console.log('  ohne Struktur in destination.data:', vergleiche.keinVergleich);

  console.log('\n=== BEISPIELE: JSON-LD sauber gelesen ===');
  for (const { it, res } of beispiele.jsonLd) {
    console.log(`\n  ${it.id}  ${(it.title || '').slice(0, 44)}`);
    console.log(`    ${it.web.slice(0, 70)}`);
    console.log(`    Web: ${N.wocheAlsText(res.woche).slice(0, 160)}`);
  }

  console.log('\n=== BEISPIELE: Webseite widerspricht destination.data ===');
  for (const { it, res, a } of beispiele.abweichend) {
    console.log(`\n  ${it.id}  ${(it.title || '').slice(0, 44)}`);
    console.log(`    ${it.web.slice(0, 70)}`);
    console.log(`    d.data: ${N.wocheAlsText(a).slice(0, 150)}`);
    console.log(`    Web   : ${N.wocheAlsText(res.woche).slice(0, 150)}`);
  }

  console.log('\n=== BEISPIELE: nur Text gefunden (Material für die KI) ===');
  for (const { it, res } of beispiele.text) {
    console.log(`\n  ${it.id}  ${(it.title || '').slice(0, 44)}`);
    console.log(`    ${JSON.stringify(res.kandidaten[0].replace(/\s+/g, ' ').slice(0, 200))}`);
  }
})().catch((e) => {
  console.error('Fehler:', e.message);
  process.exit(1);
});
