/**
 * Öffnungszeiten normalisieren und vergleichen.
 *
 * Kern des Öffnungszeiten-Abgleichs (siehe mein-use-case.md). Bringt Zeiten aus
 * verschiedenen Quellen in EIN Format, damit "Mo 11-14, 17-22" und
 * "Montag 11:00–14:00 und 17:00–22:00 Uhr" als gleich erkannt werden.
 *
 * Bewusst ohne Abhängigkeiten und ohne n8n-Bezug, damit der Code unverändert in
 * einen n8n Code Node kopiert werden kann (dort: kein {{ }}, $json direkt).
 *
 * Format pro Wochentag:
 *   { status: 'offen'|'geschlossen'|'unbekannt', iv: [[vonMin, bisMin], ...], offenesEnde: bool }
 * Minuten seit Mitternacht. Über Mitternacht: bisMin > 1440.
 */

const TAGE = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const TAG_DE = {
  montag: 'Monday', mo: 'Monday',
  dienstag: 'Tuesday', di: 'Tuesday',
  mittwoch: 'Wednesday', mi: 'Wednesday',
  donnerstag: 'Thursday', do: 'Thursday',
  freitag: 'Friday', fr: 'Friday',
  samstag: 'Saturday', sa: 'Saturday', sonnabend: 'Saturday',
  sonntag: 'Sunday', so: 'Sunday',
};

const UNBEKANNT = () => {
  const o = {};
  for (const t of TAGE) o[t] = { status: 'unbekannt', iv: [], offenesEnde: false };
  return o;
};

/** "Auf Anfrage" & Co. — gültige Aussagen, keine Öffnungszeiten. Nie strukturieren. */
const NICHT_STRUKTURIERBAR = /auf anfrage|nach absprache|nach vereinbarung|auf vorbestellung|individuelle? öffnungszeit|auf wunsch|jederzeit/i;

/** Reine Saison-Aussagen ohne Wochentage. */
const SAISON = /(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|sommersaison|wintersaison|saison)/i;

const DURCHGEHEND = /durchgehend|rund um die uhr|24\s*(h|stunden)|ganztägig/i;

const RUHETAG = /ruhetag|geschlossen/i;

function minuten(h, m) {
  return h * 60 + (m || 0);
}

/** Erkennt "11:30", "11.30", "18", "8.00" → Minuten. */
function zeitZuMinuten(text) {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 24 || min > 59) return null;
  return minuten(h, min);
}

/**
 * Fügt ein Intervall hinzu und hält die Liste sortiert.
 *
 * Doppelte Intervalle werden verworfen: destination.data enthält Datensätze, in
 * denen dasselbe Intervall mehrfach steht — z.B. 100023841 (Chicago Burger) hat
 * "Mi/Do/So 17:30–21:00" **viermal**. Ohne diese Prüfung liest der Vergleich
 * "17:30–21:00, 17:30–21:00, 17:30–21:00, 17:30–21:00" und meldet einen
 * Widerspruch, wo keiner ist.
 */
function ergaenze(tagObj, von, bis) {
  if (von === null || bis === null) return;
  if (bis <= von) bis += 1440; // über Mitternacht
  tagObj.status = 'offen';
  if (!tagObj.iv.some(([v, b]) => v === von && b === bis)) {
    tagObj.iv.push([von, bis]);
    tagObj.iv.sort((a, b) => a[0] - b[0]);
  }
}

// ---------------------------------------------------------------------------
// Quelle A: timeIntervals aus destination.data
// ---------------------------------------------------------------------------

/**
 * @param {Array} timeIntervals - Feld `timeIntervals` eines Gastro-Datensatzes
 * @returns {Object} Wochentag → Tagesobjekt
 */
function ausTimeIntervals(timeIntervals) {
  const w = UNBEKANNT();
  if (!Array.isArray(timeIntervals) || timeIntervals.length === 0) return w;

  for (const iv of timeIntervals) {
    const tage = (iv.weekdays || []).filter((t) => TAGE.includes(t));
    if (tage.length === 0) continue;

    // Uhrzeit aus dem ISO-String nehmen, wie sie dort steht (Zeitzone ist im String).
    const vonS = (iv.start || '').slice(11, 16);
    const bisS = (iv.end || '').slice(11, 16);
    const von = zeitZuMinuten(vonS);
    const bis = zeitZuMinuten(bisS);

    for (const t of tage) {
      // 00:00–00:00 heißt "24 Stunden offen", nicht "geschlossen".
      // Belegt am Datensatz Hotel-Restaurant Sonnenhof (siehe docs/destination-data-felder.md).
      if (von === 0 && bis === 0) {
        w[t].status = 'offen';
        w[t].iv = [[0, 1440]];
      } else {
        ergaenze(w[t], von, bis);
      }
    }
  }

  // Tage, die in timeIntervals gar nicht vorkommen, gelten als geschlossen —
  // aber nur, wenn überhaupt Tage belegt sind.
  const belegt = TAGE.some((t) => w[t].status === 'offen');
  if (belegt) for (const t of TAGE) if (w[t].status === 'unbekannt') w[t].status = 'geschlossen';

  return w;
}

// ---------------------------------------------------------------------------
// Quelle B: Freitext (openings / dayoff) oder Webseiten-Text
// ---------------------------------------------------------------------------

/** Küchen-/Lieferzeiten im Freitext — ab hier gehört der Rest nicht zu den Öffnungszeiten. */
const KUECHE = /(warme?\s+küche|küchenzeit|küche\s*:|speisen?zeit|lieferzeit|frühstück\s*:|buffet|brunch)/i;

const MONAT = 'januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember';

/**
 * Datums- oder Saisonangaben — machen den Text mehrdeutig (welchen Zeitraum meint
 * `timeIntervals`?).
 *
 * Wichtig: Uhrzeiten werden auch mit Punkt geschrieben ("8.00 bis 18.00 Uhr"). Ein
 * Datum muss deshalb einen abschließenden Punkt tragen ("01.05. bis 30.09.") oder
 * einen Monatsnamen bzw. eine Jahreszahl enthalten. Sonst hält der Filter jede
 * Uhrzeit für ein Datum und nichts wird mehr verglichen.
 */
const SAISON_MARKER = new RegExp(
  '(\\d{1,2}\\.\\d{1,2}\\.\\s*(?:-|–|bis)\\s*\\d{1,2}\\.\\d{1,2}\\.?)'
  + `|(\\d{1,2}\\.\\s*(?:${MONAT}))`
  + `|((?:monate?\\s+)?(?:${MONAT})\\s*(?:-|–|bis)\\s*(?:${MONAT}))`
  + '|(sommersaison|wintersaison|hauptsaison|nebensaison|ferien)'
  + '|(\\b(?:19|20)\\d{2}\\b\\s*(?:-|–|bis))',
  'i',
);

/**
 * Alle Schreibweisen eines Wochentags: lang, mit Adverb-s ("montags"), kurz ("mo"),
 * und die abgetrennte Form "Sonn-" aus "Sonn- und feiertags".
 * Belegt an Deutsches Haus - Restaurant Hermes.
 */
const TAG_ALT = 'montags?|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?'
  + '|sonnabends?|sonntags?|sonn(?=\\s*[-–—])|mo|di|mi|do|fr|sa|so';

/** Ordnet eine gefundene Schreibweise dem englischen Wochentag zu. */
function tagKey(token) {
  const k = token.toLowerCase();
  if (TAG_DE[k]) return TAG_DE[k];
  if (k.endsWith('s') && TAG_DE[k.slice(0, -1)]) return TAG_DE[k.slice(0, -1)];
  if (k === 'sonn') return 'Sunday';
  return null;
}

/** Findet Wochentage in einem Textstück, inkl. Bereichen ("Montag – Freitag"). */
function tageAusText(stueck) {
  const s = stueck.toLowerCase();
  const gefunden = [];

  // Bereiche zuerst: "montag - freitag", "mi – sa"
  const bereich = new RegExp(`\\b(${TAG_ALT})\\b\\s*(?:-|–|—|bis)\\s*\\b(${TAG_ALT})\\b`, 'g');
  let m;
  let rest = s;
  while ((m = bereich.exec(s)) !== null) {
    const a = TAGE.indexOf(tagKey(m[1]));
    const b = TAGE.indexOf(tagKey(m[2]));
    if (a >= 0 && b >= 0) {
      for (let i = a; ; i = (i + 1) % 7) {
        gefunden.push(TAGE[i]);
        if (i === b) break;
      }
    }
    rest = rest.replace(m[0], ' ');
  }

  // Einzelne Tage im Rest. Kurzformen sind hier erlaubt, weil diese Funktion auf
  // einem schmalen Tagesgruppen-Ausschnitt arbeitet — nicht auf Prosa.
  const einzeln = new RegExp(`\\b(${TAG_ALT})\\b`, 'g');
  while ((m = einzeln.exec(rest)) !== null) {
    const t = tagKey(m[1]);
    if (t) gefunden.push(t);
  }

  if (/\btäglich\b|\bjeden tag\b|\balle tage\b/.test(s)) gefunden.push(...TAGE);

  return [...new Set(gefunden)];
}

/** Findet Zeitspannen: "11:30 - 14.30", "17.30 – 22", und "ab 18.30". */
function zeitenAusText(stueck) {
  const spannen = [];
  const s = stueck.replace(/\s*uhr\s*/gi, ' ');

  const spanne = /(\d{1,2}(?:[:.]\d{2})?)\s*(?:-|–|—|bis)\s*(\d{1,2}(?:[:.]\d{2})?)/g;
  let m;
  let rest = s;
  while ((m = spanne.exec(s)) !== null) {
    const von = zeitZuMinuten(m[1]);
    const bis = zeitZuMinuten(m[2]);
    if (von !== null && bis !== null) spannen.push({ von, bis });
    rest = rest.replace(m[0], ' ');
  }

  // "ab 18.30" → offenes Ende
  const ab = /\bab\s+(\d{1,2}(?:[:.]\d{2})?)/g;
  while ((m = ab.exec(rest)) !== null) {
    const von = zeitZuMinuten(m[1]);
    if (von !== null) spannen.push({ von, bis: null, offenesEnde: true });
  }

  return spannen;
}

// "feiertags" ist kein Wochentag, muss aber eine Gruppengrenze bilden, damit
// "Sonn- und feiertags 12 bis 14.30" nicht dem vorherigen Tagesblock zufällt.
const TAG_TOKEN = new RegExp(`\\b(?:${TAG_ALT}|täglich|feiertags?)\\b`, 'gi');

/** Verbindet zwei Tagesangaben zu EINER Gruppe: "Montag – Freitag und Sonntag". */
const VERBINDER = /^[\s,;&/]*(?:und|bis|sowie|oder|-|–|—)?[\s,;&/]*$/i;

/**
 * Zerlegt einen Freitext in Abschnitte "Tagesgruppe → zugehörige Zeiten".
 *
 * "Mi-Fr 14:00-19:00 Uhr Sa 11:00-20:00 Uhr" ergibt zwei Abschnitte, nicht einen.
 * Genau das war die Hauptquelle für Fehlalarme.
 *
 * @returns {Array<{tage: string[], abschnitt: string}>}
 */
function abschnitte(text) {
  const treffer = [];
  TAG_TOKEN.lastIndex = 0;
  let m;
  while ((m = TAG_TOKEN.exec(text)) !== null) {
    treffer.push({ von: m.index, bis: m.index + m[0].length });
  }
  if (treffer.length === 0) return [];

  // Benachbarte Tagesangaben zu Gruppen zusammenfassen.
  const gruppen = [];
  let aktuell = { von: treffer[0].von, bis: treffer[0].bis };
  for (let i = 1; i < treffer.length; i++) {
    const luecke = text.slice(aktuell.bis, treffer[i].von);
    if (VERBINDER.test(luecke)) {
      aktuell.bis = treffer[i].bis;
    } else {
      gruppen.push(aktuell);
      aktuell = { von: treffer[i].von, bis: treffer[i].bis };
    }
  }
  gruppen.push(aktuell);

  return gruppen
    .map((g, i) => ({
      tage: tageAusText(text.slice(g.von, g.bis)),
      abschnitt: text.slice(g.bis, i + 1 < gruppen.length ? gruppen[i + 1].von : text.length),
    }))
    .filter((a) => a.tage.length > 0);
}

/**
 * @param {string} openings - texts[rel=openings]
 * @param {string} dayoff   - texts[rel=dayoff]
 * @returns {{typ: string, woche: Object|null, hinweis: string}}
 *   typ: 'strukturiert' | 'nicht_strukturierbar' | 'saisonal' | 'leer' | 'unklar'
 */
function ausFreitext(openings, dayoff) {
  const roh = [openings || '', dayoff || ''].join('\n').trim();
  if (!roh) return { typ: 'leer', woche: null, hinweis: '' };

  // 1. Klammern enthalten meist Saison-Ausnahmen ("(01.11. - 31.03. von 11-15 Uhr)").
  //    Raus damit — und zwar VOR der Saison-Prüfung, sonst fällt ein sonst gut
  //    lesbarer Text nur wegen einer Randnotiz aus dem Vergleich. Belegt an Hörster Krug.
  let text = roh.replace(/\([^)]*\)/g, ' ').trim();
  if (!text) return { typ: 'unklar', woche: null, hinweis: 'nach Bereinigung leer' };

  // 2. Ab "Warme Küche" / "Küchenzeiten" gehört der Rest nicht zu den Öffnungszeiten.
  //    Belegt an Pfennigskrug: "Sonntag geschlossen ... Warme Küche 18:00-20:30".
  const kueche = KUECHE.exec(text);
  if (kueche) {
    if (kueche.index < 15) {
      return { typ: 'unklar', woche: null, hinweis: 'nur Küchenzeiten' };
    }
    text = text.slice(0, kueche.index);
  }

  // 3. Bleiben mehrere Zeiträume übrig, ist unklar, welchen `timeIntervals` meint.
  //    Dann lieber nicht vergleichen als einen Fehlalarm erzeugen.
  //    Belegt an Felsenwirt und Landhaus Begatal.
  if (SAISON_MARKER.test(text)) {
    return { typ: 'saisonal_mehrdeutig', woche: null, hinweis: 'mehrere Zeiträume im Text' };
  }

  const hatZeiten = /\d{1,2}(?:[:.]\d{2})?\s*(?:-|–|—|bis)\s*\d/.test(text) || /\bab\s+\d/.test(text);
  const hatTage = tageAusText(text).length > 0;

  // "Auf Anfrage" ohne konkrete Zeiten → gültige Aussage, nicht strukturieren.
  if (NICHT_STRUKTURIERBAR.test(text) && !hatZeiten) {
    return { typ: 'nicht_strukturierbar', woche: null, hinweis: 'auf Anfrage / nach Absprache' };
  }

  // Reine Saison-Aussage ohne Wochentage und ohne Zeiten.
  if (SAISON.test(text) && !hatTage && !hatZeiten) {
    return { typ: 'saisonal', woche: null, hinweis: 'nur Saison-Angabe' };
  }

  if (!hatZeiten && !DURCHGEHEND.test(text) && !RUHETAG.test(text)) {
    return { typ: 'unklar', woche: null, hinweis: 'keine Zeiten erkennbar' };
  }

  const w = UNBEKANNT();

  // In Abschnitte zerlegen: jede Tagesgruppe bekommt NUR die Zeiten, die ihr folgen.
  // Sonst wird aus "Mi-Fr 14:00-19:00 Uhr Sa 11:00-20:00 Uhr" für jeden Tag beides.
  for (const { tage, abschnitt } of abschnitte(text)) {
    const spannen = zeitenAusText(abschnitt);
    const zu = RUHETAG.test(abschnitt) && spannen.length === 0;
    const durchgehend = DURCHGEHEND.test(abschnitt);
    if (spannen.length === 0 && !zu && !durchgehend) continue;

    for (const t of tage) {
      if (zu) {
        w[t].status = 'geschlossen';
        w[t].iv = [];
      } else if (durchgehend && spannen.length === 0) {
        w[t].status = 'offen';
        w[t].iv = [[0, 1440]];
      } else {
        for (const sp of spannen) {
          if (sp.offenesEnde) {
            w[t].status = 'offen';
            w[t].offenesEnde = true;
            w[t].iv.push([sp.von, 1440]);
            w[t].iv.sort((a, b) => a[0] - b[0]);
          } else {
            ergaenze(w[t], sp.von, sp.bis);
          }
        }
      }
    }
  }

  // Ruhetag-Feld separat: "Dienstag, Mittwoch"
  if (dayoff) {
    for (const t of tageAusText(dayoff)) {
      if (w[t].status !== 'offen') {
        w[t].status = 'geschlossen';
        w[t].iv = [];
      }
    }
  }

  const belegt = TAGE.some((t) => w[t].status !== 'unbekannt');
  if (!belegt) return { typ: 'unklar', woche: null, hinweis: 'Tage nicht zuordenbar' };

  return { typ: 'strukturiert', woche: w, hinweis: '' };
}

// ---------------------------------------------------------------------------
// Vergleich
// ---------------------------------------------------------------------------

function gleicheIntervalle(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

/**
 * Vergleicht zwei normalisierte Wochen.
 * 'unbekannt' auf einer Seite ist KEIN Widerspruch — die Quelle schweigt nur.
 * Bei offenem Ende ("ab 18 Uhr") wird nur der Beginn verglichen.
 *
 * @returns {{einig: boolean, abweichungen: Array<{tag: string, a: string, b: string}>}}
 */
function vergleiche(wocheA, wocheB) {
  const abweichungen = [];

  for (const t of TAGE) {
    const a = wocheA[t];
    const b = wocheB[t];
    if (!a || !b) continue;
    if (a.status === 'unbekannt' || b.status === 'unbekannt') continue;

    if (a.status !== b.status) {
      abweichungen.push({ tag: t, a: alsText(a), b: alsText(b) });
      continue;
    }
    if (a.status === 'geschlossen') continue;

    if (a.offenesEnde || b.offenesEnde) {
      const startA = a.iv.map((x) => x[0]).sort((x, y) => x - y);
      const startB = b.iv.map((x) => x[0]).sort((x, y) => x - y);
      if (startA.length !== startB.length || startA.some((v, i) => v !== startB[i])) {
        abweichungen.push({ tag: t, a: alsText(a), b: alsText(b) });
      }
      continue;
    }

    if (!gleicheIntervalle(a.iv, b.iv)) {
      abweichungen.push({ tag: t, a: alsText(a), b: alsText(b) });
    }
  }

  return { einig: abweichungen.length === 0, abweichungen };
}

function hhmm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

/** Ein Tagesobjekt für Menschen lesbar machen — für Fragebogen und Quittungsmail. */
function alsText(tagObj) {
  if (!tagObj || tagObj.status === 'unbekannt') return 'unbekannt';
  if (tagObj.status === 'geschlossen') return 'geschlossen';
  if (tagObj.iv.length === 1 && tagObj.iv[0][0] === 0 && tagObj.iv[0][1] === 1440) return 'durchgehend offen';
  return tagObj.iv
    .map(([v, b]) => {
      if (tagObj.offenesEnde && b === 1440) return 'ab ' + hhmm(v);
      // Über Mitternacht sichtbar machen, sonst liest man "14:00–11:00" als Fehler.
      // Auch Mitternacht selbst gehört dazu: "07:00–00:00" liest sich sonst wie
      // ein Tippfehler oder gar wie "geschlossen".
      return hhmm(v) + '–' + hhmm(b) + (b >= 1440 ? ' (Folgetag)' : '');
    })
    .join(', ');
}

/** Ganze Woche als kompakter Text, z.B. für die Mail. */
function wocheAlsText(woche) {
  const kurz = { Monday: 'Mo', Tuesday: 'Di', Wednesday: 'Mi', Thursday: 'Do', Friday: 'Fr', Saturday: 'Sa', Sunday: 'So' };
  return TAGE.map((t) => kurz[t] + ' ' + alsText(woche[t])).join(' · ');
}

const KURZTAG = {
  Monday: 'Mo', Tuesday: 'Di', Wednesday: 'Mi', Thursday: 'Do',
  Friday: 'Fr', Saturday: 'Sa', Sunday: 'So',
};

/**
 * Umkehrung von `wocheAlsText`: "Mo geschlossen · Di 08:00–18:30 · …" → Map je
 * Wochentag.
 *
 * Gebraucht in `OZ-2`: die Data Table speichert die Fassungen als kompakten Text
 * (damit die Redaktion sie lesen kann), die Fragebogen-Seite braucht sie aber pro
 * Wochentag. Weil beide Richtungen hier stehen, können sie nicht auseinanderlaufen.
 *
 * @returns {Object} z.B. { Monday: "geschlossen", Tuesday: "08:00–18:30", … }
 */
function wocheAusText(text) {
  const map = {};
  if (!text) return map;
  for (const stueck of String(text).split('·')) {
    const m = /^\s*(Mo|Di|Mi|Do|Fr|Sa|So)\s+(.+?)\s*$/.exec(stueck);
    if (!m) continue;
    const tag = TAGE.find((t) => KURZTAG[t] === m[1]);
    if (tag) map[tag] = m[2];
  }
  return map;
}

/**
 * Echte Umkehrung von wocheAlsText(): Text → Wochenformat mit Minuten.
 *
 * ⚠️ Nicht mit wocheAusText() verwechseln — das liefert nur Anzeigetext pro Tag
 * und ist für vergleiche() unbrauchbar (dort fehlt status/iv, und dann gilt
 * jeder Tag als Abweichung).
 *
 * Gebraucht, wenn eine Fassung nur noch als gespeicherter Text vorliegt — etwa
 * in `variante_a`, nachdem der Datensatz selbst längst aus dem Ablauf ist.
 * Verstanden wird genau, was alsText() erzeugt: "unbekannt", "geschlossen",
 * "durchgehend offen", "ab 18:00", "11:00–14:00, 17:00–22:00 (Folgetag)".
 */
function wocheAusFassung(text) {
  const woche = UNBEKANNT();
  for (const [tag, roh] of Object.entries(wocheAusText(text))) {
    const wert = String(roh).trim();
    if (wert === 'unbekannt') continue;
    if (wert === 'geschlossen') { woche[tag].status = 'geschlossen'; continue; }
    if (wert === 'durchgehend offen') {
      woche[tag].status = 'offen';
      woche[tag].iv = [[0, 1440]];
      continue;
    }

    const abIst = /^ab\s+(\d{1,2}:\d{2})$/.exec(wert);
    if (abIst) {
      const von = zeitZuMinuten(abIst[1]);
      if (von === null) continue;
      woche[tag].status = 'offen';
      woche[tag].iv = [[von, 1440]];
      woche[tag].offenesEnde = true;
      continue;
    }

    for (const spanne of wert.split(',')) {
      // "17:00–02:00 (Folgetag)" — der Zusatz ist nur Lesehilfe; ergaenze()
      // rechnet das Überschreiten von Mitternacht selbst aus.
      const m = /(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/.exec(spanne);
      if (!m) continue;
      const von = zeitZuMinuten(m[1]);
      const bis = zeitZuMinuten(m[2]);
      if (von === null || bis === null) continue;
      ergaenze(woche[tag], von, bis === 0 && von !== 0 ? 1440 : bis);
    }
  }
  return woche;
}

// ---------------------------------------------------------------------------
// Plausibilitätsprüfung freier Eingaben
// ---------------------------------------------------------------------------

const TAG_LABEL = {
  Monday: 'Montag', Tuesday: 'Dienstag', Wednesday: 'Mittwoch', Thursday: 'Donnerstag',
  Friday: 'Freitag', Saturday: 'Samstag', Sunday: 'Sonntag',
};

/**
 * Prüft die Eingaben aus dem Fragebogen — die **verbindliche** Fassung.
 *
 * Der gleichlautende Check im Browser
 * (`frontend-starter/app/fragebogen/typen.ts`) dient nur der sofortigen
 * Rückmeldung; entschieden wird hier. Wer die Regeln ändert, ändert sie hier
 * zuerst.
 *
 * Erwartetes Format (so schickt es die Fragebogen-Seite):
 *   { Monday: { geschlossen: false, zeiten: [{ von: "11:00", bis: "14:00" }] }, … }
 *
 * @returns {{ok: boolean, fehler: string[], woche: Object|null}}
 *   `woche` ist die normalisierte Fassung im Format dieses Moduls.
 */
function pruefeEingabe(eingabe) {
  const fehler = [];
  const woche = UNBEKANNT();
  let offeneTage = 0;

  if (!eingabe || typeof eingabe !== 'object') {
    return { ok: false, fehler: ['Keine Angaben übermittelt.'], woche: null };
  }

  for (const tag of TAGE) {
    const label = TAG_LABEL[tag];
    const angabe = eingabe[tag];
    if (!angabe || typeof angabe !== 'object') continue;

    if (angabe.geschlossen) {
      woche[tag].status = 'geschlossen';
      woche[tag].iv = [];
      continue;
    }

    const gefuellt = (angabe.zeiten || []).filter((z) => z && (z.von || z.bis));
    if (gefuellt.length === 0) continue;

    offeneTage++;
    for (const z of gefuellt) {
      if (!z.von || !z.bis) {
        fehler.push(`${label}: Es fehlt eine Uhrzeit — bitte "von" und "bis" ausfüllen.`);
        continue;
      }
      const von = zeitZuMinuten(z.von);
      const bis = zeitZuMinuten(z.bis);
      if (von === null || bis === null) {
        fehler.push(`${label}: Uhrzeit nicht lesbar (${z.von}–${z.bis}).`);
        continue;
      }
      if (von === bis) {
        fehler.push(`${label}: Öffnen und Schließen sind gleich (${z.von}).`);
        continue;
      }
      // Über Mitternacht ist erlaubt — ergaenze() rechnet +1440.
      ergaenze(woche[tag], von, bis);
    }

    const iv = woche[tag].iv;
    for (let i = 1; i < iv.length; i++) {
      if (iv[i][0] < iv[i - 1][1]) {
        fehler.push(`${label}: Die beiden Zeiträume überschneiden sich.`);
        break;
      }
    }
    if (iv.length > 2) {
      fehler.push(`${label}: Mehr als zwei Zeiträume — bitte auf zwei zusammenfassen.`);
    }
  }

  if (offeneTage === 0) {
    fehler.push('An keinem Tag sind Öffnungszeiten eingetragen. Bitte mindestens einen Tag ausfüllen.');
  }

  return { ok: fehler.length === 0, fehler, woche: fehler.length === 0 ? woche : null };
}

/**
 * Auffälligkeiten, die kein Fehler sind, aber ein Mensch sehen sollte.
 * @returns {string[]}
 */
function auffaelligkeiten(woche) {
  const hinweise = [];
  let ruhetage = 0;
  for (const tag of TAGE) {
    const t = woche[tag];
    if (t.status === 'geschlossen') { ruhetage++; continue; }
    if (t.status !== 'offen') continue;
    for (const [von, bis] of t.iv) {
      if (von === 0 && bis === 1440) hinweise.push(`${TAG_LABEL[tag]}: durchgehend offen`);
      if (von < 5 * 60) hinweise.push(`${TAG_LABEL[tag]}: Öffnung vor 05:00`);
      if (bis > 27 * 60) hinweise.push(`${TAG_LABEL[tag]}: Schließung nach 03:00`);
    }
  }
  if (ruhetage > 4) hinweise.push(`${ruhetage} Ruhetage — ungewöhnlich viele`);
  return hinweise;
}

// ---------------------------------------------------------------------------
// Link auf die Gästeansicht
// ---------------------------------------------------------------------------

/**
 * Link auf den Eintrag im TeutoNavigator — so, wie ihn der Gast sieht.
 *
 * Wertvoller als ein Backend-Link: der Gastronom kann ihn öffnen, und in der
 * Anfrage-Mail zeigt er unmittelbar, was auf dem Spiel steht. Bei leeren
 * `timeIntervals` steht dort nämlich **„immer geöffnet"** (geprüft am 31.08.2026 an
 * 100040904, 100031263, 100044621, 100022947, 100023478) — nicht etwa "keine Angabe".
 *
 * Der Slug im Pfad ist beliebig, darf aber nicht leer sein (leer ⇒ HTTP 404).
 */
function oeffentlicherLink(datensatz, basis = 'https://www.teutonavigator.de/de/teutonavigator/wlan') {
  const id = datensatz.global_id || (datensatz.id ? `g_${datensatz.id}` : '');
  if (!id) return null;
  const typ = datensatz.type || 'Gastro';
  const slug = String(datensatz.title || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'eintrag';
  return `${basis}/detail/${typ}/${id}/${slug}`;
}

module.exports = {
  TAGE,
  oeffentlicherLink,
  pruefeEingabe,
  auffaelligkeiten,
  /** Leere Woche im Normalformat — für weitere Quellen (Webseite, Google). */
  leereWoche: UNBEKANNT,
  ergaenze,
  ausTimeIntervals,
  ausFreitext,
  vergleiche,
  alsText,
  wocheAlsText,
  wocheAusText,
  wocheAusFassung,
  zeitZuMinuten,
  tageAusText,
  zeitenAusText,
  abschnitte,
};
