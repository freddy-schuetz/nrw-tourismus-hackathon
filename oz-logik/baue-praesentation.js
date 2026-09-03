/**
 * Erzeugt die PowerPoint-Präsentation zum Öffnungszeiten-Abgleich.
 *
 * Farbwelt aus dem Gegenstand: Waldgrün für die Region und für "richtig",
 * Ziegelrot ausschliesslich für "falsche Angabe" — deshalb faellt es auf.
 * Gold nur fuer die dritte Quelle. Kein Rot fuer Dekoration.
 *
 * node baue-praesentation.js
 */

const PptxGenJS = require('pptxgenjs');

// --- Farben -------------------------------------------------------------------
const C = {
  dunkel: '1B3229',   // Waldschatten - Titel und Abschluss
  moos: '2C5A4B',     // Struktur, Ueberschriften
  moosHell: '8FB4A3', // auf dunklem Grund
  grund: 'F4F6F3',    // heller Grund mit Gruenstich
  karte: 'FFFFFF',
  linie: 'D1DAD4',
  tinte: '121A17',
  leise: '5A6A63',
  signal: 'A92F18',   // NUR falsche Angaben
  signalHell: 'F0836A', // dasselbe Rot, aber lesbar auf dunklem Grund
  gold: '8A6A12',     // dritte Quelle
  weiss: 'FFFFFF',
};

const KOPF = 'Cambria';
const TEXT = 'Calibri';
const MONO = 'Consolas';

const B = 13.333; // Breite
const H = 7.5;
const R = 0.62;   // Rand

const pres = new PptxGenJS();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'Teutoburger Wald Tourismus';
pres.title = 'Öffnungszeiten, die stimmen';

// --- Bausteine ----------------------------------------------------------------

/** Folie mit hellem Grund und Überschrift. */
function folie(titel, unter) {
  const s = pres.addSlide();
  s.background = { color: C.grund };
  if (titel) {
    s.addText(titel, {
      x: R, y: 0.45, w: B - 2 * R, h: 0.85,
      fontFace: KOPF, fontSize: 38, bold: true, color: C.tinte,
      align: 'left', valign: 'middle', margin: 0, isTextBox: true,
    });
  }
  if (unter) {
    s.addText(unter, {
      x: R, y: 1.3, w: B - 2 * R - 1.5, h: 0.5,
      fontFace: TEXT, fontSize: 15, color: C.leise,
      align: 'left', valign: 'top', margin: 0, isTextBox: true,
    });
  }
  return s;
}

/** Karte mit weißem Grund und dezentem Schatten. */
function karte(s, x, y, w, h, farbe) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: farbe || C.karte },
    line: { color: C.linie, width: 0.75 },
    shadow: { type: 'outer', angle: 90, blur: 8, offset: 0.04, color: '9AA8A1', opacity: 0.35 },
  });
}

/** Gefüllter Kreis mit Ziffer oder Kürzel — das wiederkehrende Motiv. */
function kreis(s, x, y, d, text, farbe, textfarbe) {
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: d, h: d, fill: { color: farbe }, line: { color: farbe, width: 0 },
  });
  s.addText(text, {
    x, y, w: d, h: d,
    fontFace: KOPF, fontSize: d > 0.55 ? 18 : 14, bold: true,
    color: textfarbe || C.weiss, align: 'center', valign: 'middle',
    margin: 0, isTextBox: true,
  });
}

/** Große Zahl mit Beschriftung darunter. */
function zahl(s, x, y, w, wert, beschriftung, farbe) {
  s.addText(String(wert), {
    x, y, w, h: 1.05,
    fontFace: KOPF, fontSize: 54, bold: true, color: farbe || C.tinte,
    align: 'left', valign: 'middle', margin: 0, isTextBox: true,
  });
  s.addText(beschriftung, {
    x, y: y + 1.0, w, h: 0.85,
    fontFace: TEXT, fontSize: 13, color: C.leise,
    align: 'left', valign: 'top', margin: 0, isTextBox: true,
  });
}

/** Fußzeile mit Seitenzahl. */
function fuss(s, n) {
  s.addText('Öffnungszeiten-Abgleich · destination.data · Teutoburger Wald', {
    x: R, y: H - 0.52, w: 7.5, h: 0.3,
    fontFace: MONO, fontSize: 8.5, color: C.leise,
    align: 'left', valign: 'middle', margin: 0, isTextBox: true,
  });
  s.addText(String(n), {
    x: B - R - 0.6, y: H - 0.52, w: 0.6, h: 0.3,
    fontFace: MONO, fontSize: 8.5, color: C.leise,
    align: 'right', valign: 'middle', margin: 0, isTextBox: true,
  });
}

// =============================================================================
// 1 — Titel
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: C.dunkel };

  s.addText('Use Case · Teutoburger Wald Tourismus', {
    x: R, y: 1.25, w: 9, h: 0.35,
    fontFace: MONO, fontSize: 11, color: C.moosHell, charSpacing: 2.5,
    margin: 0, isTextBox: true,
  });
  s.addText('Öffnungszeiten,\ndie stimmen', {
    x: R, y: 1.7, w: 10.5, h: 2.5,
    fontFace: KOPF, fontSize: 60, bold: true, color: C.weiss,
    lineSpacingMultiple: 0.92, margin: 0, isTextBox: true,
  });
  s.addText(
    'Ein Ablauf, der falsche Öffnungszeiten selbst findet, genau eine Frage stellt '
    + '— und die Antwort zurück in die Datenbank bringt.',
    {
      x: R, y: 4.4, w: 8.2, h: 1.0,
      fontFace: TEXT, fontSize: 18, color: C.moosHell,
      lineSpacingMultiple: 1.2, margin: 0, isTextBox: true,
    },
  );
  s.addShape(pres.ShapeType.rect, {
    x: R, y: 5.7, w: 1.4, h: 0.055, fill: { color: C.moosHell }, line: { width: 0 },
  });
  s.addText('1161 Gastro-Datensätze · Mandant teutoburgerwald · September 2026', {
    x: R, y: 6.0, w: 10, h: 0.35,
    fontFace: MONO, fontSize: 10, color: C.moosHell, margin: 0, isTextBox: true,
  });
  s.addNotes(
    'Einstieg: Es geht nicht um ein IT-Projekt, sondern um den Gast, der vor einer '
    + 'verschlossenen Tür steht. 1161 Gastronomie-Datensätze im Datenpool der Region.',
  );
}

// =============================================================================
// 2 — Das Problem
// =============================================================================
{
  const s = folie('Das Problem ist nicht die Lücke');
  // ⚠️ Die Breite muss VOR der Karte bei x = 8.55 enden, sonst verschwindet das
  // Ende des Satzes darunter. Genau das war der einzige schwere Fehler in der
  // ersten Fassung: sichtbar stand da "Kein Eintrag heißt für den Gast: imm".
  s.addText('Kein Eintrag heißt für den Gast:\nimmer geöffnet.', {
    x: R, y: 1.5, w: 7.6, h: 1.6,
    fontFace: KOPF, fontSize: 34, bold: true, color: C.signal,
    lineSpacingMultiple: 1.05, valign: 'top', margin: 0, isTextBox: true,
  });
  s.addText(
    'Fehlen die Öffnungszeiten, zeigt der TeutoNavigator den Betrieb als „immer geöffnet“. '
    + 'Das ist keine fehlende Angabe — das ist eine falsche. Der Gast fährt hin und steht '
    + 'vor der Tür.',
    {
      x: R, y: 3.25, w: 7.5, h: 1.3,
      fontFace: TEXT, fontSize: 16, color: C.tinte,
      lineSpacingMultiple: 1.25, valign: 'top', margin: 0, isTextBox: true,
    },
  );

  // Drei Kennzahlen rechts
  const kx = 8.55;
  karte(s, kx, 1.45, 4.15, 4.35);
  const posten = [
    ['43', 'Datensätze ohne Öffnungszeiten', C.signal],
    ['43 %', 'haben die Zeiten nur als Fließtext', C.tinte],
    ['1 %', 'sind älter als 12 Monate — der geplante Auslöser hätte nichts gefunden', C.tinte],
  ];
  posten.forEach(([wert, txt, farbe], i) => {
    const y = 1.78 + i * 1.42;
    s.addText(wert, {
      x: kx + 0.35, y, w: 1.55, h: 0.62,
      fontFace: KOPF, fontSize: 30, bold: true, color: farbe,
      align: 'left', valign: 'middle', margin: 0, isTextBox: true,
    });
    s.addText(txt, {
      x: kx + 1.95, y: y - 0.02, w: 2.0, h: 1.2,
      fontFace: TEXT, fontSize: 11.5, color: C.leise,
      align: 'left', valign: 'top', lineSpacingMultiple: 1.15, margin: 0, isTextBox: true,
    });
  });

  s.addText(
    'Systematisch nachprüfen hieße: jeden Betrieb aufrufen, Webseite und Google vergleichen, '
    + 'nachtelefonieren. Das macht niemand für 1161 Datensätze.',
    {
      x: R, y: 4.85, w: 7.5, h: 0.95,
      fontFace: TEXT, fontSize: 14, italic: true, color: C.leise,
      lineSpacingMultiple: 1.2, valign: 'top', margin: 0, isTextBox: true,
    },
  );
  fuss(s, 2);
  s.addNotes(
    'Der wichtigste Satz der Präsentation. Leere Öffnungszeiten sind schlimmer als veraltete, '
    + 'weil sie öffentlich als "immer geöffnet" erscheinen. 43 Betriebe im Bestand betroffen.',
  );
}

// =============================================================================
// 3 — Ein echter Fall
// =============================================================================
{
  const s = folie(
    'Ein echter Fall',
    'Benni´s Kitchen, Delbrück. Drei Quellen, drei Antworten. Rot ist, was abweicht.',
  );

  const spalten = [
    {
      kopf: 'Die Datenbank', farbe: C.leise,
      zeilen: [
        ['Mo', '09:30', '–14:00, 17:00–22:00'],
        ['Di', '', 'geschlossen'],
        ['Mi', '09:30', '–14:00, 17:00–22:00'],
        ['Do', '09:30', '–14:00, 17:00–22:00'],
        ['Fr', '09:30', '–14:00, 17:00–22:00'],
        ['Sa', '', '17:00–22:00'],
        ['So', '17:00–22:00', ''],
      ],
    },
    {
      kopf: 'Der Beschreibungstext', farbe: C.gold,
      zeilen: [
        ['Mo', '', '09:30–14:00, 17:00–22:00'],
        ['Di', '', 'geschlossen'],
        ['Mi', '', '09:30–14:00'],
        ['Do', '', '09:30–14:00'],
        ['Fr', '', '09:30–14:00'],
        ['Sa', 'ab 17:00', ''],
        ['So', 'ab 17:00', ''],
      ],
    },
    {
      kopf: 'Die eigene Webseite', farbe: C.moos,
      zeilen: [
        ['Mo', '11:00', '–14:00, 17:00–22:00'],
        ['Di', '', 'geschlossen'],
        ['Mi', '11:00', '–14:00, 17:00–22:00'],
        ['Do', '11:00', '–14:00, 17:00–22:00'],
        ['Fr', '11:00', '–14:00, 17:00–23:00'],
        ['Sa', '17:00–23:00', ''],
        ['So', '16:00–21:30', ''],
      ],
    },
  ];

  const bw = 3.85;
  spalten.forEach((sp, i) => {
    const x = R + i * (bw + 0.28);
    karte(s, x, 2.0, bw, 3.55);
    s.addShape(pres.ShapeType.rect, {
      x, y: 2.0, w: bw, h: 0.055, fill: { color: sp.farbe }, line: { width: 0 },
    });
    s.addText(sp.kopf, {
      x: x + 0.28, y: 2.16, w: bw - 0.5, h: 0.4,
      fontFace: KOPF, fontSize: 15, bold: true, color: C.tinte,
      margin: 0, isTextBox: true,
    });
    sp.zeilen.forEach(([tag, rot, rest], j) => {
      const y = 2.66 + j * 0.375;
      s.addText(tag, {
        x: x + 0.28, y, w: 0.4, h: 0.32,
        fontFace: MONO, fontSize: 11, color: C.leise, margin: 0, isTextBox: true,
      });
      const laeufe = [];
      if (rot) laeufe.push({ text: rot, options: { color: C.signal, bold: true } });
      if (rest) laeufe.push({ text: rest, options: { color: C.tinte } });
      s.addText(laeufe, {
        x: x + 0.72, y, w: bw - 1.0, h: 0.32,
        fontFace: MONO, fontSize: 11, margin: 0, isTextBox: true,
      });
    });
  });

  s.addText(
    [
      { text: 'Die Auflösung steht im Datensatz daneben: ', options: { color: C.tinte } },
      { text: '„Frühstück: 09:30–11:30“. ', options: { color: C.signal, bold: true } },
      {
        text: 'Jemand hat die Frühstückszeit als Öffnungszeit eingetragen. Kein Mensch findet '
          + 'das durch Draufschauen — der Wirt kreuzt es in zehn Sekunden an.',
        options: { color: C.tinte },
      },
    ],
    {
      x: R, y: 5.75, w: 12.1, h: 0.75,
      fontFace: TEXT, fontSize: 14.5, lineSpacingMultiple: 1.2,
      margin: 0, isTextBox: true,
    },
  );
  fuss(s, 3);
  s.addNotes(
    'Der Moment, in dem es klick macht. Drei Quellen widersprechen sich, und die Erklärung '
    + 'liegt im Datensatz selbst: die Frühstückszeit wurde als Öffnungszeit eingetragen. '
    + 'Fr/Sa geht es zudem bis 23 statt 22 Uhr.',
  );
}

// =============================================================================
// 4 — Die Grundidee
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: C.dunkel };

  s.addText('Die Grundidee', {
    x: R, y: 0.8, w: 8, h: 0.5,
    fontFace: MONO, fontSize: 11, color: C.moosHell, charSpacing: 2.5,
    margin: 0, isTextBox: true,
  });
  s.addText('Nicht um Datenpflege bitten.\nEine Frage stellen.', {
    x: R, y: 1.35, w: 11.5, h: 1.8,
    fontFace: KOPF, fontSize: 42, bold: true, color: C.weiss,
    lineSpacingMultiple: 1.0, margin: 0, isTextBox: true,
  });

  const paare = [
    ['„Bitte pflegen Sie Ihre Daten.“', 'erzeugt schlechtes Gewissen und keine Änderung', C.signalHell],
    ['„Welche dieser drei Fassungen stimmt?“', 'erzeugt einen Klick', C.moosHell],
  ];
  paare.forEach(([oben, unten, farbe], i) => {
    const y = 3.45 + i * 1.35;
    kreis(s, R, y + 0.1, 0.42, i === 0 ? '✕' : '✓', farbe, C.dunkel);
    s.addText(oben, {
      x: R + 0.68, y, w: 6.2, h: 0.45,
      fontFace: KOPF, fontSize: 20, bold: true, color: farbe,
      margin: 0, isTextBox: true,
    });
    s.addText(unten, {
      x: R + 0.68, y: y + 0.46, w: 6.2, h: 0.4,
      fontFace: TEXT, fontSize: 14, color: '9FB3AB', margin: 0, isTextBox: true,
    });
  });

  karte(s, 8.0, 3.35, 4.7, 3.05, '24443A');
  // Kürzer gefasst: "Gefragt werden drei, die es wissen können" brach im Kasten
  // um, sodass "können" allein in der zweiten Zeile stand.
  s.addText('Drei, die es wissen können', {
    x: 8.35, y: 3.58, w: 4.05, h: 0.4,
    fontFace: KOPF, fontSize: 15.5, bold: true, color: C.weiss,
    valign: 'middle', margin: 0, isTextBox: true,
  });
  ['der Gastronom selbst', 'wer den Eintrag angelegt hat', 'wer ihn zuletzt bearbeitet hat']
    .forEach((t, i) => {
      const y = 4.14 + i * 0.55;
      kreis(s, 8.4, y + 0.03, 0.28, String(i + 1), C.moosHell, C.dunkel);
      s.addText(t, {
        x: 8.82, y, w: 3.6, h: 0.4,
        fontFace: TEXT, fontSize: 13.5, color: C.moosHell,
        valign: 'middle', margin: 0, isTextBox: true,
      });
    });
  // Heller als vorher: '7C9188' auf dem dunklen Kartengrund lag bei 3,2:1 und
  // war aus den hinteren Reihen nicht lesbar.
  s.addText('Wer zuerst antwortet, entscheidet — der Gastronom hat das letzte Wort.', {
    x: 8.35, y: 5.75, w: 4.05, h: 0.5,
    fontFace: TEXT, fontSize: 12, italic: true, color: C.moosHell,
    valign: 'top', margin: 0, isTextBox: true,
  });

  s.addNotes(
    'Der Perspektivwechsel: Aus einer Aufgabe wird eine Frage mit drei fertigen Antworten. '
    + 'Der Aufwand liegt beim Ablauf, nicht beim Menschen.',
  );
}

// =============================================================================
// 5 — Die Umsetzung: vier Schritte
// =============================================================================
{
  const s = folie('Die Umsetzung', 'Vier Schritte, drei kleine Abläufe in n8n und eine Fragebogen-Seite.');

  const schritte = [
    ['Finden', 'Alle Datensätze lesen und drei Quellen bedeutungsgleich vergleichen. '
      + '„Mo 11-14“ und „Montag 11:00–14:00 Uhr“ gelten als dasselbe.'],
    ['Fragen', 'Eine Mail mit persönlichem Link. Auf der Seite stehen die Fassungen '
      + 'nebeneinander — ankreuzen oder eigene Zeiten eintragen.'],
    ['Prüfen', 'Antworten zusammenführen und plausibilisieren. Unmögliche Zeiten werden '
      + 'abgelehnt. Bei Widerspruch entscheidet ein Mensch.'],
    ['Zurückschreiben', 'Korrektur in destination.data, dazu eine Quittung mit Vorher '
      + 'und Nachher an alle Beteiligten.'],
  ];

  // Abstand 0.3 statt 0.13: bei 0.62 Aussenrand sahen 0.13 wie ein Fehler aus.
  const sw = 2.8;
  schritte.forEach(([kopf, txt], i) => {
    const x = R + i * (sw + 0.3);
    karte(s, x, 2.05, sw, 3.2);
    kreis(s, x + 0.3, 2.35, 0.52, String(i + 1), C.moos);
    s.addText(kopf, {
      x: x + 0.3, y: 3.05, w: sw - 0.6, h: 0.42,
      fontFace: KOPF, fontSize: 17, bold: true, color: C.tinte,
      margin: 0, isTextBox: true,
    });
    s.addText(txt, {
      x: x + 0.3, y: 3.52, w: sw - 0.6, h: 1.55,
      fontFace: TEXT, fontSize: 12.5, color: C.leise,
      lineSpacingMultiple: 1.18, valign: 'top', margin: 0, isTextBox: true,
    });
  });

  s.addText(
    [
      { text: 'Der Kern ist nicht das Verschicken, sondern das Vergleichen. ', options: { bold: true, color: C.tinte } },
      {
        text: 'Wenn dieser Schritt schlampig ist, schlägt der Ablauf bei fast jedem Betrieb '
          + 'Alarm — und niemand nimmt ihn mehr ernst.',
        options: { color: C.leise },
      },
    ],
    {
      x: R, y: 5.55, w: 12.1, h: 0.7,
      fontFace: TEXT, fontSize: 14, lineSpacingMultiple: 1.2, margin: 0, isTextBox: true,
    },
  );
  fuss(s, 5);
  s.addNotes(
    'Drei getrennte n8n-Abläufe, weil zwischen "fragen" und "antworten" Tage liegen. '
    + 'Die Fragebogen-Seite ist nötig, weil E-Mail-Programme Formulare aus '
    + 'Sicherheitsgründen entfernen — eine Mail kann nichts abschicken.',
  );
}

// =============================================================================
// 6 — Die Quellen
// =============================================================================
{
  const s = folie('Vier Quellen, ein Format', 'Erst wenn alle Quellen dieselbe Struktur haben, lässt sich vergleichen.');

  const quellen = [
    ['A', 'Die Datenbank', 'Das strukturierte Feld in destination.data', 'läuft', C.moos],
    ['B', 'Der Beschreibungstext', 'Freitext im selben Datensatz — bei 43 % vorhanden', 'läuft', C.gold],
    ['C', 'Die Webseite des Betriebs', 'Maschinenlesbar oder als Fließtext, von einem Sprachmodell gelesen', 'läuft', C.moos],
    ['D', 'Google Maps', 'Places API — der Fragebogen ist darauf vorbereitet', 'geplant', C.leise],
  ];

  quellen.forEach(([kz, name, txt, stand, farbe], i) => {
    const y = 2.05 + i * 1.02;
    karte(s, R, y, 12.1, 0.8);
    kreis(s, R + 0.28, y + 0.14, 0.52, kz, farbe);
    s.addText(name, {
      x: R + 1.0, y: y + 0.11, w: 3.5, h: 0.3,
      fontFace: KOPF, fontSize: 15, bold: true, color: C.tinte,
      margin: 0, isTextBox: true,
    });
    s.addText(txt, {
      x: R + 1.0, y: y + 0.42, w: 8.3, h: 0.3,
      fontFace: TEXT, fontSize: 12, color: C.leise, margin: 0, isTextBox: true,
    });
    const gruen = stand === 'läuft';
    s.addShape(pres.ShapeType.roundRect, {
      x: R + 10.75, y: y + 0.22, w: 1.05, h: 0.36, rectRadius: 0.05,
      fill: { color: gruen ? C.moos : C.weiss },
      line: { color: gruen ? C.moos : C.gold, width: 0.75 },
    });
    s.addText(stand, {
      x: R + 10.75, y: y + 0.22, w: 1.05, h: 0.36,
      fontFace: MONO, fontSize: 9, color: gruen ? C.weiss : '6B520E',
      align: 'center', valign: 'middle', margin: 0, isTextBox: true,
    });
  });

  s.addText(
    'Quelle C ist der Schlüssel für die 459 Datensätze, die Öffnungszeiten haben, aber keinen '
    + 'Freitext zum Vergleichen. Die waren vorher überhaupt nicht prüfbar.',
    {
      x: R, y: 6.05, w: 12.1, h: 0.6,
      fontFace: TEXT, fontSize: 14, color: C.tinte, lineSpacingMultiple: 1.2,
      margin: 0, isTextBox: true,
    },
  );
  fuss(s, 6);
  s.addNotes(
    'Alle Quellen werden auf eine Wochenstruktur in Minuten gebracht. Erst dadurch ist '
    + '"Mo 11-14, 17-22" dasselbe wie "Montag 11:00-14:00 und 17:00-22:00 Uhr".',
  );
}

// =============================================================================
// 7 — Warum keine Fehlalarme
// =============================================================================
{
  const s = folie('Die KI liest. Entscheiden darf sie nicht.',
    'Vier Bremsen zwischen dem Sprachmodell und dem Fragebogen.');

  const bremsen = [
    ['Sie darf passen', '„Auf Anfrage“, mehrere Saisons oder widersprüchliche Blöcke '
      + 'mehrerer Betriebe an einer Adresse: kein Fall. In 6 von 20 Fällen genutzt.'],
    ['Zeit-Gegenprobe', 'Jede genannte Uhrzeit muss im Seitentext wirklich vorkommen. '
      + 'Das fängt erfundene Zeiten, ohne eine zweite KI zu brauchen.'],
    ['Kein Tag belegt', 'Eine leere Woche ist keine Aussage. Nennt die Seite gar keinen '
      + 'Wochentag, wird die Fassung verworfen statt geraten.'],
    ['Plausibilität', 'Durchgehend offen, Öffnung vor 5 Uhr, mehr als vier Ruhetage: '
      + 'auffällig, also nicht übernommen.'],
  ];

  // Bewusst KEIN Kartenraster: Folie 5 und 9 haben schon eines, und dreimal
  // dasselbe Muster liest sich wie eine Vorlage. Hier vier Zeilen als Filter —
  // was der Reihenfolge der Prüfungen auch inhaltlich entspricht.
  bremsen.forEach(([kopf, txt], i) => {
    const y = 2.1 + i * 1.04;
    kreis(s, R, y + 0.06, 0.5, '✕', C.signal);
    s.addText(kopf, {
      x: R + 0.78, y: y - 0.02, w: 3.2, h: 0.42,
      fontFace: KOPF, fontSize: 17, bold: true, color: C.tinte,
      valign: 'middle', margin: 0, isTextBox: true,
    });
    // ⚠️ Breite so, dass der Text am Satzspiegel endet (R + 12.1 = 12.72) und
    // nicht an der Folienkante. Mit w: 8.6 lief er bis 13.32 — neun Pixel vor
    // dem Rand, und bei Beamern mit Overscan fällt das letzte Wort weg.
    s.addText(txt, {
      x: R + 4.1, y: y - 0.02, w: 7.95, h: 0.92,
      fontFace: TEXT, fontSize: 13, color: C.leise,
      lineSpacingMultiple: 1.2, valign: 'top', margin: 0, isTextBox: true,
    });
    if (i < bremsen.length - 1) {
      s.addShape(pres.ShapeType.rect, {
        x: R, y: y + 0.94, w: 12.1, h: 0.008,
        fill: { color: C.linie }, line: { width: 0 },
      });
    }
  });

  s.addText(
    [
      { text: 'Fehlalarme sind hier gefährlicher als übersehene Fälle. ', options: { bold: true, color: C.signal } },
      { text: 'Nach der zweiten unnötigen Mail liest niemand mehr die dritte.', options: { color: C.tinte } },
    ],
    {
      x: R, y: 6.25, w: 12.1, h: 0.45,
      fontFace: TEXT, fontSize: 13.5, lineSpacingMultiple: 1.18, margin: 0, isTextBox: true,
    },
  );
  fuss(s, 7);
  s.addNotes(
    'Diese Folie ist die Antwort auf die Frage "kann man einer KI so etwas überlassen?". '
    + 'Die Antwort: lesen ja, entscheiden nein. Jede Angabe wird gegen den Originaltext geprüft. '
    + 'Und: kommen aus dem Modell nicht genau so viele Antworten wie Fragen gestellt wurden, '
    + 'wird gar nichts übernommen — sonst landen Zeiten beim falschen Betrieb.',
  );
}

// =============================================================================
// 8 — Was gemessen wurde
// =============================================================================
{
  const s = folie('Gemessen, nicht behauptet', 'Zahlen aus echten Läufen über den vollständigen Datenbestand.');

  const werte = [
    ['1161', 'Datensätze geprüft — in 79 Sekunden', C.tinte],
    ['216', 'waren in Ordnung und wurden nicht angefasst', C.moos],
    ['9', 'echte Widersprüche gefunden', C.signal],
    ['0', 'erfundene Zeiten, 0 verwechselte Küchenzeiten', C.moos],
  ];
  werte.forEach(([w, t, f], i) => {
    zahl(s, R + i * 3.1, 2.35, 2.8, w, t, f);
  });

  karte(s, R, 4.75, 12.1, 1.25);
  s.addText(
    [
      { text: 'Alle neun Fälle wurden von Hand nachgelesen. Alle neun waren echt.  ', options: { bold: true, color: C.tinte } },
      {
        text: 'Ein Folgelauf hat zusätzlich gezeigt, dass niemand zweimal gefragt wird: '
          + '48 offene Fälle wurden übersprungen, fünf Betriebe hat die Webseite bestätigt '
          + '— dort war keine Mail nötig.',
        options: { color: C.leise },
      },
    ],
    {
      x: R + 0.35, y: 4.95, w: 11.4, h: 0.9,
      fontFace: TEXT, fontSize: 14.5, lineSpacingMultiple: 1.25, valign: 'top',
      margin: 0, isTextBox: true,
    },
  );
  fuss(s, 8);
  s.addNotes(
    '215/216 einige Datensätze wurden bewusst nicht angefasst — das ist der Beweis, dass der '
    + 'Vergleich bedeutungsgleich arbeitet und nicht bei jedem Betrieb Alarm schlägt.',
  );
}

// =============================================================================
// 9 — Die Vorteile
// =============================================================================
{
  const s = folie('Die Vorteile', 'Für den Gast, für die Datenpflege und für die Region.');

  const vorteile = [
    ['Der Gast', 'Verlässliche Öffnungszeiten in TeutoNavigator, Open Data, Apps und Widgets '
      + '— überall dort, wo der Datensatz ohnehin schon landet.'],
    ['Die Touristiker:innen', 'Kein Nachtelefonieren. Statt einer Pflege-Aufgabe kommt eine '
      + 'fertige Frage, und nur für die Fälle, die es wirklich sind.'],
    ['Der Gastronom', 'Ein Klick statt Datenbank-Formular. Er braucht keine Zugangsdaten '
      + 'und muss nichts installieren.'],
    ['Der Aufwand', '1161 Datensätze in 79 Sekunden. Keine Personalstelle für systematische '
      + 'Prüfung, Kosten nur für rund 20 Modellaufrufe pro Lauf.'],
    ['Die Datenqualität', 'Nebenbei wird ein Feld gefüllt, das bei 88 % der Betriebe leer ist '
      + '— die Küchenzeiten.'],
    ['Nachvollziehbar', 'Festgehalten ist, wer wann welche Fassung bestätigt hat. Nichts wird '
      + 'still geändert, und niemand wird zweimal gefragt.'],
  ];

  const vw = 3.83;
  vorteile.forEach(([kopf, txt], i) => {
    const x = R + (i % 3) * (vw + 0.3);
    const y = 2.05 + Math.floor(i / 3) * 2.1;
    karte(s, x, y, vw, 1.85);
    kreis(s, x + 0.28, y + 0.26, 0.44, String(i + 1), i < 3 ? C.moos : C.gold);
    s.addText(kopf, {
      x: x + 0.88, y: y + 0.24, w: vw - 1.15, h: 0.35,
      fontFace: KOPF, fontSize: 15, bold: true, color: C.tinte,
      margin: 0, isTextBox: true,
    });
    s.addText(txt, {
      x: x + 0.28, y: y + 0.78, w: vw - 0.56, h: 0.95,
      fontFace: TEXT, fontSize: 11.5, color: C.leise,
      lineSpacingMultiple: 1.15, valign: 'top', margin: 0, isTextBox: true,
    });
  });
  fuss(s, 9);
  s.addNotes(
    'Der Kern des Nutzens: Der Aufwand wandert vom Menschen zum Ablauf. Und der Nutzen ist '
    + 'nicht nur "bessere Daten", sondern weniger Arbeit für die, die heute nachtelefonieren.',
  );
}

// =============================================================================
// 10 — Zwei Funde
// =============================================================================
{
  const s = folie('Zwei Funde, die weiter reichen',
    'Der Ablauf zeigt nicht nur einzelne Fehler, sondern wie sie entstehen.');

  const funde = [
    [
      'Die Küchenzeit sitzt im falschen Feld',
      'Bei 88 % der Betriebe ist das Feld für Küchenzeiten leer. Also trägt man die Küchenzeit '
      + 'dort ein, wo sie gelesen wird — bei den Öffnungszeiten. Verständlich, aber es kostet: '
      + 'bei einem Hotel fiel dadurch der ganze Sonntag aus dem Datensatz.',
      'Daraus wurde eine zweite Frage im Fragebogen: „Wann ist Ihre warme Küche geöffnet?“',
    ],
    [
      'Halb gepflegt sieht aus wie gepflegt',
      'Ein Betrieb in Bad Salzuflen hat seine Zeiten geändert. In der Datenbank stehen Mittwoch '
      + 'und Donnerstag schon neu — Freitag, Samstag und Sonntag noch alt.',
      'Jemand hat angefangen und ist nicht fertig geworden. Von außen ist das nicht zu sehen '
      + '— genau deshalb findet es niemand von Hand.',
    ],
  ];

  funde.forEach(([kopf, txt, schluss], i) => {
    const x = R + i * 6.25;
    karte(s, x, 2.05, 5.85, 2.85, 'F7F0DC');
    s.addText(kopf, {
      x: x + 0.35, y: 2.32, w: 5.25, h: 0.52,
      fontFace: KOPF, fontSize: 18, bold: true, color: C.gold,
      lineSpacingMultiple: 1.05, valign: 'top', margin: 0, isTextBox: true,
    });
    // Fließtext und Schlusssatz in EINEM Kasten, als zwei Absätze. Getrennt
    // gesetzt war der Schlusssatz am Kartenboden verankert, während der Text
    // darüber je Karte unterschiedlich lang ist — dadurch klaffte mitten in der
    // rechten Karte ein Loch von 134 Pixeln. So folgt er immer direkt.
    s.addText(
      [
        { text: txt, options: { color: C.tinte, breakLine: true } },
        { text: '', options: { fontSize: 7, breakLine: true } },
        { text: schluss, options: { color: C.tinte, bold: true } },
      ],
      {
        x: x + 0.35, y: 2.9, w: 5.15, h: 1.85,
        fontFace: TEXT, fontSize: 12.5,
        lineSpacingMultiple: 1.2, valign: 'top', margin: 0, isTextBox: true,
      },
    );
  });

  s.addText(
    'Beides sind keine Tippfehler, sondern Muster — und damit Hinweise für die Schulung der '
    + 'Datenpflege, nicht Vorwürfe an einzelne Personen.',
    {
      x: R, y: 5.2, w: 12.1, h: 0.6,
      fontFace: TEXT, fontSize: 14, italic: true, color: C.leise,
      lineSpacingMultiple: 1.2, margin: 0, isTextBox: true,
    },
  );
  fuss(s, 10);
  s.addNotes(
    'Wichtig im Ton: Das ist kein Schlamperei-Befund. Wer weiß, dass Gäste "kann ich da jetzt '
    + 'essen?" fragen, trägt die Küchenzeit in das einzige Feld ein, das gefüllt wird.',
  );
}

// =============================================================================
// 11 — Stand und nächste Schritte
// =============================================================================
{
  const s = folie('Wo wir stehen', 'Alles Gefährliche ist bewusst verriegelt, nicht vergessen.');

  const zeilen = [
    ['läuft', C.moos, C.weiss,
      'Finden, fragen, auswerten, entscheiden. Der Fragebogen ist im Netz, die Erkennung '
      + 'ist an den echten Daten gemessen, und wer schon gefragt wurde, wird nicht noch einmal gefragt.'],
    ['gesperrt', C.signal, C.signal,
      'Mailversand und Schreibzugriff. Die Adressen der Betriebe sind echt — solange getestet '
      + 'wird, geht jede Mail an eine Testadresse, und in die Datenbank wird nichts geschrieben.'],
    ['offen', C.gold, C.gold,
      'Schreibrechte für einen technischen Benutzer, eine Absenderadresse, ein eigener '
      + 'KI-Zugang — und Google Maps als vierte Quelle.'],
  ];

  zeilen.forEach(([label, farbe, textfarbe, txt], i) => {
    const y = 2.05 + i * 1.42;
    karte(s, R, y, 12.1, 1.15);
    const gefuellt = i === 0;
    s.addShape(pres.ShapeType.roundRect, {
      x: R + 0.35, y: y + 0.38, w: 1.35, h: 0.44, rectRadius: 0.06,
      fill: { color: gefuellt ? farbe : 'FFFFFF' },
      line: { color: farbe, width: 1 },
    });
    s.addText(label, {
      x: R + 0.35, y: y + 0.38, w: 1.35, h: 0.44,
      fontFace: MONO, fontSize: 10, color: gefuellt ? C.weiss : textfarbe,
      align: 'center', valign: 'middle', margin: 0, isTextBox: true,
    });
    s.addText(txt, {
      x: R + 1.95, y: y + 0.2, w: 9.9, h: 0.85,
      fontFace: TEXT, fontSize: 13, color: C.tinte,
      lineSpacingMultiple: 1.2, valign: 'middle', margin: 0, isTextBox: true,
    });
  });

  s.addText(
    'Der einzige echte Blocker ist organisatorisch: Schreibrechte auf die Öffnungszeiten für '
    + 'einen technischen Benutzer. Technisch ist es ein Baustein-Tausch.',
    {
      x: R, y: 6.2, w: 12.1, h: 0.45,
      fontFace: TEXT, fontSize: 13.5, bold: true, color: C.moos,
      margin: 0, isTextBox: true,
    },
  );
  fuss(s, 11);
  s.addNotes(
    'Ehrlich bleiben: Der Ablauf verschickt heute keine Mail und ändert heute keinen Datensatz. '
    + 'Beides ist doppelt verriegelt — Versand-Node abgeschaltet UND Testmodus.',
  );
}

// =============================================================================
// 12 — Abschluss
// =============================================================================
{
  const s = pres.addSlide();
  s.background = { color: C.dunkel };

  s.addText('Aus einer Bringschuld\nwird ein Häkchen.', {
    x: R, y: 2.25, w: 11, h: 2.2,
    fontFace: KOPF, fontSize: 50, bold: true, color: C.weiss,
    lineSpacingMultiple: 1.0, margin: 0, isTextBox: true,
  });
  s.addText(
    'Niemand muss Daten pflegen. Es genügt, eine Frage zu beantworten, die schon fertig '
    + 'aufbereitet ist — und den Rest macht der Ablauf.',
    {
      x: R, y: 4.65, w: 8.4, h: 1.0,
      fontFace: TEXT, fontSize: 18, color: C.moosHell,
      lineSpacingMultiple: 1.25, margin: 0, isTextBox: true,
    },
  );
  s.addShape(pres.ShapeType.rect, {
    x: R, y: 6.05, w: 1.4, h: 0.055, fill: { color: C.moosHell }, line: { width: 0 },
  });
  s.addText('Teutoburger Wald Tourismus · destination.data · gebaut mit n8n', {
    x: R, y: 6.3, w: 10, h: 0.35,
    fontFace: MONO, fontSize: 10, color: C.moosHell, margin: 0, isTextBox: true,
  });
  s.addNotes('Abschluss-Satz. Danach Übergang zur Demo: der Fragebogen im Browser.');
}

// --- Schreiben ----------------------------------------------------------------
const ZIEL = process.argv[2] || 'Oeffnungszeiten-Abgleich.pptx';
pres.writeFile({ fileName: ZIEL }).then(() => {
  console.log('Geschrieben: ' + ZIEL);
});
