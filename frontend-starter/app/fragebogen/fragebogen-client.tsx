"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getWebhook, postWebhook } from "@/lib/n8n";
import { DEMO_FALL } from "./demo";
import {
  WOCHENTAGE,
  leereWoche,
  pruefeEigeneAngaben,
  type EigeneWoche,
  type FallDaten,
  type KuecheArt,
  type Wochentag,
} from "./typen";

const ANREDE: Record<string, string> = {
  gastronom: "Sie kennen Ihren Betrieb am besten",
  ersteller: "Sie haben diesen Eintrag angelegt",
  bearbeiter: "Sie haben diesen Eintrag zuletzt bearbeitet",
};

export default function FragebogenClient() {
  const router = useRouter();
  const parameter = useSearchParams();
  const token = parameter.get("token") ?? "";
  const demoRolle = parameter.get("rolle") as FallDaten["rolle"] | null;

  const [fall, setFall] = useState<FallDaten | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<string>("");
  const [eigene, setEigene] = useState<EigeneWoche>(leereWoche);
  // Zusatzfrage nach den Küchenzeiten. Vorbelegt mit "unbekannt" — wer sie
  // überspringt, hat trotzdem vollständig geantwortet.
  const [kuecheArt, setKuecheArt] = useState<KuecheArt>("unbekannt");
  const [kuecheZeiten, setKuecheZeiten] = useState<EigeneWoche>(leereWoche);
  const [fehler, setFehler] = useState<string[]>([]);
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    if (!token) {
      setLadeFehler("In der Adresse fehlt der persönliche Zugangscode aus Ihrer E-Mail.");
      return;
    }
    // Vorschau ohne laufendes n8n: /fragebogen?token=demo
    // Mit &rolle=gastronom lässt sich die Gastronomen-Sicht zeigen — dort fehlt
    // der Bearbeitungslink absichtlich.
    if (token === "demo") {
      setFall(demoRolle ? { ...DEMO_FALL, rolle: demoRolle } : DEMO_FALL);
      return;
    }
    getWebhook<FallDaten>("oz-fragebogen", { token })
      .then(setFall)
      .catch((e) => setLadeFehler(e instanceof Error ? e.message : String(e)));
  }, [token, demoRolle]);

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    setFehler([]);

    if (!auswahl) {
      setFehler(["Bitte wählen Sie eine Fassung aus — oder tragen Sie die richtigen Zeiten ein."]);
      return;
    }
    if (auswahl === "eigene") {
      const probleme = pruefeEigeneAngaben(eigene);
      if (probleme.length > 0) {
        setFehler(probleme);
        return;
      }
    }
    if (kuecheArt === "andere") {
      const probleme = pruefeEigeneAngaben(kuecheZeiten, "Küchenzeiten");
      if (probleme.length > 0) {
        setFehler(probleme.map((p) => `Warme Küche — ${p}`));
        return;
      }
    }

    setSendet(true);
    try {
      // Im Demo-Modus nichts abschicken — nur zeigen, wie es aussieht.
      if (token === "demo") {
        router.push("/fragebogen/danke");
        return;
      }
      await postWebhook("oz-fragebogen-antwort", {
        token,
        auswahl,
        eigene: auswahl === "eigene" ? eigene : null,
        kueche: { art: kuecheArt, tage: kuecheArt === "andere" ? kuecheZeiten : null },
      });
      router.push("/fragebogen/danke");
    } catch (err) {
      setFehler([err instanceof Error ? err.message : String(err)]);
      setSendet(false);
    }
  }

  if (ladeFehler) {
    return (
      <Rahmen>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="font-medium">Dieser Fragebogen lässt sich nicht öffnen.</p>
          <p className="mt-1 text-sm">{ladeFehler}</p>
          <p className="mt-3 text-sm">
            Bitte öffnen Sie den Link direkt aus Ihrer E-Mail. Klappt es weiterhin nicht,
            antworten Sie einfach auf die E-Mail.
          </p>
        </div>
      </Rahmen>
    );
  }

  if (!fall) {
    return (
      <Rahmen>
        <p className="text-gray-600">Fragebogen wird geladen …</p>
      </Rahmen>
    );
  }

  if (fall.status === "beantwortet") {
    return (
      <Rahmen>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
          <p className="font-medium">Danke — diese Rückmeldung ist schon eingegangen.</p>
          <p className="mt-1 text-sm">
            Für {fall.betrieb.name} haben Sie bereits geantwortet. Sie müssen nichts weiter tun.
          </p>
        </div>
      </Rahmen>
    );
  }

  return (
    <Rahmen>
      {token === "demo" && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Vorschau.</strong> Beispieldaten aus dem echten Datenpool, es wird nichts
          gesendet und nichts geändert.
        </p>
      )}
      <header>
        <h1 className="text-2xl font-bold">Stimmen diese Öffnungszeiten?</h1>
        <p className="mt-2 text-lg text-gray-800">
          {fall.betrieb.name}
          {fall.betrieb.ort ? <span className="text-gray-500"> · {fall.betrieb.ort}</span> : null}
        </p>
        <p className="mt-3 text-sm text-gray-600">
          Für diesen Betrieb liegen uns unterschiedliche Öffnungszeiten vor.
          {fall.rolle && ANREDE[fall.rolle] ? ` ${ANREDE[fall.rolle]} — ` : " "}
          bitte kreuzen Sie die richtige Fassung an. Das dauert weniger als eine Minute.
          {fall.frist ? ` Rückmeldung bitte bis ${fall.frist}.` : ""}
        </p>

        {fall.betrieb.gaesteLink && (
          <p className="mt-3 rounded-lg border border-gray-300 bg-white p-3 text-sm">
            So sieht Ihr Eintrag gerade für Gäste aus:{" "}
            <a
              href={fall.betrieb.gaesteLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline"
            >
              im TeutoNavigator ansehen
            </a>
            {fall.betrieb.gaesteStatus && (
              <>
                {" "}— dort steht aktuell{" "}
                <strong className="text-red-800">„{fall.betrieb.gaesteStatus}"</strong>.
              </>
            )}
          </p>
        )}
      </header>

      <form onSubmit={absenden} className="flex flex-col gap-4">
        {fall.varianten.map((variante) => (
          <label
            key={variante.key}
            className={`cursor-pointer rounded-lg border p-4 transition ${
              auswahl === variante.key
                ? "border-brand bg-indigo-50"
                : "border-gray-300 bg-white hover:border-gray-400"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="fassung"
                value={variante.key}
                checked={auswahl === variante.key}
                onChange={() => setAuswahl(variante.key)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Laut {variante.quelle}</p>
                {variante.hinweis && (
                  <p className="text-xs text-gray-500">{variante.hinweis}</p>
                )}
                <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm">
                  {WOCHENTAGE.map(({ key, label }) => (
                    <div key={key} className="contents">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="font-medium">{variante.tage[key] ?? "keine Angabe"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </label>
        ))}

        <label
          className={`cursor-pointer rounded-lg border p-4 transition ${
            auswahl === "eigene"
              ? "border-brand bg-indigo-50"
              : "border-gray-300 bg-white hover:border-gray-400"
          }`}
        >
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="fassung"
              value="eigene"
              checked={auswahl === "eigene"}
              onChange={() => setAuswahl("eigene")}
              className="mt-1"
            />
            <p className="font-medium">Keine davon stimmt — ich trage die richtigen Zeiten ein</p>
          </div>
        </label>

        {auswahl === "eigene" && (
          <WochenFelder
            woche={eigene}
            setWoche={setEigene}
            legende="Die richtigen Öffnungszeiten"
            hinweis="Tage ohne Eintrag lassen wir unverändert. Geht die Öffnung über Mitternacht, tragen Sie einfach die spätere Uhrzeit als Schließung ein, z.B. 20:00 – 02:00."
          />
        )}

        {fall.kueche?.fragen ? (
          <fieldset className="rounded-lg border border-gray-300 bg-white p-4">
            <legend className="px-1 text-sm font-medium">
              Noch eine Frage, wenn Sie mögen
            </legend>
            <p className="text-sm text-gray-600">
              Gäste fragen meistens nicht „ist offen?", sondern „kann ich da jetzt essen?".
              Für Ihren Betrieb ist bei uns keine Küchenzeit hinterlegt
              {fall.kueche.hinweis ? (
                <> — nur der Hinweis „{fall.kueche.hinweis}"</>
              ) : null}
              . Wann ist Ihre <strong>warme Küche</strong> geöffnet?
            </p>
            {/*
              Eigene Gruppe mit eigenem Namen: die Legende des Fieldsets sagt nur
              "Noch eine Frage" und damit nichts über das Thema. Ein Screenreader
              würde die vier Optionen sonst ohne jeden Bezug vorlesen.
            */}
            <div
              role="radiogroup"
              aria-label="Wann ist Ihre warme Küche geöffnet?"
              className="mt-3 flex flex-col gap-2"
            >
              {(
                [
                  ["unbekannt", "Überspringen — weiß ich gerade nicht"],
                  ["wie-oben", "Genauso wie die Öffnungszeiten"],
                  ["andere", "Andere Zeiten — ich trage sie ein"],
                  ["keine", "Wir haben keine warme Küche"],
                ] as Array<[KuecheArt, string]>
              ).map(([wert, text]) => (
                <label key={wert} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="kueche"
                    value={wert}
                    checked={kuecheArt === wert}
                    onChange={() => setKuecheArt(wert)}
                  />
                  {text}
                </label>
              ))}
            </div>
            {kuecheArt === "andere" && (
              <div className="mt-3">
                <WochenFelder
                  woche={kuecheZeiten}
                  setWoche={setKuecheZeiten}
                  legende="Zeiten der warmen Küche"
                  hinweis="Nur die Zeiten, in denen wirklich gekocht wird — nicht Frühstück, Buffet oder Getränke."
                />
              </div>
            )}
          </fieldset>
        ) : (
          fall.kuechenzeiten && (
            <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-600">
              <strong>Hinweis:</strong> Für die Küche ist zusätzlich „{fall.kuechenzeiten}"
              hinterlegt. Hier geht es nur um die Öffnungszeiten des Betriebs — die Küchenzeiten
              ändern wir nicht.
            </p>
          )
        )}

        {/*
          role="alert" sorgt dafür, dass ein Screenreader die Fehler vorliest,
          sobald sie erscheinen. Ohne das merkt jemand, der die Seite nicht
          sieht, gar nicht, warum das Absenden nichts tut.
        */}
        {fehler.length > 0 && (
          <ul
            role="alert"
            aria-live="assertive"
            className="list-inside list-disc rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            {fehler.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={sendet}
          className="rounded-lg bg-brand px-4 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {sendet ? "Wird gesendet …" : "Rückmeldung absenden"}
        </button>
      </form>
    </Rahmen>
  );
}

/**
 * Wochentags-Raster zum Eintragen von Zeiten.
 *
 * Wird zweimal gebraucht — für die Öffnungszeiten und für die warme Küche —,
 * deshalb als eigene Komponente. Die aria-Labels enthalten die Legende, sonst
 * hätten beide Raster dieselben Beschriftungen und ein Screenreader könnte sie
 * nicht auseinanderhalten.
 */
function WochenFelder({
  woche,
  setWoche,
  legende,
  hinweis,
}: {
  woche: EigeneWoche;
  setWoche: React.Dispatch<React.SetStateAction<EigeneWoche>>;
  legende: string;
  hinweis: string;
}) {
  function setzeZeit(tag: Wochentag, index: number, feld: "von" | "bis", wert: string) {
    setWoche((alt) => {
      const zeiten = alt[tag].zeiten.map((z, i) => (i === index ? { ...z, [feld]: wert } : z));
      return { ...alt, [tag]: { ...alt[tag], zeiten } };
    });
  }

  function schalteGeschlossen(tag: Wochentag, geschlossen: boolean) {
    setWoche((alt) => ({ ...alt, [tag]: { ...alt[tag], geschlossen } }));
  }

  function zweiteSpanne(tag: Wochentag) {
    setWoche((alt) => ({
      ...alt,
      [tag]: { ...alt[tag], zeiten: [...alt[tag].zeiten, { von: "", bis: "" }] },
    }));
  }

  return (
    <fieldset className="rounded-lg border border-gray-300 bg-white p-4">
      <legend className="px-1 text-sm font-medium">{legende}</legend>
      <div className="flex flex-col gap-3">
        {WOCHENTAGE.map(({ key, label }) => (
          <div key={key} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-sm">{label}</span>
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={woche[key].geschlossen}
                onChange={(e) => schalteGeschlossen(key, e.target.checked)}
                // Der Wochentag steht im span DAVOR, also ausserhalb dieses
                // Labels — ohne aria-label heissen alle vierzehn Kästchen nur
                // "geschlossen", und mit dem Screenreader ist nicht erkennbar,
                // welcher Tag und welches Raster gemeint ist.
                aria-label={`${legende}: ${label} geschlossen`}
              />
              geschlossen
            </label>
            {!woche[key].geschlossen && (
              <>
                {woche[key].zeiten.map((z, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <input
                      type="time"
                      value={z.von}
                      onChange={(e) => setzeZeit(key, i, "von", e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                      aria-label={`${legende}: ${label} Öffnung ${i + 1}`}
                    />
                    <span className="text-gray-400">–</span>
                    <input
                      type="time"
                      value={z.bis}
                      onChange={(e) => setzeZeit(key, i, "bis", e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                      aria-label={`${legende}: ${label} Schließung ${i + 1}`}
                    />
                  </span>
                ))}
                {woche[key].zeiten.length < 2 && (
                  <button
                    type="button"
                    onClick={() => zweiteSpanne(key)}
                    className="text-sm text-brand underline"
                  >
                    + Mittagspause
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">{hinweis}</p>
    </fieldset>
  );
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 sm:p-8">{children}</main>
  );
}
