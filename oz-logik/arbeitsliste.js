/**
 * Erzeugt die priorisierte Arbeitsliste — das, was der Workflow `OZ-1 Prüflauf`
 * später ausgibt, hier schon vollständig und ohne n8n.
 *
 * Führt zwei Quellen zusammen:
 *   - die öffentliche meta-Schnittstelle (Öffnungszeiten, Freitexte, Webseite)
 *   - den Backend-Export (zuständige Personen, echtes Redaktionsdatum)
 *
 * Ausführen:
 *   node oz-logik/arbeitsliste.js "PAGES-PrintOnDemand_20260901095241.xlsx"
 *   node oz-logik/arbeitsliste.js "…xlsx" --mit-webseiten --anzahl 40
 *
 * ⚠️ Die Ausgabe enthält dienstliche E-Mail-Adressen — landet unter oz-logik/daten/
 *    und ist per .gitignore vom Repo ausgeschlossen.
 */

const fs = require('fs');
const path = require('path');
const N = require('./normalisieren');
const W = require('./webseite');
const Z = require('./zustaendige');

const BASE = 'https://meta.et4.de/rest.ashx/search/'
  + '?experience=teutoburgerwald&type=Gastro&template=ET2014A.json';

/** Fällt kein Mensch als zuständig an, geht die Anfrage an die Regionsredaktion. */
const RUECKFALL_REDAKTION = 'redaktion@teutoburgerwald.de';

const MONATE_GRENZE = 12;

const arg = (name, standard) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : standard;
};

async function ladeDatensaetze() {
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

const text = (item, rel) => {
  const t = (item.texts || []).find((x) => x.rel === rel && x.value);
  return t ? t.value : '';
};

/**
 * Taugt ein aus dem Freitext gelesener Vorschlag zur ungeprüften Übernahme?
 *
 * Nein, wenn ein Tag überlappende oder mehr als zwei Zeitspannen hat — dann hat der
 * Freitext-Parser Zeiten vermischt. Belegt an 100044620 (Haus Hagemeyer):
 * "Do 11:00–13:30, 11:30–13:30, ab 17:00, 18:00–20:30". Solche Vorschläge gehen an
 * einen Menschen, nicht in die Datenbank.
 */
function vorschlagIstSauber(woche) {
  for (const t of N.TAGE) {
    const iv = woche[t].iv || [];
    if (iv.length > 2) return false;
    for (let i = 1; i < iv.length; i++) {
      if (iv[i][0] < iv[i - 1][1]) return false;
    }
  }
  return true;
}

/**
 * Ordnet einem Datensatz seinen Grund und seine Priorität zu.
 *
 * Priorität 1 wiegt am schwersten, obwohl sie die kleinste Menge ist: leere
 * `timeIntervals` erscheinen im TeutoNavigator als **„immer geöffnet"**, also als
 * aktiv falsche Aussage — nicht als fehlende Angabe.
 *
 * Priorität 3 löst bewusst **keine Mail** aus: dort ist kein Fehler bekannt, nur
 * Alter. Eine Anfrage ohne konkrete Frage ("welche dieser Fassungen stimmt?") ist
 * das "pflegt mal eure Daten", das niemand liest. Diese Fälle laufen zuerst gegen
 * die Betriebs-Webseite; findet sich dort ein Widerspruch, werden sie zu Prio 2.
 */
function beurteile(item, zust, stand) {
  const a = N.ausTimeIntervals(item.timeIntervals);
  const hatStruktur = N.TAGE.some((t) => a[t].status !== 'unbekannt');
  const frei = N.ausFreitext(text(item, 'openings'), text(item, 'dayoff'));
  const monate = zust ? Z.monateSeitPflege(zust, stand) : null;

  if (!hatStruktur) {
    if (frei.typ === 'strukturiert') {
      const sauber = vorschlagIstSauber(frei.woche);
      return {
        prio: 1,
        grund: sauber
          ? 'leer — öffentlich "immer geöffnet", Zeiten stehen im eigenen Freitext'
          : 'leer — Freitext lesbar, aber Zeiten überlappen: Vorschlag prüfen',
        weg: sauber ? 'direkt-vorschlag' : 'vorschlag-pruefen',
        varianteA: null, varianteB: N.wocheAlsText(frei.woche),
      };
    }
    return {
      prio: 1, grund: `leer — öffentlich "immer geöffnet" (${frei.typ})`,
      weg: 'anfrage', varianteA: null, varianteB: null,
    };
  }

  if (frei.typ === 'strukturiert') {
    const v = N.vergleiche(a, frei.woche);
    if (!v.einig) {
      return {
        prio: 2, grund: `widerspricht dem eigenen Freitext (${v.abweichungen.map((x) => x.tag.slice(0, 2)).join(',')})`,
        weg: 'anfrage', varianteA: N.wocheAlsText(a), varianteB: N.wocheAlsText(frei.woche),
      };
    }
  }

  if (monate !== null && monate > MONATE_GRENZE) {
    return {
      prio: 3, grund: `seit ${Math.round(monate)} Monaten kein Mensch dran`,
      weg: 'webseite-pruefen', varianteA: N.wocheAlsText(a), varianteB: null,
    };
  }
  if (monate === null) {
    return {
      prio: 3, grund: 'nie von einem Menschen gepflegt (nur technische Konten)',
      weg: 'webseite-pruefen', varianteA: N.wocheAlsText(a), varianteB: null,
    };
  }

  return null; // kein Fall
}

(async () => {
  const xlsx = process.argv[2];
  if (!xlsx) {
    console.error('Aufruf: node oz-logik/arbeitsliste.js <export.xlsx> [--mit-webseiten] [--anzahl N]');
    process.exit(1);
  }

  const stand = new Date();
  const datensaetze = await ladeDatensaetze();
  const zustListe = Z.leseZustaendige(xlsx);
  const zustNachId = new Map(zustListe.map((e) => [e.id, e]));

  console.log(`destination.data: ${datensaetze.length} Gastro-Datensätze`);
  console.log(`Backend-Export:   ${zustListe.length} Zeilen, `
    + `${datensaetze.filter((i) => zustNachId.has(String(i.id))).length} davon zuordenbar\n`);

  const liste = [];
  for (const item of datensaetze) {
    const zust = zustNachId.get(String(item.id));
    const urteil = beurteile(item, zust, stand);
    if (!urteil) continue;

    const empfaenger = [];
    if (item.email) empfaenger.push({ rolle: 'gastronom', email: item.email });
    for (const e of (zust ? zust.empfaenger : [])) empfaenger.push(e);
    const ohneRedaktion = empfaenger.filter((e) => e.rolle !== 'gastronom').length === 0;
    if (ohneRedaktion) empfaenger.push({ rolle: 'redaktion', email: RUECKFALL_REDAKTION });

    liste.push({
      prio: urteil.prio,
      id: item.id,
      name: item.title,
      ort: item.city,
      grund: urteil.grund,
      weg: urteil.weg,
      varianteA: urteil.varianteA,
      varianteB: urteil.varianteB,
      web: item.web || '',
      gaesteLink: N.oeffentlicherLink(item),
      letzteMenschlichePflege: zust ? (zust.letzteMenschlichePflege || '').slice(0, 10) : '',
      zuletztTechnisch: zust ? zust.zuletztTechnisch : null,
      empfaenger,
      ohneZustaendige: ohneRedaktion,
    });
  }

  liste.sort((a, b) => a.prio - b.prio || String(a.ort).localeCompare(String(b.ort)));

  // Optional: Quelle C dazu, für die ersten N Fälle.
  if (process.argv.includes('--mit-webseiten')) {
    const wieViele = arg('--anzahl', 30);
    const mitWeb = liste.filter((e) => e.web).slice(0, wieViele);
    console.log(`Webseiten prüfen für ${mitWeb.length} Fälle …`);
    let naechster = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      for (;;) {
        const i = naechster++;
        if (i >= mitWeb.length) return;
        const r = await W.leseWebseite(mitWeb[i].web, 12000);
        mitWeb[i].webseite = r.status === 'json-ld'
          ? { status: r.status, woche: N.wocheAlsText(r.woche), quelle: r.gefundenAuf }
          : { status: r.status, kandidaten: r.kandidaten || null, quelle: r.gefundenAuf || null };
      }
    }));
  }

  const zielDir = path.join(__dirname, 'daten');
  fs.mkdirSync(zielDir, { recursive: true });
  fs.writeFileSync(path.join(zielDir, 'arbeitsliste.json'), JSON.stringify(liste, null, 1), 'utf8');

  const feld = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['prio,id,name,ort,grund,weg,variante_a,variante_b,letzte_menschliche_pflege,empfaenger,gaeste_link']
    .concat(liste.map((e) => [
      e.prio, e.id, e.name, e.ort, e.grund, e.weg, e.varianteA || '', e.varianteB || '',
      e.letzteMenschlichePflege, e.empfaenger.map((x) => `${x.rolle}:${x.email}`).join(' '), e.gaesteLink,
    ].map(feld).join(',')))
    .join('\n');
  fs.writeFileSync(path.join(zielDir, 'arbeitsliste.csv'), csv, 'utf8');

  const nachPrio = (p) => liste.filter((e) => e.prio === p);
  console.log('=== ARBEITSLISTE ===');
  const WEG_TEXT = {
    'direkt-vorschlag': 'ohne Rückfrage lösbar',
    'vorschlag-pruefen': 'Vorschlag da, Mensch muss prüfen',
    anfrage: 'Anfrage per Mail',
    'webseite-pruefen': 'erst Webseite prüfen, keine Mail',
  };
  for (const p of [1, 2, 3]) {
    const teil = nachPrio(p);
    console.log(`Priorität ${p}: ${String(teil.length).padStart(4)} Fälle`);
    for (const [weg, beschriftung] of Object.entries(WEG_TEXT)) {
      const n = teil.filter((e) => e.weg === weg).length;
      if (n) console.log(`             ${String(n).padStart(4)} ${beschriftung}`);
    }
  }
  console.log(`----------------------------`);
  console.log(`gesamt:     ${String(liste.length).padStart(4)} von ${datensaetze.length}`);
  console.log(`ohne zuständige Person → Redaktion: ${liste.filter((e) => e.ohneZustaendige).length}`);
  console.log(`Mails insgesamt zu versenden:       ${liste.filter((e) => e.weg === 'anfrage').reduce((s, e) => s + e.empfaenger.length, 0)}`);

  console.log('\n=== PRIORITÄT 1 — öffentlich "immer geöffnet" ===');
  for (const e of nachPrio(1)) {
    console.log(`  ${e.id}  ${String(e.name).slice(0, 38).padEnd(39)} ${e.weg === 'direkt-vorschlag' ? '→ Vorschlag' : '→ Anfrage  '}  ${e.ort}`);
    if (e.varianteB) console.log(`         Vorschlag: ${e.varianteB.slice(0, 130)}`);
  }

  console.log('\ngeschrieben: oz-logik/daten/arbeitsliste.json und .csv');
})().catch((e) => {
  console.error('Fehler:', e.message);
  process.exit(1);
});
