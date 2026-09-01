// Gemeinsame Typen und Regeln für den Öffnungszeiten-Fragebogen.
// Die Wochentag-Schlüssel sind englisch, weil destination.data sie so liefert
// (Feld `timeIntervals[].weekdays`) — siehe docs/destination-data-felder.md.

export const WOCHENTAGE = [
  { key: "Monday", label: "Montag" },
  { key: "Tuesday", label: "Dienstag" },
  { key: "Wednesday", label: "Mittwoch" },
  { key: "Thursday", label: "Donnerstag" },
  { key: "Friday", label: "Freitag" },
  { key: "Saturday", label: "Samstag" },
  { key: "Sunday", label: "Sonntag" },
] as const;

export type Wochentag = (typeof WOCHENTAGE)[number]["key"];

/** Eine Antwortmöglichkeit im Fragebogen — eine Quelle, wie sie die Zeiten sieht. */
export type Variante = {
  key: string;
  /** Woher diese Fassung stammt, in Alltagssprache: "Ihre Webseite", "Google Maps" … */
  quelle: string;
  hinweis?: string;
  /** Wochentag → schon lesbar formatiert, z.B. "11:00–14:00, 17:00–22:00" oder "geschlossen". */
  tage: Partial<Record<Wochentag, string>>;
};

export type FallDaten = {
  status: "offen" | "beantwortet" | "unbekannt";
  betrieb: {
    name: string;
    ort?: string;
    /** Link auf den Eintrag im TeutoNavigator — die Ansicht, die Gäste sehen. */
    gaesteLink?: string;
    /**
     * Der Status, den der TeutoNavigator gerade anzeigt (z.B. „immer geöffnet").
     * Bei leeren Öffnungszeiten steht dort „immer geöffnet" — das ist der
     * eigentliche Schaden und der beste Grund, jetzt zu antworten.
     */
    gaesteStatus?: string;
  };
  /** Rolle der angeschriebenen Person — steuert nur die Anrede. */
  rolle?: "gastronom" | "ersteller" | "bearbeiter";

  // ⚠️ Hier steht bewusst KEIN Ad-hoc-Bearbeitungslink.
  //
  // Ein solcher Link (`data.destination.one/OpenObject.aspx?ah=…`) ist ein
  // Zugangsmittel: wer ihn hat, darf den Datensatz ohne Anmeldung ändern.
  // Stünde er in diesem Typ, müsste der Webhook ihn an den Browser ausliefern —
  // und dann liegt er im Netzwerk-Tab, selbst wenn die Seite ihn nicht anzeigt.
  //
  // Alle Rückmeldungen laufen deshalb über diesen Fragebogen, auch die der
  // Touristiker:innen. Ein einziger Weg heißt: eine Plausibilitätsprüfung, eine
  // Nachvollziehbarkeit, kein Token im Browser.
  frist?: string;
  varianten: Variante[];
  /** Küchenzeiten sind KEINE Öffnungszeiten, werden aber als Hinweis angezeigt. */
  kuechenzeiten?: string;
};

export type Zeitspanne = { von: string; bis: string };

export type EigeneAngabe = {
  geschlossen: boolean;
  zeiten: Zeitspanne[];
};

export type EigeneWoche = Record<Wochentag, EigeneAngabe>;

export function leereWoche(): EigeneWoche {
  const w = {} as EigeneWoche;
  for (const { key } of WOCHENTAGE) {
    w[key] = { geschlossen: false, zeiten: [{ von: "", bis: "" }] };
  }
  return w;
}

function alsMinuten(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Formale Plausibilitätsprüfung — dieselben harten Regeln wie im Workflow
 * (siehe Bauplan, Schritt "Entscheiden & Abschließen"). Hier zusätzlich im
 * Browser, damit die Person den Fehler sofort sieht statt per Mail zurückzubekommen.
 *
 * @returns Liste von Fehlermeldungen; leer heißt: in Ordnung.
 */
export function pruefeEigeneAngaben(woche: EigeneWoche): string[] {
  const fehler: string[] = [];
  let offeneTage = 0;

  for (const { key, label } of WOCHENTAGE) {
    const tag = woche[key];
    if (tag.geschlossen) continue;

    const gefuellt = tag.zeiten.filter((z) => z.von || z.bis);
    if (gefuellt.length === 0) continue;

    offeneTage++;
    const spannen: Array<[number, number]> = [];

    for (const z of gefuellt) {
      if (!z.von || !z.bis) {
        fehler.push(`${label}: Es fehlt eine Uhrzeit — bitte "von" und "bis" ausfüllen.`);
        continue;
      }
      const von = alsMinuten(z.von);
      let bis = alsMinuten(z.bis);
      if (von === null || bis === null) {
        fehler.push(`${label}: Uhrzeit nicht lesbar.`);
        continue;
      }
      if (von === bis) {
        fehler.push(`${label}: Öffnen und Schließen sind gleich (${z.von}).`);
        continue;
      }
      // Über Mitternacht ist erlaubt: "22:00 bis 02:00".
      if (bis < von) bis += 24 * 60;
      spannen.push([von, bis]);
    }

    spannen.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spannen.length; i++) {
      if (spannen[i][0] < spannen[i - 1][1]) {
        fehler.push(`${label}: Die beiden Zeiträume überschneiden sich.`);
        break;
      }
    }
  }

  if (offeneTage === 0) {
    fehler.push(
      "An keinem Tag sind Öffnungszeiten eingetragen. Bitte mindestens einen Tag ausfüllen.",
    );
  }

  return fehler;
}
