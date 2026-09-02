# Workflow-Prüfbericht

## Allgemeine Informationen

| Feld | Wert |
|------|------|
| Vorhaben | Öffnungszeiten-Abgleich Gastronomie |
| Datenbestand | destination.data, Mandant/Experience `teutoburgerwald` (ID **18395**), Datenart Gastro |
| Workflows | `OZ-1 Prüflauf` · `kA7l1cL2t0iP5r7c`<br>`OZ-2 Antwort` · `XwJ1UamqGydGsJjE`<br>`OZ-3 Entscheiden` · `lRQBhtog2no1SeHz` |
| Oberfläche | Fragebogen-Seite · https://app-0755d440.buildbar.de |
| Erstellt am | 31.08. – 01.09.2026 |
| Geprüft am | 01.09.2026 |
| Erstellt von | Claude Code, im Auftrag von t.valentien (Teutoburger Wald Tourismus) |

---

## Beschreibung

Der Ablauf findet Gastro-Datensätze mit falschen oder fehlenden Öffnungszeiten, fragt **einmalig
und gezielt** die richtigen Menschen — nicht „pflegt mal eure Daten", sondern „welche dieser drei
Fassungen stimmt?" —, plausibilisiert die Antworten und bereitet die Korrektur vor.

Verglichen werden bis zu drei Quellen pro Betrieb:

| | Quelle | Woher |
|---|---|---|
| **A** | `timeIntervals` | das strukturierte Feld in destination.data |
| **B** | Freitext | `texts[rel=openings]` / `[rel=dayoff]` im **selben** Datensatz |
| **C** | Betriebs-Webseite | schema.org/JSON-LD (exakt) oder Fließtext (von einem Sprachmodell gelesen) |

Der Kern ist nicht das Verschicken, sondern das **bedeutungsgleiche** Vergleichen:
`Mo 11-14, 17-22` und `Montag 11:00–14:00 und 17:00–22:00 Uhr` sind dieselbe Aussage und dürfen
keinen Fehlalarm auslösen.

---

## Architektur

Drei getrennte Workflows statt eines großen — zwischen „fragen" und „antworten" liegen Tage.

```
OZ-1  Zeitplan/Knopfdruck → Bestehende Fälle lesen → 1133 Datensätze holen (Paging)
      → Zeiten vergleichen (A gegen B) → Webseite abrufen? → Webseite holen
      → Webseite auswerten (schema.org) → Webtext vorhanden? → KI liest den Seitentext
      → KI-Ergebnis prüfen → Fassungen zusammenführen → Fall speichern
      → Zuständige lesen → Empfänger bestimmen → Token erzeugen → Mailtext bauen
      → Zugang anlegen → [Anfrage senden]

OZ-2  GET  /webhook/oz-fragebogen          → Token prüfen → Fall + Fassungen liefern
      POST /webhook/oz-fragebogen-antwort  → Token prüfen → Plausibilität → speichern

OZ-3  Täglicher Zeitplan → entscheidungsreife Fälle → Konsensregeln → oz_ergebnisse
      → [Quittung senden]
```

**Umfang:** 29 Nodes in OZ-1 (davon 6 Sticky Notes zur Dokumentation), 18 in OZ-2, 15 in OZ-3.

**Verwendete Dienste:** öffentliche Such-Schnittstelle `meta.et4.de/rest.ashx/search` (**kein
Lizenzschlüssel nötig**) · n8n Data Tables (`oz_faelle`, `oz_antworten`, `oz_ergebnisse`,
`oz_zustaendige`) · `CUSTOM.lmChatOneIntelligence` (Claude Sonnet 5 über one.intelligence) ·
SMTP · Next.js-Frontend auf `deploy.buildbar.de` (EU).

**Eine Quelle für die Logik:** Der Code der Nodes wird aus `oz-logik/normalisieren.js` und
`oz-logik/webseite.js` **erzeugt** (`node oz-logik/baue-oz1-workflow.js --update <id>`), nicht im
n8n-Editor bearbeitet. Damit kann keine zweite Fassung entstehen, die auseinanderläuft. Der
Bau-Schritt bricht ab, wenn beide Module denselben Funktionsnamen belegen.

---

## Testergebnisse

### Vergleichslogik gegen den echten Datenbestand

| Testszenario | Status | Ergebnis |
|-------------|--------|----------|
| Alle 1133 Datensätze lesen (Paging, 3 Seiten à 400) | **PASS** | ohne Timeout, 0,5 s |
| Referenzfall *Café Elise*: `Mo–So 08:00–18:00` vs. „Täglich von 8.00 bis 18.00 Uhr" | **PASS** | als **einig** erkannt, **kein** Fall |
| Referenzfall *Hotel-Restaurant Sonnenhof*: `Sa,So 00:00–00:00` vs. „durchgehend geöffnet" | **PASS** | als **einig** erkannt — `00:00–00:00` wird als 24 h offen gedeutet |
| Referenzfall *Waldhotel Bärenstein*: leer vs. voller Freitext | **PASS** | Direkt-Vorschlag, **keine** Mail |
| Referenzfall *Rumiz Weinzirkel*: „auf Anfrage" | **PASS** | bewusst **kein** Fall |
| Küchenzeiten dürfen nicht als Öffnungszeiten gelten (*Pfennigskrug*) | **PASS** | Küchen-, Buffet- und Brunchzeiten werden abgeschnitten |
| Tagesgruppen segmentieren (*„Mi-Fr 14-19 Uhr Sa 11-20 Uhr"*) | **PASS** | Zeiten landen nicht auf allen Tagen; Fehlalarmquote 46 % → 36 % |
| Fehlalarm-Probe über die gesamte Auswahlmenge | **PASS** | 215 Datensätze als einig erkannt und **nicht** angefasst |

### Quelle C — Betriebs-Webseite (Messlauf über alle 1133 Datensätze)

| Kennzahl | Wert |
|---|---|
| Webseiten abgefragt | 45 (Seiten-Budget) |
| belastbare Fassung aus schema.org | 1 (im früheren Lauf; im sauberen Lauf lag kein schema.org-Fall im Budget) |
| wegen fremdem `@type` verworfen (Hotel-/Büro-Zeiten) | 3 |
| nur Fließtext → an das Sprachmodell | 20 |
| kein Fund auf der Seite | 22 |
| Seite nicht erreichbar (tote Domain, Timeout) | 3 |

| Testszenario | Status | Ergebnis |
|-------------|--------|----------|
| Typfilter gegen Fremd-Zeiten | **PASS** | ohne Filter 6 Treffer, davon 3 × `Mo–Sa 09:00–17:00` (Hotelrezeption/Büro); mit Filter 1 Treffer, echt |
| `00:00–00:00` bei schema.org = **geschlossen** (umgekehrt zu destination.data) | **PASS** | beide Kodierungen getrennt behandelt |
| Sprachmodell: 20 Seitentexte gelesen | **PASS** | 14 ableitbar, **6 von der KI selbst abgelehnt** („auf Anfrage", mehrere Saisons, widersprüchliche Blöcke) |
| Erfundene Zeiten | **PASS** | **0** — jede genannte Uhrzeit muss im Seitentext vorkommen |
| Verwechselte Küchenzeiten | **PASS** | **0**, auch bei zwei Seiten mit Küchenzeiten direkt neben den Öffnungszeiten |
| Unplausible Fassungen (24/7, Öffnung vor 05:00, > 4 Ruhetage) | **PASS** | **0** durchgelassen |
| Ergebnis (sauberer Lauf 16:32, 73 s, 0 Fehler) | **PASS** | 8 neue Fälle · 2 dritte Fassungen · 4 bestätigt · 6 verworfen |
| **Gegenprobe von Hand an allen 8 neuen Fällen** | **PASS** | **8 von 8 sind echte Widersprüche** |

### Offline-Prüfungen ohne n8n und ohne Modellaufruf

`node oz-logik/ki-auswertung-test.js` — **33 Prüfungen, alle grün.**

| Testszenario | Status | Ergebnis |
|-------------|--------|----------|
| Happy Path: echter Widerspruch | **PASS** | Fall mit Priorität 2, betroffene Tage im Grund, Herkunft der Fassung dabei |
| Halluzination: KI nennt 19:30, Text sagt 17:00 | **PASS** | verworfen, **kein** Fall |
| KI passt selbst (`ableitbar=false`) | **PASS** | verworfen |
| Saisonhinweis im Text (Sommer/Winter) | **PASS** | verworfen, obwohl `ableitbar=true` |
| 24/7 aus dem Text | **PASS** | verworfen |
| Webseite bestätigt die Datenbank | **PASS** | **kein** Fall, **keine** Mail |
| **Schweigen ist kein Widerspruch** (Seite nennt nur Fr + Sa) | **PASS** | die anderen fünf Tage werden nicht in Frage gestellt |
| Mittagstisch **und** offener Abend am selben Tag | **PASS** | `11:30–14:00, ab 18:00` statt `ab 11:30, ab 18:00` |
| Error Case: Modell-Timeout / kaputte Antwort | **PASS** | Fassung fällt weg, Bestandsfall bleibt erhalten, Lauf läuft weiter |
| Error Case: Antwortzahl ≠ Fragenzahl | **PASS** | **gar nichts** wird übernommen (sonst Zeiten beim falschen Betrieb) |
| Hin-und-Rück-Test `wocheAlsText` ↔ `wocheAusFassung` | **PASS** | 7 Fassungsarten, danach findet `vergleiche()` keine Abweichung |

### Fragebogen und Entscheidung (Ende zu Ende)

| Testszenario | Status | Ergebnis |
|-------------|--------|----------|
| Fragebogen mit gültigem Token öffnen | **PASS** | Betrieb, Frist, drei Fassungen mit Herkunftsangabe — live geprüft an *Benni´s Kitchen* und *AUREUS im Hotel Vivendi* |
| Erfundenes Token | **PASS** | freundliche Absage, **keine** Datensatz-ID und **keine** Mailadresse in der Antwort |
| Zweites Öffnen nach dem Absenden | **PASS** | „schon beantwortet" |
| Freie Eingabe unmöglicher Zeiten | **PASS** | abgelehnt und begründet |
| OZ-3: alle einig · 2 von 3 · nur Gastronom · Widerspruch · niemand | **PASS** | 8 Szenarien durchgespielt, erwartetes Ergebnis und Konfidenz |
| OZ-3: zwei Gastronomen widersprechen sich | **PASS** | Eskalation statt stiller Auswahl der ersten Antwort |
| Quittungsmail enthält Vorher und Nachher | **PASS** | lokal gerendert und geprüft |

### Zwei Fehler, die den Echtbetrieb zerlegt hätten — gefunden und behoben

| Befund | Wirkung ohne Fix | Behoben durch |
|---|---|---|
| `Fall speichern` legte pro Lauf eine **neue** Zeile je Datensatz an | Der Fragebogen liest den ersten Treffer, also die **älteste** Zeile — er zeigte veraltete Fassungen | **Upsert** auf `datensatz_id` (n8n verlangt dafür `filters.conditions` **und** `columns.matchingColumns`) |
| Nichts hinderte den Wochenlauf daran, **offene** Fälle erneut anzufragen | Dieselben Menschen bekommen jede Woche dieselbe Mail — nach der zweiten unnötigen liest niemand mehr die dritte | Neuer erster Node `Bestehende Fälle lesen`; überschrieben werden nur `entschieden` und `bestaetigt` |
| Der Abruf-Node lief **265-mal** (einmal je bestehendem Fall) über alle 1133 Datensätze | n8n-Instanz stürzte dreimal ab (`possible out-of-memory`) | `executeOnce: true` — nachgewiesen: `Bestehende Fälle lesen items=265` → `Gastro-Datensätze holen items=3` |

---

## Validierung

| Prüfung | Status |
|---------|--------|
| Technische Validierung `n8n_validate_workflow` — OZ-1 | **PASS** — 0 Fehler, 22 gültige Verbindungen, 44 Expressions geprüft |
| Technische Validierung — OZ-2 | **PASS** — 0 Fehler, 0 Warnungen |
| Technische Validierung — OZ-3 | **PASS** — 0 Fehler |
| Auto-Fix angewendet | **Nein** — nicht nötig, keine Fehler |
| Expression-Syntax geprüft | **PASS** — Webhook-Daten konsequent über `.body`, in Code-Nodes kein `{{}}` |
| Verbleibende Warnungen | 3 × `executeOnce` (**beabsichtigt**, siehe oben) · 1 × Verbindung zu abgeschaltetem Versand-Node (**beabsichtigt**) · 1 × Community-Node `CUSTOM.lmChatOneIntelligence` der Prüf-Datenbank unbekannt (in der Instanz installiert) |

---

## Security-Prüfung

| Prüfpunkt | Status |
|-----------|--------|
| Keine hardcoded Secrets | **OK** — Zugangsdaten ausschließlich als n8n-Credentials; `.mcp.json` und `.claude/launch.json` sind gitignored |
| Keine Secrets im Repo | **OK** — im Frontend nur `NEXT_PUBLIC_N8N_BASE` (die beiden Webhooks sind ohnehin öffentlich und geben ohne gültiges Token nichts preis) |
| Webhook-Authentifizierung | **OK** — Einmal-Token, 32 Zeichen, aus `n8n-nodes-base.crypto` (nicht aus `Math.random`), mit Frist, nach dem Absenden verbraucht |
| Fehlermeldungen geben nichts preis | **OK** — bei ungültigem Token nur `{status:"unbekannt"}`, keine Datensatz-ID, keine Mailadresse |
| Fehlerbehandlung vorhanden | **OK** — Webseiten-Abruf und Modellaufruf mit `onError: continueRegularOutput`; ein tote Domain oder ein Modell-Timeout bricht den Lauf nicht ab und erzeugt **keine** falschen Daten |
| Datenminimierung | **OK** — keine personenbezogenen Daten in Node-Namen oder Sticky Notes; die Betriebs-Webseite wird nur nach Öffnungszeiten durchsucht, der Seitentext nicht gespeichert |
| Prompt Injection | **OK** — der Seitentext ist Fremdtext, wird als solcher gekennzeichnet und begrenzt; die Systemanweisung weist Anweisungen im Fremdtext ausdrücklich ab; und selbst eine folgsame KI kann nur Zeiten vorschlagen, die im Text stehen und plausibel sind |
| Massen-Änderungen | **OK** — harte Obergrenzen pro Lauf (`MAX_FAELLE` 40, `MAX_WEBSEITEN` 40, `MAX_SEITEN_GESAMT` 45, `MAX_KI` 25); nie ein Löschen, nie ein Feld außer `timeIntervals` |
| Kein echter Mailversand im Hackathon | **OK — doppelt verriegelt** |

### Der Befund, der den Testmodus erzwungen hat

Die Gastronomen-Adressen kommen **live aus der Schnittstelle** und sind echt: im Probelauf waren
**63 von 70** Empfängern echte Betriebsadressen. Deshalb sind zwei unabhängige Sperren aktiv:

1. Die Versand-Nodes (`Anfrage senden`, `Quittung senden`) sind **abgeschaltet**.
2. `TESTMODUS = true` leitet **jeden** Empfänger auf eine Testadresse um.

Nachgewiesen: nach Einführung der Sperre gingen **0 von 70** Zugängen an eine echte Adresse,
**70 von 70** an die Testadresse. `OZ-1` und `OZ-3` sind nach den Tests wieder **deaktiviert**,
alle temporären Test-Webhooks entfernt.

---

## Unabhängige Gegenprüfung

Die Küchenzeiten-Erweiterung zieht sich über vier Bausteine (OZ-1, OZ-2, OZ-3, Frontend) und
führt einen neuen Vertrag zwischen ihnen ein. Weil man für eigene Fehler blind wird, wurde der
Stand von unabhängigen Prüfern gegengelesen — jeder Befund anschließend von zweiter Seite mit dem
ausdrücklichen Auftrag, ihn zu **widerlegen**.

| | |
|---|---|
| Geprüfte Dimensionen | Vertragstreue zwischen den Bausteinen · Korrektheit an Randfällen · Verluste beim Zurückholen der Quittung · Oberfläche und Barrierefreiheit |
| Gemeldete Befunde | 12 |
| Widerlegt | 8 |
| **Bestätigt und behoben** | **4** |

Die vier bestätigten Befunde:

| Schwere | Befund |
|---|---|
| hoch | Die „geschlossen"-Kästchen hießen für einen Screenreader **vierzehnmal** nur „geschlossen" — ohne Wochentag und ohne Hinweis, ob Öffnungs- oder Küchenzeiten gemeint sind. Der Kommentar im Code behauptete das Gegenteil; die Legende steckte nur in den Zeit-Feldern. |
| mittel | „Genauso wie die Öffnungszeiten" als Prosa in der Zeiten-Spalte (siehe oben) |
| mittel | Fehlermeldungen wurden nicht angekündigt — wer die Seite nicht sieht, merkte nicht, warum das Absenden nichts tut. Jetzt `role="alert"`. |
| niedrig | Die Radio-Gruppe zur Küche hatte keinen eigenen Namen; die Legende sagt nur „Noch eine Frage". |

Dazu ein Nebenfund: die Anrede „vielen Dank für Ihre **Mithilfe**" für die Redaktion war beim
Zurückholen der Quittung verlorengegangen — sonst hätte sich die Mail bei jemandem für eine
Rückmeldung bedankt, die diese Person nicht abgegeben hat.

---

## Übertragbarkeit auf eine andere Instanz

Zu Beginn standen die vier Data-Table-IDs an **neun** Stellen in drei Bauskripten, die
Credential-ID an einer zehnten. Auf einer neuen n8n-Instanz existiert keine davon — ein Umzug
hätte bedeutet, vier Tabellen samt aller Spalten von Hand anzulegen und zehn Stellen zu ersetzen.

Jetzt:

| | |
|---|---|
| `node oz-logik/baue-tabellen.js` | legt die vier Tabellen mit allen 44 Spalten an und schreibt die IDs nach `tabellen.json`. Wiederholbar, erkennt bestehende Tabellen am Namen, ergänzt nur fehlende Spalten, **löscht nie etwas**. `--pruefen` vergleicht ohne zu ändern. |
| `oz-logik/instanz.js` | liest `tabellen.json` und `credentials.json` und nennt im Fehlerfall den fehlenden Befehl |
| `credentials.json.example` | Vorlage; enthält nur IDs und Namen, **keine Geheimnisse** |
| [uebergabe.md](uebergabe.md) | Umzug in acht Schritten, für jemanden ohne Kenntnis dieses Projekts |

**Kein einziges hartes ID mehr im Quelltext.** Geprüft: alle drei Workflows aus den umgestellten
Skripten neu ausgerollt, alle **zwölf** Data-Table-Nodes zeigen auf die richtige Tabelle; beide
Fehlerpfade ausgelöst; und der **Anlege-Pfad**, der beim Umzug zählt und zunächst nie ausgeführt
worden war — vier Tabellen als `probe_*` erzeugt, Spalten mit den echten verglichen (18/10/9/7,
identisch), Testtabellen wieder gelöscht.

---

## Empfehlungen

### Vor dem ersten echten Betrieb zwingend

1. **Schreibrechte für `quickedit`.** Das ist der einzige echte Blocker. Der Node
   `CUSTOM.destinationData` kann lesen, aber `resource: quickedit` scheitert an **Rechten**, nicht
   an Wissen. Nötig ist ein **technischer Benutzer** mit Rechten nur auf `teutoburgerwald` und nur
   auf Öffnungszeiten, plus ein quickedit-Schema, das die Öffnungszeiten-Felder freigibt. Kein
   persönlicher Account — sonst stehen alle Änderungen als „geändert durch <Person>" im Datensatz,
   obwohl der Gastronom sie bestätigt hat, und der Ablauf bricht beim nächsten Passwortwechsel.
   Bis dahin schreibt der Baustein `oz-schreiben` in `oz_ergebnisse` und erzeugt eine
   Änderungsliste; scharf zu schalten ist **ein** Node-Tausch.
2. **Absenderadresse eintragen.** In `oz-logik/baue-oz1-workflow.js` steht noch
   `noreply@BITTE-EINTRAGEN`.
3. **SMTP-Credential einmal per Hand freigeben.** Ein über die API angelegter Workflow konnte das
   Credential nicht nutzen („There was a problem executing the workflow", ohne gespeicherte
   Ausführung). Ein einmaliger Klick auf „Test workflow" im Editor löst das.
4. **`TESTMODUS = false`** setzen und die Versand-Nodes einschalten — **erst nach 1 bis 3**.
5. **Datenschutz klären**, bevor echte Gastronomen angeschrieben werden. Die geteilten
   buildbar-Bausteine sind ausdrücklich **nicht** für echte personenbezogene Daten gedacht; für
   den Echtbetrieb gehören Data Tables und Frontend in eine eigene Umgebung.

### Aufräumen

6. **`oz_faelle` enthält rund 260 Testzeilen** aus den Läufen vom 01.09.2026, mehrere je
   Datensatz (der Upsert kam erst danach). Solange sie stehen, überspringt der nächste Lauf etwa
   50 Datensätze als „schon in Arbeit".
7. **Ein sauberer Gesamtlauf** mit allen Korrekturen fehlt noch. Die Ursache der Abstürze ist
   gefunden und behoben und der Nachweis liegt vor; anschließend nahm die geteilte n8n-Instanz
   keine Ausführungen mehr an.

### Später

8. **Erinnerung vor Fristende** ist bewusst **nicht** gebaut — genau **eine** Erinnerung, dann
   Ruhe. Kein Dauer-Nachfassen, sonst wird der Ablauf zum Spam-Absender.
9. **Unterseiten** für die 36 Seiten ohne Fund: dort stehen die Zeiten oft einen Klick tiefer.
   `unterseitenKandidaten()` ist gebaut, aber nicht eingehängt.
10. **Google Maps als vierte Quelle** — braucht einen Places-API-Schlüssel mit Abrechnungskonto
    (~35 $/1000 Abfragen, bei 30 Betrieben Cent-Beträge). Maps zu scrapen ist keine Option:
    gegen die Nutzungsbedingungen und technisch brüchig.
11. **Timeout am Modell-Node.** In einem Lauf meldete das Sprachmodell „Request timed out", der
    Lauf dauerte dadurch 608 statt 95 s. Abgefangen wird das sauber, aber ein Timeout wäre besser.

### Was der Ablauf über die Datenpflege verrät

Zwei Muster, die über Öffnungszeiten hinausgehen und für sich Aufmerksamkeit verdienen:

- **Leere Öffnungszeiten erscheinen im TeutoNavigator als „immer geöffnet"** — also keine Lücke,
  sondern **aktiv falsche** Information. 24 Datensätze betroffen. Das ist der stärkste Grund,
  diesen Ablauf zu haben.
- **Das Feld „Küchenzeiten" ist bei 88 % leer — und deshalb wandern Küchenzeiten ins
  Öffnungszeiten-Feld.** Gemessen über alle 1133 Datensätze: 1099 (97 %) haben strukturierte
  Öffnungszeiten, aber nur **106 (9 %)** strukturierte Küchenzeiten; bei **995 (88 %)** ist das
  Küchenfeld leer, weitere 109 haben Küchenzeiten nur als Freitext.

  Das ist kein Schlamperei-Befund, sondern eine vernünftige Reaktion auf eine Lücke: Wer weiß,
  dass Gäste vor allem „kann ich da jetzt essen?" fragen, trägt die Küchenzeit in das einzige
  Feld ein, das gefüllt wird. *Essbar im Steigenberger* zeigt beides — den Grund und den Preis:
  in `timeIntervals` steht `Mo–Sa 12:30–22:00`, also exakt die Küchenzeit, das Feld
  `kitchenTimeIntervals` ist **leer**, und weil die Küche sonntags zu hat, **fehlt der Sonntag
  im Datensatz vollständig** — obwohl der Betrieb laut eigener Webseite sonntags von 07:00 bis
  23:00 offen ist. Ebenso *Benni´s Kitchen*: `09:30` in der Datenbank, `11:00` auf der Webseite,
  und im Küchen-Freitext steht „Frühstück: 09:30-11:30".

  **Daraus wurde eine zweite Frage im Fragebogen — gebaut und live** (siehe unten). Ein Klick
  mehr für den Betrieb, und der Ablauf füllt nebenbei ein Feld, das bei 995 Betrieben leer ist.
  Damit beantwortet der Datenpool die Frage, die der Gast tatsächlich stellt.
- **Die Zusatzfrage nach der warmen Küche** — die Antwort auf den Befund darüber.

  Gefragt wird **nur dort, wo es etwas zu holen gibt**: das strukturierte Küchenfeld ist leer,
  im Freitext stehen aber Küchenzeiten. Im Lauf über 1161 Datensätze traf das auf **9 von 49
  Fällen** zu; alle anderen sehen den Fragebogen unverändert kurz. Ein Fragebogen, der länger
  wird, wird seltener ausgefüllt.

  Vier Antworten, **„Überspringen" ist vorausgewählt**: wie die Öffnungszeiten · andere Zeiten
  (mit Wochentagsfeldern) · keine warme Küche · überspringen. Freie Zeiten laufen durch dieselben
  harten Regeln wie die Öffnungszeiten.

  In `OZ-3` gilt eine **mildere** Entscheidungsregel als bei den Öffnungszeiten, weil die Angabe
  freiwillig ist: bei Uneinigkeit zählt der Gastronom, bei echtem Widerspruch bleibt das Feld
  **leer** — eine falsche Küchenzeit ist schlechter als keine. Die Quittung erwähnt sie nur, wenn
  wirklich jemand geantwortet hat.

  ⚠️ Ein Fund aus der Gegenprüfung: „Genauso wie die Öffnungszeiten" landete zunächst als
  **Prosa** in derselben Spalte wie echte Zeiten. Sagt eine Person „wie oben" und eine zweite
  tippt exakt dieselben Zeiten ein, galt das als Widerspruch — und die gewonnene Küchenzeit wurde
  verworfen. Ausgerechnet bei der wahrscheinlichsten Antwort, denn die ganze Prämisse der Frage
  ist, dass beide Zeiten oft dasselbe sind. `OZ-3` löst „wie oben" jetzt gegen die entschiedene
  Fassung auf, **bevor** verglichen wird.

- **`changed` taugt nicht als Maß für redaktionelle Pflege.** Nur 5 von 600 Datensätzen sind älter
  als 12 Monate; das Feld wird von technischen Importen mit angefasst. Der ursprünglich geplante
  Auslöser „nicht mehr aktualisiert seit 12 Monaten" hätte zehn Datensätze geprüft und wäre fertig
  gewesen. Haupt-Auslöser ist deshalb die **Abweichung selbst**.

---

## Gesamtergebnis

**Status: BEDINGT FREIGEGEBEN**

Erkennung, Normalisierung, Vergleich über drei Quellen, Fragebogen samt Zusatzfrage nach der
warmen Küche, Auswertung, Plausibilität und Entscheidung sind gebaut, validiert und gegen den
echten Datenbestand gemessen — mit 0 erfundenen Zeiten und 8 von 8 bestätigten Fällen in der
Gegenprobe von Hand. Ein Folgelauf hat gezeigt, dass **niemand zweimal gefragt wird**: 48 offene
Fälle wurden übersprungen.

Der Ablauf ist auf eine andere n8n-Instanz **übertragbar** — kein hartes ID mehr im Quelltext, der
Anlege-Pfad der Data Tables ist ausgeführt und gegen die laufende Struktur verglichen.

**Nicht freigegeben ist der Versand an echte Empfänger** (Punkte 2 bis 5) und **das Schreiben nach
destination.data** (Punkt 1). Beides ist bewusst verriegelt, nicht vergessen: Der Ablauf verschickt
heute keine Mail und ändert heute keinen Datensatz.

---
*Erstellt mit dem Hackathon-Starter · friedemann-schuetz.de*
