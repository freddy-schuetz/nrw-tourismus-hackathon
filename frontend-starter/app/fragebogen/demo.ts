import type { FallDaten } from "./typen";

/**
 * Demo-Fall für `/fragebogen?token=demo` — zum Ansehen und Vorführen, ohne dass n8n läuft.
 *
 * Es ist ein ECHTER Fall aus dem Datenpool teutoburgerwald (Datensatz 100046684):
 * die strukturierten Öffnungszeiten sagen bis 23:00 Uhr, der Freitext im selben
 * Datensatz sagt bis 22:00 Uhr. Genau diese Sorte Unstimmigkeit soll der Ablauf finden.
 */
export const DEMO_FALL: FallDaten = {
  status: "offen",
  betrieb: {
    name: "Pfennigskrug",
    ort: "Testdaten — nicht echt versendet",
    // Echter Link, aus global_id + Titel gebaut (siehe oz-logik/normalisieren.js).
    gaesteLink:
      "https://www.teutonavigator.de/de/teutonavigator/wlan/detail/Gastro/g_100046684/pfennigskrug",
    // gaesteStatus bleibt leer: dieser Eintrag zeigt im Portal keinen Status-Badge.
  },
  rolle: "bearbeiter",
  frist: "07.09.2026",
  kuechenzeiten: "Warme Küche bis 21:30 Uhr",
  varianten: [
    {
      key: "A",
      quelle: "destination.data",
      hinweis: "die aktuell hinterlegten Öffnungszeiten",
      tage: {
        Monday: "16:00–23:00",
        Tuesday: "16:00–23:00",
        Wednesday: "16:00–23:00",
        Thursday: "16:00–23:00",
        Friday: "16:00–23:00",
        Saturday: "16:00–23:00",
        Sunday: "geschlossen",
      },
    },
    {
      key: "B",
      quelle: "Beschreibungstext im selben Datensatz",
      hinweis: "„Montag bis Samstag von 16.00 – 22.00 Uhr, Sonntag und Feiertag geschlossen\"",
      tage: {
        Monday: "16:00–22:00",
        Tuesday: "16:00–22:00",
        Wednesday: "16:00–22:00",
        Thursday: "16:00–22:00",
        Friday: "16:00–22:00",
        Saturday: "16:00–22:00",
        Sunday: "geschlossen",
      },
    },
    {
      key: "C",
      quelle: "Webseite des Betriebs",
      hinweis: "automatisch von der Webseite gelesen",
      tage: {
        Monday: "17:00–22:00",
        Tuesday: "17:00–22:00",
        Wednesday: "geschlossen",
        Thursday: "17:00–22:00",
        Friday: "17:00–23:00",
        Saturday: "17:00–23:00",
        Sunday: "11:30–14:30",
      },
    },
  ],
};
