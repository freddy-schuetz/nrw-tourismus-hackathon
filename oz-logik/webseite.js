/**
 * Quelle C — Öffnungszeiten von der Webseite des Betriebs lesen.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *   1. schema.org-Daten (JSON-LD) — exakt, maschinenlesbar, KEINE KI nötig.
 *      Viele Gastro-Webseiten liefern das für Google mit.
 *   2. Textkandidaten — die Abschnitte der Seite, in denen Öffnungszeiten stehen
 *      könnten. Die gehen später an die KI bzw. an den Freitext-Parser.
 *
 * Weg 1 ist Weg 2 immer vorzuziehen: exakte Werte statt geratener.
 *
 * Ohne Abhängigkeiten, damit der Code in einen n8n Code Node passt. Das Abrufen
 * selbst übernimmt in n8n der HTTP-Request-Node — hier nur zum Messen und Testen.
 */

const N = require('./normalisieren');

/** schema.org schreibt Wochentage englisch, teils als volle URL. */
const SCHEMA_TAG = {
  monday: 'Monday', mon: 'Monday', mo: 'Monday',
  tuesday: 'Tuesday', tue: 'Tuesday', tues: 'Tuesday', tu: 'Tuesday',
  wednesday: 'Wednesday', wed: 'Wednesday', we: 'Wednesday',
  thursday: 'Thursday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', th: 'Thursday',
  friday: 'Friday', fri: 'Friday', fr: 'Friday',
  saturday: 'Saturday', sat: 'Saturday', sa: 'Saturday',
  sunday: 'Sunday', sun: 'Sunday', su: 'Sunday',
  publicholidays: null, // gültiger Wert, aber kein Wochentag
};

function schemaTag(wert) {
  if (typeof wert !== 'string') return undefined;
  // "https://schema.org/Monday" → "monday"
  const roh = wert.split(/[/#]/).pop().trim().toLowerCase().replace(/\.$/, '');
  return SCHEMA_TAG[roh];
}

/**
 * schema.org-Uhrzeit ("11:00", manchmal "11:00:00") → Minuten seit Mitternacht.
 *
 * Nutzt bewusst `zeitZuMinuten` aus normalisieren.js weiter, statt die Umwandlung
 * ein zweites Mal zu schreiben. Der Name darf sich NICHT mit einer Funktion aus
 * normalisieren.js überschneiden — beide Dateien landen in einem n8n Code Node in
 * einem gemeinsamen Namensraum (siehe baue-n8n-bundle.js).
 */
function schemaZeit(wert) {
  if (typeof wert !== 'string') return null;
  const m = /^(\d{1,2}:\d{2})/.exec(wert.trim());
  return m ? N.zeitZuMinuten(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Weg 1: JSON-LD
// ---------------------------------------------------------------------------

/** Holt alle JSON-LD-Blöcke aus dem HTML und parst sie einzeln (fehlertolerant). */
function jsonLdBloecke(html) {
  const bloecke = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const roh = m[1].trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
    try {
      bloecke.push(JSON.parse(roh));
    } catch {
      // Kaputtes JSON-LD ist auf echten Seiten häufig — überspringen, nicht abbrechen.
    }
  }
  return bloecke;
}

/** Läuft durch verschachtelte Objekte/Arrays und sammelt alle Öffnungszeit-Angaben. */
function sammleAngaben(knoten, treffer = [], tiefe = 0) {
  if (!knoten || typeof knoten !== 'object' || tiefe > 8) return treffer;
  if (Array.isArray(knoten)) {
    for (const k of knoten) sammleAngaben(k, treffer, tiefe + 1);
    return treffer;
  }
  if (knoten.openingHoursSpecification) {
    treffer.push({ art: 'spec', wert: knoten.openingHoursSpecification });
  }
  if (knoten.openingHours) {
    treffer.push({ art: 'string', wert: knoten.openingHours });
  }
  for (const wert of Object.values(knoten)) sammleAngaben(wert, treffer, tiefe + 1);
  return treffer;
}

/** "Mo-Fr 11:00-22:00" / "Sa 12:00-23:00" — die String-Schreibweise von schema.org. */
function ausOpeningHoursString(text, woche) {
  let erkannt = false;
  for (const zeile of String(text).split(/[;\n]/)) {
    const m = /^\s*([A-Za-z,\s-]+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(zeile);
    if (!m) continue;
    const von = schemaZeit(m[2]);
    const bis = schemaZeit(m[3]);
    if (von === null || bis === null) continue;

    const tage = [];
    for (const stueck of m[1].split(',')) {
      const bereich = /^\s*([A-Za-z]+)\s*-\s*([A-Za-z]+)\s*$/.exec(stueck);
      if (bereich) {
        const a = N.TAGE.indexOf(schemaTag(bereich[1]));
        const b = N.TAGE.indexOf(schemaTag(bereich[2]));
        if (a >= 0 && b >= 0) {
          for (let i = a; ; i = (i + 1) % 7) {
            tage.push(N.TAGE[i]);
            if (i === b) break;
          }
        }
      } else {
        const t = schemaTag(stueck);
        if (t) tage.push(t);
      }
    }
    for (const t of new Set(tage)) {
      setzeSpanne(woche[t], von, bis);
      erkannt = true;
    }
  }
  return erkannt;
}

/**
 * ⚠️ Achtung, Kodierungs-Falle: `00:00`–`00:00` bedeutet bei schema.org
 * **geschlossen** — genau umgekehrt wie in destination.data, wo dieselbe
 * Schreibweise "24 Stunden offen" heißt.
 *
 * Belegt am Datensatz 100043526 (Eiscafé Alte Kantorei): dessen JSON-LD enthält
 * `{"dayOfWeek":["Monday","Thursday"],"opens":"00:00","closes":"00:00"}`, und
 * destination.data führt Montag und Donnerstag als Ruhetage. Verwechselt man das,
 * meldet der Abgleich für jeden Ruhetag einen Widerspruch.
 *
 * `00:00`–`23:59` ist dagegen die schema.org-Schreibweise für durchgehend offen.
 */
function setzeSpanne(tagObj, von, bis) {
  if (von === 0 && bis === 0) {
    tagObj.status = 'geschlossen';
    tagObj.iv = [];
    return;
  }
  if (von === 0 && (bis === 1439 || bis === 1440)) {
    tagObj.status = 'offen';
    tagObj.iv = [[0, 1440]];
    return;
  }
  N.ergaenze(tagObj, von, bis);
}

/**
 * @param {string} html - Quelltext der Seite
 * @returns {{woche: Object, quelle: string, rohAngaben: number}|null}
 */
function ausJsonLd(html) {
  const angaben = [];
  for (const block of jsonLdBloecke(html)) sammleAngaben(block, angaben);
  if (angaben.length === 0) return null;

  const woche = N.leereWoche();
  let erkannt = false;

  for (const { art, wert } of angaben) {
    if (art === 'string') {
      const werte = Array.isArray(wert) ? wert : [wert];
      for (const w of werte) if (ausOpeningHoursString(w, woche)) erkannt = true;
      continue;
    }
    const specs = Array.isArray(wert) ? wert : [wert];
    for (const spec of specs) {
      if (!spec || typeof spec !== 'object') continue;
      // Ein Spec mit validFrom/validThrough gilt nur für einen Zeitraum —
      // genauso mehrdeutig wie Saison-Freitexte, also überspringen.
      if (spec.validFrom || spec.validThrough) continue;

      const rohTage = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
      const tage = rohTage.map(schemaTag).filter((t) => t);
      if (tage.length === 0) continue;

      const von = schemaZeit(spec.opens);
      const bis = schemaZeit(spec.closes);

      for (const t of new Set(tage)) {
        if (spec.isClosed === true) {
          woche[t].status = 'geschlossen';
          woche[t].iv = [];
          erkannt = true;
        } else if (von !== null && bis !== null) {
          setzeSpanne(woche[t], von, bis);
          erkannt = true;
        }
      }
    }
  }

  if (!erkannt) return null;

  // Tage ohne Angabe gelten als geschlossen — schema.org listet nur Öffnungstage.
  for (const t of N.TAGE) if (woche[t].status === 'unbekannt') woche[t].status = 'geschlossen';

  return { woche, quelle: 'schema.org (JSON-LD)', rohAngaben: angaben.length };
}

// ---------------------------------------------------------------------------
// Weg 2: Textkandidaten
// ---------------------------------------------------------------------------

const OZ_STICHWORT = /(öffnungszeit|geöffnet|ruhetag|wir haben für sie|opening hours|geschlossen)/i;

/** Entfernt Skripte, Styles und Tags und normalisiert Leerraum. */
function nurText(html) {
  return html
    .replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&(auml|Auml|ouml|Ouml|uuml|Uuml|szlig);/g, (_, e) => ({
      auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', szlig: 'ß',
    }[e]))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Liefert die Textabschnitte, in denen Öffnungszeiten stehen könnten — nicht die
 * ganze Seite. Das hält den KI-Aufruf klein und billig.
 *
 * @returns {string[]} bis zu 3 Abschnitte, je max. 600 Zeichen
 */
function textKandidaten(html) {
  const text = nurText(html);
  const zeilen = text.split('\n');
  const kandidaten = [];

  for (let i = 0; i < zeilen.length; i++) {
    if (!OZ_STICHWORT.test(zeilen[i])) continue;
    // Stichwort plus etwas Umfeld — Zeiten stehen oft in der Zeile darunter.
    const block = zeilen.slice(Math.max(0, i - 1), i + 8).join('\n').trim();
    if (!/\d/.test(block)) continue;
    kandidaten.push(block.slice(0, 600));
    i += 6;
    if (kandidaten.length >= 3) break;
  }

  return kandidaten;
}

/**
 * Beschriftet die Textabschnitte für die KI-Eingabe.
 *
 * Nicht einfach mit "---" verkleben: im Test vom 31.08.2026 musste ein Prüfer den
 * Trenner erst als Artefakt erkennen. Numerierte Abschnitte sind eindeutig — und die
 * KI kann melden, dass sich zwei Abschnitte widersprechen (verschiedene Betriebe an
 * einer Adresse), statt sie zu verschmelzen.
 */
function kandidatenAlsPrompt(kandidaten) {
  return kandidaten
    .map((k, i) => `[Abschnitt ${i + 1}]\n${k.trim()}`)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Abrufen
// ---------------------------------------------------------------------------

/**
 * Ruft eine Seite ab. Fehler sind hier normal (tote Links, Zertifikate, Timeouts)
 * und werden zurückgegeben, nicht geworfen — eine stumme Quelle ist kein Widerspruch.
 */
async function holeSeite(url, timeoutMs = 12000) {
  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: abbruch.signal,
      redirect: 'follow',
      headers: {
        // Ehrlicher Absender statt getarnter Browser-Kennung.
        'User-Agent': 'destination-data-Oeffnungszeiten-Abgleich/0.1 (Datenpflege teutoburgerwald)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
    });
    if (!res.ok) return { ok: false, status: res.status, fehler: `HTTP ${res.status}` };
    const typ = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(typ)) {
      return { ok: false, status: res.status, fehler: `kein HTML (${typ.split(';')[0]})` };
    }
    // Sehr große Seiten abschneiden — Öffnungszeiten stehen nie bei Zeichen 3 Mio.
    const html = (await res.text()).slice(0, 900000);
    return { ok: true, status: res.status, html, finalUrl: res.url };
  } catch (e) {
    const grund = e.name === 'AbortError' ? 'Timeout' : (e.cause?.code || e.message);
    return { ok: false, status: 0, fehler: String(grund) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Links, hinter denen Öffnungszeiten stehen könnten — nach Aussagekraft sortiert.
 * Auf vielen Betriebs-Seiten stehen die Zeiten nicht auf der Startseite, sondern
 * unter "Kontakt" oder "Öffnungszeiten".
 */
const UNTERSEITE_MUSTER = [
  { re: /öffnungszeit|oeffnungszeit|opening-hours/i, gewicht: 3 },
  { re: /\bzeiten\b|reservier|tisch/i, gewicht: 2 },
  { re: /kontakt|anfahrt|impressum|ueber-uns|über-uns|standort/i, gewicht: 1 },
];

function unterseitenKandidaten(html, basisUrl, max = 2) {
  let basis;
  try {
    basis = new URL(basisUrl);
  } catch {
    return [];
  }

  const gefunden = new Map();
  const re = /<a[^>]+href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,140}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let ziel;
    try {
      ziel = new URL(m[1], basis);
    } catch {
      continue;
    }
    if (ziel.hostname !== basis.hostname) continue;
    if (!/^https?:$/.test(ziel.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?|mp4)$/i.test(ziel.pathname)) continue;
    if (ziel.href.replace(/\/$/, '') === basis.href.replace(/\/$/, '')) continue;

    const heuhaufen = `${ziel.pathname} ${nurText(m[2])}`;
    for (const { re: muster, gewicht } of UNTERSEITE_MUSTER) {
      if (!muster.test(heuhaufen)) continue;
      const alt = gefunden.get(ziel.href) || 0;
      if (gewicht > alt) gefunden.set(ziel.href, gewicht);
      break;
    }
  }

  return [...gefunden.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([href]) => href);
}

/** Wertet einen Seiten-Quelltext aus: erst JSON-LD, dann Textkandidaten. */
function werteAus(html) {
  const jsonLd = ausJsonLd(html);
  if (jsonLd) return { status: 'json-ld', woche: jsonLd.woche, quelle: jsonLd.quelle };
  const kandidaten = textKandidaten(html);
  if (kandidaten.length > 0) return { status: 'text', kandidaten };
  return { status: 'kein-fund' };
}

/**
 * Alles zusammen: Startseite holen und auswerten. Findet sich dort nichts, bis zu
 * zwei passende Unterseiten nachladen (Öffnungszeiten, Kontakt …).
 *
 * @returns {{status: 'json-ld'|'text'|'kein-fund'|'nicht-erreichbar',
 *            woche?: Object, kandidaten?: string[], gefundenAuf?: string, fehler?: string}}
 */
async function leseWebseite(url, timeoutMs, mitUnterseiten = true) {
  const seite = await holeSeite(url, timeoutMs);
  if (!seite.ok) return { status: 'nicht-erreichbar', fehler: seite.fehler };

  const direkt = werteAus(seite.html);
  if (direkt.status !== 'kein-fund') return { ...direkt, gefundenAuf: seite.finalUrl || url };
  if (!mitUnterseiten) return direkt;

  for (const unterseite of unterseitenKandidaten(seite.html, seite.finalUrl || url)) {
    const s = await holeSeite(unterseite, timeoutMs);
    if (!s.ok) continue;
    const res = werteAus(s.html);
    if (res.status !== 'kein-fund') return { ...res, gefundenAuf: unterseite };
  }

  return { status: 'kein-fund' };
}

module.exports = {
  ausJsonLd,
  jsonLdBloecke,
  unterseitenKandidaten,
  textKandidaten,
  kandidatenAlsPrompt,
  nurText,
  holeSeite,
  leseWebseite,
};
