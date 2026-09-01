/**
 * Zuständige Personen aus dem destination.data-Backend-Export lesen.
 *
 * Löst zwei Dinge, die die öffentliche Lese-Schnittstelle NICHT liefert:
 *
 *   1. **Wer ist zuständig?** Die Schnittstelle hat `author` immer leer. Der Export
 *      hat "Erstellt durch" und "Letzte Änderung durch" als E-Mail-Adressen —
 *      100 % gefüllt, 129 Ersteller, 93 Bearbeiter.
 *
 *   2. **Wann hat zuletzt ein MENSCH gepflegt?** Das API-Feld `changed` wird von
 *      technischen Importen mitgeschrieben und ist als Maß dafür wertlos: bei 990
 *      von 1130 Datensätzen weicht es um mehr als 36 Stunden vom Export ab. Das
 *      Export-Datum plus "Letzte Änderung durch" trennt beides — ist der letzte
 *      Bearbeiter ein technisches Konto (one.intelligence, import_user_*, DeepL),
 *      war es keine redaktionelle Pflege.
 *
 * ⚠️ Die Ausgabe enthält dienstliche E-Mail-Adressen von Kolleg:innen. Sie landet
 *    unter oz-logik/daten/ und ist per .gitignore vom Repo ausgeschlossen.
 *
 * Ausführen:  node oz-logik/zustaendige.js "PAGES-PrintOnDemand_20260901095241.xlsx"
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// xlsx lesen — ohne Fremdbibliothek: ein xlsx ist ein ZIP mit XML darin.
// ---------------------------------------------------------------------------

function entschluessle(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function spaltenIndex(zelle) {
  let n = 0;
  for (const c of zelle.replace(/\d/g, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Entpackt eine Datei aus dem xlsx-ZIP nach stdout. */
function ausZip(xlsxPfad, eintrag) {
  return execFileSync('unzip', ['-p', xlsxPfad, eintrag], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * @returns {{kopf: string[], zeilen: string[][]}}
 */
function leseTabelle(xlsxPfad) {
  const texte = [];
  for (const m of ausZip(xlsxPfad, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let t = '';
    for (const tm of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += tm[1];
    texte.push(entschluessle(t));
  }

  const blatt = ausZip(xlsxPfad, 'xl/worksheets/sheet1.xml');
  const zeilen = [];
  for (const rm of blatt.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const z = [];
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[3]);
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(cm[3]);
      let wert = '';
      if (inline) wert = entschluessle(inline[1]);
      else if (v) wert = /t="s"/.test(cm[2]) ? (texte[Number(v[1])] ?? '') : entschluessle(v[1]);
      z[spaltenIndex(cm[1])] = wert;
    }
    zeilen.push(z);
  }

  return { kopf: zeilen[0] || [], zeilen: zeilen.slice(1) };
}

// ---------------------------------------------------------------------------
// Auswerten
// ---------------------------------------------------------------------------

/**
 * Technische Konten, die im Backend als Bearbeiter auftauchen. An die geht KEINE
 * Mail, und ihre Änderungen zählen nicht als redaktionelle Pflege.
 * Erkennungsmerkmal: keine E-Mail-Adresse.
 */
function istMensch(wer) {
  return typeof wer === 'string' && wer.includes('@');
}

/** "01.09.2026 09:52:41" → Date (oder null). */
function ausDeutschemDatum(s) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})[ ]?(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || '').trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]),
    Number(m[4]), Number(m[5]), Number(m[6] || 0));
}

/**
 * @param {string} xlsxPfad
 * @returns {Array<Object>} ein Eintrag pro Datensatz
 */
function leseZustaendige(xlsxPfad) {
  const { kopf, zeilen } = leseTabelle(xlsxPfad);
  const s = (name) => {
    const i = kopf.indexOf(name);
    if (i === -1) throw new Error(`Spalte "${name}" fehlt im Export. Vorhanden: ${kopf.join(', ')}`);
    return i;
  };
  const cId = s('Id');
  const cName = s('Name');
  const cOrt = s('Ort');
  const cGeaendertVon = s('Letzte Änderung durch');
  const cGeaendertAm = s('Letzte Änderung');
  const cErstelltVon = s('Erstellt durch');
  const cErstelltAm = s('Erstellt');

  const eintraege = [];
  for (const z of zeilen) {
    const id = String(z[cId] || '').trim();
    if (!id) continue;

    const geaendertVon = String(z[cGeaendertVon] || '').trim();
    const erstelltVon = String(z[cErstelltVon] || '').trim();
    const geaendertAm = ausDeutschemDatum(z[cGeaendertAm]);
    const erstelltAm = ausDeutschemDatum(z[cErstelltAm]);

    // Wann hat zuletzt ein Mensch Hand angelegt? Nur wenn der letzte Bearbeiter
    // ein Mensch war, ist das Änderungsdatum dafür belastbar. Sonst bleibt als
    // Untergrenze das Anlagedatum, falls es ein Mensch angelegt hat.
    let letzteMenschlichePflege = null;
    if (istMensch(geaendertVon) && geaendertAm) letzteMenschlichePflege = geaendertAm;
    else if (istMensch(erstelltVon) && erstelltAm) letzteMenschlichePflege = erstelltAm;

    // Empfänger: Bearbeiter und Ersteller, nur Menschen, ohne Doppelte.
    const empfaenger = [];
    if (istMensch(geaendertVon)) empfaenger.push({ rolle: 'bearbeiter', email: geaendertVon });
    if (istMensch(erstelltVon) && erstelltVon !== geaendertVon) {
      empfaenger.push({ rolle: 'ersteller', email: erstelltVon });
    }

    eintraege.push({
      id,
      name: String(z[cName] || '').trim(),
      ort: String(z[cOrt] || '').trim(),
      geaendertVon,
      geaendertAm: geaendertAm ? geaendertAm.toISOString() : null,
      erstelltVon,
      erstelltAm: erstelltAm ? erstelltAm.toISOString() : null,
      zuletztTechnisch: !istMensch(geaendertVon),
      letzteMenschlichePflege: letzteMenschlichePflege ? letzteMenschlichePflege.toISOString() : null,
      empfaenger,
    });
  }
  return eintraege;
}

/**
 * Monate seit der letzten menschlichen Pflege. `null`, wenn unbekannt.
 * @param {Object} eintrag
 * @param {Date} stand - Bezugszeitpunkt (bewusst übergeben, nicht new Date(), damit testbar)
 */
function monateSeitPflege(eintrag, stand) {
  if (!eintrag.letzteMenschlichePflege) return null;
  const d = new Date(eintrag.letzteMenschlichePflege);
  return (stand - d) / (1000 * 60 * 60 * 24 * 30.44);
}

module.exports = { leseTabelle, leseZustaendige, monateSeitPflege, istMensch, ausDeutschemDatum };

// ---------------------------------------------------------------------------
// Als Skript: Tabelle erzeugen und Kennzahlen ausgeben
// ---------------------------------------------------------------------------

if (require.main === module) {
  const xlsx = process.argv[2];
  if (!xlsx) {
    console.error('Aufruf: node oz-logik/zustaendige.js <export.xlsx>');
    process.exit(1);
  }

  const eintraege = leseZustaendige(xlsx);
  const zielDir = path.join(__dirname, 'daten');
  fs.mkdirSync(zielDir, { recursive: true });

  const jsonPfad = path.join(zielDir, 'zustaendige.json');
  fs.writeFileSync(jsonPfad, JSON.stringify(eintraege, null, 1), 'utf8');

  // CSV zum Einlesen in eine n8n Data Table.
  const csvPfad = path.join(zielDir, 'zustaendige.csv');
  const csvFeld = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['id,name,ort,bearbeiter_email,ersteller_email,letzte_menschliche_pflege,zuletzt_technisch']
    .concat(eintraege.map((e) => [
      e.id, e.name, e.ort,
      (e.empfaenger.find((x) => x.rolle === 'bearbeiter') || {}).email || '',
      (e.empfaenger.find((x) => x.rolle === 'ersteller') || {}).email || '',
      e.letzteMenschlichePflege ? e.letzteMenschlichePflege.slice(0, 10) : '',
      e.zuletztTechnisch ? 'ja' : 'nein',
    ].map(csvFeld).join(',')))
    .join('\n');
  fs.writeFileSync(csvPfad, csv, 'utf8');

  const stand = new Date();
  const mitPflege = eintraege.filter((e) => e.letzteMenschlichePflege);
  const alt = (m) => mitPflege.filter((e) => monateSeitPflege(e, stand) > m).length;
  const ohneEmpfaenger = eintraege.filter((e) => e.empfaenger.length === 0).length;

  console.log(`Datensätze:                          ${eintraege.length}`);
  console.log(`mit mindestens einem Empfänger:      ${eintraege.length - ohneEmpfaenger}`);
  console.log(`  ohne jeden menschlichen Kontakt:   ${ohneEmpfaenger}`);
  console.log(`zuletzt von technischem Konto:       ${eintraege.filter((e) => e.zuletztTechnisch).length}`);
  console.log(`letzte menschliche Pflege bekannt:   ${mitPflege.length}`);
  console.log(`  älter als 12 Monate:               ${alt(12)}`);
  console.log(`  älter als 24 Monate:               ${alt(24)}`);
  console.log(`  älter als 36 Monate:               ${alt(36)}`);
  console.log(`\ngeschrieben: ${path.relative(process.cwd(), jsonPfad)}`);
  console.log(`geschrieben: ${path.relative(process.cwd(), csvPfad)}`);
  console.log('(beide per .gitignore vom Repo ausgeschlossen — enthalten dienstliche Mailadressen)');
}
