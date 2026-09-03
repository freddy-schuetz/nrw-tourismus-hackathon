/**
 * Testlauf der Normalisierung gegen ALLE echten Gastro-Datensätze in teutoburgerwald.
 *
 * Zweck: die Fehlalarm-Quote messen, BEVOR irgendeine Mail rausgeht.
 * Ausführen:  node oz-logik/testlauf.js
 *             node oz-logik/testlauf.js --zeige-abweichungen 15
 */

const N = require('./normalisieren');

const BASE = 'https://meta.et4.de/rest.ashx/search/'
  + '?experience=teutoburgerwald&type=Gastro&template=ET2014A.json';

const zeigeAbw = (() => {
  const i = process.argv.indexOf('--zeige-abweichungen');
  return i >= 0 ? parseInt(process.argv[i + 1] || '10', 10) : 8;
})();

const txt = (item, rel) => {
  const t = (item.texts || []).find((x) => x.rel === rel && x.value);
  return t ? t.value : '';
};

async function laden() {
  let alle = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`${BASE}&limit=400&offset=${offset}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const items = d.items || [];
    alle = alle.concat(items);
    if (items.length < 400 || alle.length >= d.overallcount) return alle;
    offset += 400;
  }
}

(async () => {
  const alle = await laden();
  console.log(`Geladen: ${alle.length} Gastro-Datensätze aus teutoburgerwald\n`);

  const z = {
    einig: 0,
    abweichend: 0,
    nurStrukturFehlt: 0,
    nichtStrukturierbar: 0,
    saisonal: 0,
    saisonMehrdeutig: 0,
    unklar: 0,
    keinFreitext: 0,
    nichtsDa: 0,
  };
  const abweichungen = [];
  const strukturVorschlaege = [];

  for (const it of alle) {
    const a = N.ausTimeIntervals(it.timeIntervals);
    const hatStruktur = N.TAGE.some((t) => a[t].status !== 'unbekannt');
    const frei = N.ausFreitext(txt(it, 'openings'), txt(it, 'dayoff'));

    if (frei.typ === 'nicht_strukturierbar') { z.nichtStrukturierbar++; continue; }
    if (frei.typ === 'saisonal') { z.saisonal++; continue; }
    if (frei.typ === 'saisonal_mehrdeutig') { z.saisonMehrdeutig++; continue; }

    if (!hatStruktur) {
      if (frei.typ === 'strukturiert') {
        z.nurStrukturFehlt++;
        strukturVorschlaege.push({ it, woche: frei.woche });
      } else if (frei.typ === 'leer') {
        z.nichtsDa++;
      } else {
        z.unklar++;
      }
      continue;
    }

    if (frei.typ === 'leer') { z.keinFreitext++; continue; }
    if (frei.typ !== 'strukturiert') { z.unklar++; continue; }

    const v = N.vergleiche(a, frei.woche);
    if (v.einig) {
      z.einig++;
    } else {
      z.abweichend++;
      abweichungen.push({ it, a, frei, v });
    }
  }

  const vergleichbar = z.einig + z.abweichend;
  const p = (n, von) => `${String(n).padStart(4)}  (${(n / von * 100).toFixed(1)}%)`;

  console.log('=== ERGEBNIS ÜBER ALLE 1132 ===');
  console.log('vergleichbar (Struktur + Freitext):', vergleichbar);
  console.log('  davon EINIG                     ', p(z.einig, vergleichbar || 1));
  console.log('  davon ABWEICHUNG → Fall         ', p(z.abweichend, vergleichbar || 1));
  console.log('');
  console.log('Struktur fehlt, Freitext lesbar → Direkt-Vorschlag:', z.nurStrukturFehlt);
  console.log('nicht strukturierbar (auf Anfrage) → kein Fall    :', z.nichtStrukturierbar);
  console.log('rein saisonal → kein Fall                          :', z.saisonal);
  console.log('mehrere Zeiträume im Text → kein Fall (neu)         :', z.saisonMehrdeutig);
  console.log('Freitext nicht auswertbar → kein Fall              :', z.unklar);
  console.log('Struktur da, kein Freitext → nur externe Quellen   :', z.keinFreitext);
  console.log('gar nichts da → Fall ohne Vorschlag                :', z.nichtsDa);

  console.log('\n=== FEHLALARM-PROBE: die Referenz-Datensätze ===');
  const referenzen = [
    ['Café Elise', /Café Elise/i, 'einig'],
    ['Hotel-Restaurant Sonnenhof', /Sonnenhof/i, 'einig'],
    ['Waldhotel Bärenstein', /Waldhotel Bärenstein/i, 'direkt-vorschlag'],
    ['Rumiz Weinzirkel', /Rumiz Weinzirkel/i, 'kein fall'],
  ];
  for (const [name, muster, erwartet] of referenzen) {
    const it = alle.find((x) => muster.test(x.title || ''));
    if (!it) { console.log(`  ? ${name}: nicht gefunden`); continue; }
    const a = N.ausTimeIntervals(it.timeIntervals);
    const hatStruktur = N.TAGE.some((t) => a[t].status !== 'unbekannt');
    const frei = N.ausFreitext(txt(it, 'openings'), txt(it, 'dayoff'));
    let ist;
    if (['nicht_strukturierbar','saisonal','saisonal_mehrdeutig'].includes(frei.typ)) ist = 'kein fall';
    else if (!hatStruktur) ist = frei.typ === 'strukturiert' ? 'direkt-vorschlag' : 'kein fall';
    else if (frei.typ !== 'strukturiert') ist = 'kein fall';
    else ist = N.vergleiche(a, frei.woche).einig ? 'einig' : 'ABWEICHUNG';
    const ok = ist === erwartet ? '✓' : '✗';
    console.log(`  ${ok} ${name.padEnd(28)} erwartet: ${erwartet.padEnd(17)} ist: ${ist}`);
    if (ist !== erwartet) {
      console.log(`      A (timeIntervals): ${N.wocheAlsText(a)}`);
      if (frei.woche) console.log(`      B (Freitext)     : ${N.wocheAlsText(frei.woche)}`);
      console.log(`      Freitext: ${JSON.stringify(txt(it, 'openings').slice(0, 120))}`);
    }
  }

  if (strukturVorschlaege.length) {
    console.log(`\n=== DIREKT-VORSCHLÄGE (${strukturVorschlaege.length}) — erste 6 ===`);
    for (const { it, woche } of strukturVorschlaege.slice(0, 6)) {
      console.log(`  ${it.id}  ${(it.title || '').slice(0, 40)}`);
      console.log(`      → ${N.wocheAlsText(woche)}`);
    }
  }

  console.log(`\n=== ABWEICHUNGEN — erste ${zeigeAbw} von ${abweichungen.length} (zum Nachschärfen) ===`);
  for (const { it, a, frei, v } of abweichungen.slice(0, zeigeAbw)) {
    console.log(`\n  ${it.id}  ${(it.title || '').slice(0, 50)}`);
    console.log(`    A: ${N.wocheAlsText(a)}`);
    console.log(`    B: ${N.wocheAlsText(frei.woche)}`);
    console.log(`    Tage mit Abweichung: ${v.abweichungen.map((x) => x.tag.slice(0, 2)).join(',')}`);
    console.log(`    Freitext: ${JSON.stringify(txt(it, 'openings').replace(/\s+/g, ' ').slice(0, 110))}`);
  }
})().catch((e) => {
  console.error('Fehler:', e.message);
  process.exit(1);
});
