# destination.data — Felder & Datenlage (Gastro, Mandant `teutoburgerwald`)

Bestandsaufnahme vom **31.08.2026**. Grundlage: **alle 1132** Gastro-Datensätze, gelesen über die
öffentliche meta-Such-Schnittstelle. Diese Datei ist die Referenz für den
Öffnungszeiten-Abgleich — hier stehen die echten Feldnamen und die echte Datenlage, nicht
Annahmen.

## Der Lese-Aufruf

```
https://meta.et4.de/rest.ashx/search/?experience=teutoburgerwald&type=Gastro&template=ET2014A.json&limit=400&offset=0
```

- **Kein Lizenzschlüssel nötig** — der Pool ist öffentlich lesbar (HTTP 200)
- Paging über `limit` + `offset`; `limit=400` funktioniert zuverlässig
- Antwort: `{status, count, overallcount, items:[…]}` — `overallcount` = **1132**
- Weitere Dienste am selben Endpunkt: `/features`, `/categories`, `/keyterms` — **alle nur lesend**

## Die Felder, auf die es ankommt

| Feld | Bedeutung | Belegung |
|---|---|---|
| `id` / `global_id` | Datensatz-ID, z. B. `100071535` / `g_100071535` | 100 % |
| `timeIntervals` | **die strukturierten Öffnungszeiten** | 97 % |
| `timeIntervalExceptions` | Sonderzeiten | 0,9 % |
| `kitchenTimeIntervals` | **Küchenzeiten — nicht** Öffnungszeiten | 9,4 % |
| `deliveryTimeIntervals` | Lieferzeiten | selten |
| `texts[rel=openings]` | Öffnungszeiten als **Freitext** | häufig |
| `texts[rel=dayoff]` | Ruhetag als Freitext | häufig |
| `texts[rel=KITCHEN_ZEITEN]` | Küchenzeiten als Freitext | ~15 % |
| `seasons` | Monate, in denen der Betrieb Saison hat | meist alle 12 |
| `changed` / `created` | letzte Änderung / Anlage (ISO mit Zeitzone) | 100 % |
| `web` | Webseite des Betriebs → Quelle C | **93,4 %** |
| `email` | Mailadresse des Betriebs → Empfänger „Gastronom" | **70,5 %** |
| `addresses` | pflegende Organisation (z. B. „Teutoburger Wald Tourismus") | häufig |
| `author` | **immer leer** — 0 von 1132 | **0 %** |

### Aufbau von `timeIntervals`

```json
[{
  "weekdays": ["Wednesday","Thursday","Friday","Saturday"],
  "start": "2026-08-04T18:30:00+02:00",
  "end":   "2026-08-04T22:00:00+02:00",
  "tz":    "Europe/Berlin"
}]
```

Das **Datum ist Beiwerk** — relevant sind `weekdays` plus die Uhrzeit aus `start`/`end`.
Wochentage sind **englisch** (`Monday` … `Sunday`).

## Datenlage — alle 1132 Datensätze

| | Anzahl | Anteil |
|---|---:|---:|
| `timeIntervals` leer | 34 | 3,0 % |
| … davon **ganz ohne** Freitext (wirklich nichts da) | 10 | 0,9 % |
| … davon **mit** Freitext → strukturierbar ohne Rückfrage | 24 | 2,1 % |
| strukturiert **und** Freitext gleichzeitig → vergleichbar im Datensatz selbst | **639** | **56,4 %** |
| `changed` älter als 12 Monate | 7 | 0,6 % |
| hat `web` | 1057 | 93,4 % |
| hat `email` | 798 | 70,5 % |
| `author` gefüllt | 0 | 0,0 % |

## Fünf Befunde, die den Bau bestimmen

**1. `changed` ist kein Maß für redaktionelle Pflege.** Nur **7 von 1132** sind älter als
12 Monate. Die Verteilung zeigt technische Import-Blöcke (127 Datensätze im Mai 2026, 395 im Juli
2026), während `created` echt über 2015–2026 streut. Die 12-Monats-Regel bleibt als Auslöser, kann
aber nicht der Haupt-Auslöser sein.

Die 7 Datensätze — brauchbar als Testmenge:

| ID | changed | Titel |
|---|---|---|
| `100031521` | 2023-09-13 | Grill Athen |
| `100021669` | 2024-09-04 | Canadian Hut |
| `100006041` | 2024-09-23 | Hofbräu am Ostertor |
| `100007160` | 2024-09-23 | VitaSol Therme GmbH |
| `100004446` | 2024-09-23 | Restaurant Berghof |
| `100004448` | 2024-09-25 | Gaststätte Schöne Aussicht |
| `100046867` | 2025-06-03 | Pizza Haus am Bahnhof |

**2. Der eigentliche Hebel sind die 639 Datensätze mit Struktur *und* Freitext (56,4 %).** Dort
lässt sich ein Widerspruch **ohne jede externe Quelle** feststellen — kein Webseitenabruf, keine
Google-Kosten, kein Fehlschlag durch tote Links. Das ist die größte und billigste Fundstelle im
ganzen Pool.

**3. „Keine Öffnungszeiten" heißt meist: nicht strukturiert.** Von den 34 leeren haben 24 einen
Freitext. Beispiel `100040904` *Restaurant Waldhotel Bärenstein*: `timeIntervals` leer, aber
`openings` sagt „Täglich ab 14 Uhr … Warme Küche: Montag-Sonntag 18-21 Uhr … bis 23 Uhr geöffnet".

**4. Ein großer Teil der Freitexte ist nicht in Öffnungszeiten übersetzbar — und darf es nicht
sein.** Aus den 24 Quick-Win-Kandidaten:

| ID | `openings`-Text | Einordnung |
|---|---|---|
| `100022947` | „täglich 11:30 - 14.30 Uhr und 17.30 - 22 Uhr" | ✅ strukturierbar |
| `100023478` | „Montag 11:00-18:00 Uhr\nDienstag 11:00-18:00 Uhr…" | ✅ strukturierbar |
| `100044620` | „Montag – Freitag und Sonntag 11.00 – 13.30 Uhr und…" | ✅ strukturierbar |
| `100031263` | „Jederzeit auf Anfrage" | ⛔ keine regulären Zeiten |
| `100041663` | „Individuelle Öffnungszeiten (nur nach Absprache…)" | ⛔ keine regulären Zeiten |
| `100024581` | „Öffnungszeiten auf Anfrage…" | ⛔ keine regulären Zeiten |
| `100008215` | „von Oktober bis April geschlossen" | ⚠️ Saison, keine Wochentage |
| `100068522` | „…hat in der Sommersaison…" | ⚠️ Saison |
| `100030476` | „Ruhetage: Keine Ruhetage" | ⚠️ nur Ruhetag-Aussage |
| `100004446` | „10. Januar - 30. Oktober 2016 …" | ⚠️ **veraltet (2016)** — Fall für Rückfrage |

→ **Regel für den Bau:** Die KI muss die Kategorie **„keine regulären Öffnungszeiten ableitbar"**
ausgeben dürfen und in diesen Fällen `timeIntervals` **leer lassen**. Wird sie gezwungen, immer
Zeiten zu liefern, erfindet sie welche und schreibt Falschinformation in den Pool. „Auf Anfrage"
ist eine **gültige Aussage**, kein Fehler — solche Datensätze gehören nicht in den Prüflauf.

**5. `00:00–00:00` bedeutet „24 Stunden offen", nicht „geschlossen".** Belegt an `100016...`
*Hotel-Restaurant Sonnenhof*: `timeIntervals` enthält `Sa,So 00:00–00:00`, der `openings`-Text sagt
dazu „Samstag, Sonntag: durchgehend geöffnet". Wer das als „zu" liest, erzeugt einen Fehlalarm.

## Referenz-Datensätze für den Fehlalarm-Test

Diese drei müssen sich beim Vergleich **richtig** verhalten, sonst ist die Normalisierung nicht gut
genug und es darf keine Mail rausgehen:

| ID | Titel | Lage | Erwartung |
|---|---|---|---|
| — | Café Elise im Landhotel Annelie | `timeIntervals` Mo–So 08:00–18:00 · Text „Täglich von 8.00 bis 18.00 Uhr" | **einig**, kein Fall |
| — | Hotel-Restaurant Sonnenhof | `Sa,So 00:00–00:00` · Text „durchgehend geöffnet" | **einig**, kein Fall |
| `100040904` | Restaurant Waldhotel Bärenstein | leer · voller Freitext | **Direkt-Vorschlag**, keine Mail |
| `100031263` | Rumiz Weinzirkel | leer · „Jederzeit auf Anfrage" | **kein Fall**, nicht strukturierbar |

## Was hier nicht steht

- **Ersteller und letzter Bearbeiter** (`author` ist leer) — kommen nur aus dem
  destination.data-Backend
- **Ein Schreibweg** — die dokumentierten Dienste sind ausnahmslos lesend

---

## Messergebnis der Normalisierung (Stand 31.08.2026)

Gemessen mit `node oz-logik/testlauf.js` über alle 1132 Datensätze, nur mit
**Quelle A (`timeIntervals`) gegen Quelle B (eigener Freitext)** — ohne Webseiten-Abruf, ohne
Google, also ohne jede externe Abhängigkeit und ohne Kosten.

| | Anzahl |
|---|---:|
| vergleichbar (Struktur **und** lesbarer Freitext) | **330** |
| davon **einig** → kein Fall | 213 (64,5 %) |
| davon **Abweichung** → Fall | **117 (35,5 %)** |
| Struktur fehlt, Freitext lesbar → Direkt-Vorschlag ohne Mail | 8 |
| „auf Anfrage" / rein saisonal → bewusst **kein** Fall | 15 |
| mehrere Zeiträume im Text → bewusst **kein** Fall | 26 |
| Freitext nicht auswertbar → kein Fall | 284 |
| Struktur da, kein Freitext → nur über externe Quellen prüfbar | 459 |
| gar nichts da | 10 |

**Fehlalarm-Probe:** alle vier Referenz-Datensätze verhalten sich richtig (4/4).

**Stichprobe der 117 Abweichungen:** ganz überwiegend **echte** Unstimmigkeiten, zum Beispiel

| Datensatz | `timeIntervals` | Freitext | |
|---|---|---|---|
| WIDUkind of streetfood | Di–So 16–23, Mo zu | „donnerstags bis montags 17:00–23:00, Di+Mi Ruhetag" | Struktur ist falsch |
| Bambini Welt | Di–Fr 10–17 | „Mo–Fr 9.30–19.00" | zwei Stunden Differenz |
| L.A. Basta | täglich 12:00–00:00 | „Mo–Fr 16.30–00.00, Sa 12.30–01.00" | Struktur ist falsch |
| Pfennigskrug | Mo–Sa 16–23 | „Mo–Sa 16.00–22.00" | eine Stunde Differenz |
| Hörster Krug | So 14–22 | „Sonntag ab 11:00" | drei Stunden Differenz |

*(Nach der Dedup-Korrektur unten: 215 einig / **115** Abweichungen. Referenz-Probe weiterhin 4/4.)*

### Vier Regeln, die aus den Messungen entstanden sind

1. **Abschnittsweise zuordnen.** „Mi-Fr 14:00-19:00 Uhr Sa 11:00-20:00 Uhr" — jede Tagesgruppe
   bekommt nur die Zeiten, die ihr folgen. Vorher bekam jeder Tag alle Zeiten. Das war die größte
   Fehlalarm-Quelle.
2. **Küchen-, Buffet- und Brunchzeiten abschneiden.** Sie stehen oft im selben Freitext, sind aber
   keine Öffnungszeiten. Belegt an Pfennigskrug und Altes Kornhaus.
3. **Mehrere Zeiträume → nicht vergleichen.** Steht ein Datums- oder Monatsbereich im Text, ist
   unklar, welchen Zeitraum `timeIntervals` meint. Lieber schweigen als Fehlalarm.
4. **Uhrzeiten sind keine Datumsangaben.** „8.00 bis 18.00" sieht aus wie ein Datumsbereich. Ein
   Datum braucht darum einen abschließenden Punkt, einen Monatsnamen oder eine Jahreszahl —
   sonst fällt jeder Datensatz mit Punkt-Uhrzeiten aus dem Vergleich.

---

## Quelle C: die Betriebs-Webseiten (Messung 31.08.2026)

**1057 der 1132 Datensätze (93 %) haben eine `web`-URL.** Stichprobe: 80 Seiten, echte Abrufe,
8 gleichzeitig, 12 s Zeitlimit — der ganze Durchlauf dauert 14 Sekunden.

| Ergebnis | Anteil | Bedeutung |
|---|---:|---|
| **schema.org / JSON-LD** gefunden | 8 % | exakte Zeiten, **keine KI nötig** |
| nur **Textabschnitte** gefunden | 61 % | KI muss den Text lesen |
| Seite erreichbar, nichts zu Öffnungszeiten | 25 % | meist per JavaScript nachgeladen |
| nicht erreichbar | 6 % | tote Domain, 404, Zertifikat, Timeout |

Die ursprüngliche Hoffnung, dass Gastro-Seiten ihre Zeiten überwiegend maschinenlesbar
ausliefern, hat sich **nicht bestätigt** — 8 % ist wenig. Der Hauptweg ist die KI-Auswertung
von Textabschnitten.

**Unterseiten verfolgen lohnt sich.** Findet die Startseite nichts, werden bis zu zwei passende
interne Links nachgeladen (Öffnungszeiten > Zeiten/Reservierung > Kontakt/Anfahrt). Das holte in
der Stichprobe 5 von 25 Seiten aus „nichts gefunden" heraus.

**Nur die Fundstellen an die KI geben, nicht die ganze Seite.** `textKandidaten()` liefert bis zu
drei Abschnitte à 600 Zeichen rund um Stichworte wie „Öffnungszeiten", „Ruhetag", „geöffnet".
Das hält den KI-Aufruf klein und billig.

### ⚠️ Kodierungs-Falle: `00:00–00:00` heißt je Quelle das Gegenteil

| Quelle | `00:00`–`00:00` bedeutet | Beleg |
|---|---|---|
| **destination.data** | **24 Stunden offen** | Hotel-Restaurant Sonnenhof: `Sa,So 00:00–00:00`, Freitext „durchgehend geöffnet" |
| **schema.org / JSON-LD** | **geschlossen** | `100043526` Eiscafé Alte Kantorei: `{"dayOfWeek":["Monday","Thursday"],"opens":"00:00","closes":"00:00"}` — destination.data führt Mo und Do als Ruhetage |

Verwechselt man das, meldet der Abgleich für **jeden Ruhetag** einen Widerspruch. Bei schema.org
steht `00:00–23:59` für durchgehend offen. Ein `openingHoursSpecification` mit `validFrom` /
`validThrough` gilt nur für einen Zeitraum und wird übersprungen — dieselbe Regel wie bei
saisonalen Freitexten.

### Datenfehler in destination.data: doppelte `timeIntervals`

Datensatz `100023841` (Chicago Burger & Drinks) enthält **sieben** Einträge in `timeIntervals`,
darunter viermal identisch `Mi/Do/So 17:30–21:00` und zweimal `Fr/Sa 17:30–22:00`. Ohne
Entdopplung liest der Vergleich `17:30–21:00, 17:30–21:00, 17:30–21:00, 17:30–21:00` und meldet
einen Widerspruch, wo keiner ist. `ergaenze()` verwirft deshalb identische Intervalle.

→ Das ist ein **eigenständiges Datenqualitäts-Thema** im Pool, unabhängig von den
Öffnungszeiten: es lohnt sich, den ganzen Bestand einmal auf doppelte `timeIntervals` zu prüfen.

### Dateien

| Datei | Zweck |
|---|---|
| [oz-logik/normalisieren.js](../oz-logik/normalisieren.js) | Quelle A + B: `timeIntervals` und Freitext in ein Format, Vergleich |
| [oz-logik/webseite.js](../oz-logik/webseite.js) | Quelle C: Seite holen, JSON-LD lesen, Textabschnitte finden, Unterseiten verfolgen |
| [oz-logik/testlauf.js](../oz-logik/testlauf.js) | misst die Fehlalarm-Quote über alle 1132 |
| [oz-logik/webseiten-test.js](../oz-logik/webseiten-test.js) | misst die Ausbeute der Webseiten |
| [oz-logik/testfaelle-webtext.json](../oz-logik/testfaelle-webtext.json) | 8 echte Webseitentexte als feste Testfälle |

## KI-Auswertung der Webseitentexte — getestet (31.08.2026)

Weil dieser Schritt später unbeaufsichtigt Öffnungszeiten in die Produktivdaten schreiben soll,
wurde er vor dem Bauen geprüft: 8 echte Webseitentexte aus dem Pool, eine KI liest sie aus, eine
**zweite, unabhängige KI prüft jede Extraktion gegen den Rohtext** — mit dem Auftrag, sie zu
widerlegen.

| | |
|---|---:|
| geprüft | 8 |
| als treue Wiedergabe bestätigt | **8** |
| erfundene Zeiten | **0** |
| Küchenzeiten als Öffnungszeiten übernommen | **0** |
| vertauschte Wochentage | **0** |

Zwei Verhaltensweisen sind dabei belegt worden:

- **Sie hält sich zurück, wenn sie soll.** *Deutsches Haus*: drei widersprüchliche Zeitblöcke auf
  einer Seite (Werktagsstart 10:30 vs. 17 Uhr — offenbar mehrere Betriebe an einer Adresse)
  → `ableitbar=false`. Ein Fall für die Rückfrage, nicht für eine automatische Korrektur.
- **Die naheliegende Falle wurde nicht getreten.** *Hotel Restaurant Hollmann*: „Mo bis Sa ab
  17 Uhr – Mittagstisch: Di bis Fr 12–13:30" → der Mittagsblock landete **nur** auf Di–Fr, nicht
  auf Mo und Sa.

Eine berechtigte Beanstandung führte zu einer schärferen Regel: **„Mittagstisch" ist eine
Öffnungszeit** (mittags ist der Betrieb offen), *warme Küche · Küchenpause · Buffet · Brunch ·
Frühstück* sind es nicht.

Getesteter Prompt und Ausgabeschema: [oz-logik/ki-prompt-webseitentext.md](../oz-logik/ki-prompt-webseitentext.md).

## Der Code im n8n Code Node

n8n Code Nodes können keine lokalen Dateien einbinden. `node oz-logik/baue-n8n-bundle.js`
erzeugt daher aus `normalisieren.js` + `webseite.js` eine einzelne Kopiervorlage
`oz-logik/dist/n8n-oz-code.js` (~31 kB) samt Verwendungsbeispiel. Quelle der Wahrheit bleiben
die Einzeldateien.

Der Bau bricht ab, wenn beide Dateien denselben Namen auf oberster Ebene deklarieren — im Code
Node teilen sie sich **einen** Namensraum. Das ist kein theoretischer Fall: beide hatten zuerst
ein `hhmm`, einmal Minuten → `"HH:MM"`, einmal umgekehrt. Beim Zusammenfügen gewann die zweite
Fassung, und `alsText()` lieferte `null–null`. Die eingebaute Gegenprobe hat es sofort gefangen.

---

## Die Gästeansicht: TeutoNavigator (geprüft 01.09.2026)

Der Pool `teutoburgerwald` wird öffentlich im **TeutoNavigator** ausgespielt:
<https://www.teutonavigator.de/de/teutonavigator/wlan/search/Gastro/view:gallery/>

Dieselben Datensätze, dieselben IDs. Damit ist sichtbar, was ein Datenfehler beim Gast anrichtet.

### Link-Muster — direkt aus dem Datensatz baubar

```
https://www.teutonavigator.de/de/teutonavigator/wlan/detail/Gastro/{global_id}/{slug}
```

- `{global_id}` ist genau das Feld aus der Schnittstelle, z. B. `g_100040904`
- `{slug}` ist **beliebig**, darf aber nicht leer sein — `…/g_100040904/x` liefert 200,
  `…/g_100040904/` und `…/g_100040904` liefern 404
- Umgesetzt als `oeffentlicherLink(datensatz)` in
  [normalisieren.js](../oz-logik/normalisieren.js); erzeugte Links gegen die echte Seite geprüft
  (3/3 → HTTP 200, identisch zu den Links der Seite selbst)

Dieser Link ist für die Anfrage-Mail **wertvoller als ein Backend-Link**: der Gastronom kann ihn
öffnen, und er zeigt unmittelbar, was auf dem Spiel steht.

### ⚠️ Leere `timeIntervals` werden öffentlich als „immer geöffnet" angezeigt

Nicht als „keine Angabe" — als **immer offen**. Geprüft an fünf Datensätzen mit leerem
`timeIntervals`, alle fünf zeigen denselben Status:

| ID | Betrieb | Status im Portal | tatsächlich laut eigenem Freitext |
|---|---|---|---|
| `100040904` | Restaurant Waldhotel Bärenstein | **immer geöffnet** | „Täglich ab 14 Uhr" |
| `100031263` | Rumiz Weinzirkel | **immer geöffnet** | „Jederzeit auf Anfrage" |
| `100044621` | Landgasthof Potthoff | **immer geöffnet** | „Mo, Do, Fr ab 17.30" |
| `100022947` | Die Knolle – das urige Kartoffelhaus | **immer geöffnet** | „täglich 11:30–14:30 und 17:30–22" |
| `100023478` | Hotel-Café Schauinsland | **immer geöffnet** | „Montag 11:00–18:00 …" |

*(Bei saisonal beschränkten Einträgen wie `100008215` Parkscheune zeigt das Portal gar keinen
Status.)*

**Ein weiterer Fall derselben Sorte:** `100030626` Hotel Restaurant Hollmann zeigt dem Gast
„geschlossen (**12:00–13:30** Uhr)". Das sind die **Mittagstisch**-Zeiten — der Abendbetrieb
(„Mo bis Sa ab 17 Uhr" laut eigener Webseite) fehlt in destination.data komplett.

### Was das für die Priorisierung bedeutet

Die **34 Datensätze mit leerem `timeIntervals`** sind damit keine Randnotiz von 3 %, sondern der
**dringlichste Posten**: sie veröffentlichen aktiv falsche Information. Ein Gast, der um 10 Uhr
vor der verschlossenen Tür steht, hat sich auf „immer geöffnet" verlassen.

- **8** davon lassen sich aus dem eigenen Freitext des Datensatzes strukturieren — sofort, ohne
  jemanden anzuschreiben
- **13** sagen „auf Anfrage" o. Ä. — dort ist „immer geöffnet" trotzdem falsch, aber die richtige
  Angabe kann nur der Betrieb liefern → Anfrage
- **10** haben gar keine Angabe → Anfrage

---

## Der Backend-Export — er löst beide offenen Punkte (01.09.2026)

Ein Export aus dem destination.data-Backend (`PAGES-PrintOnDemand_*.xlsx`, 1450 Gastro-Zeilen)
liefert genau das, was die öffentliche Schnittstelle **nicht** hat.

| Spalte | Belegung | wofür |
|---|---:|---|
| `Id` | 100 % | Verknüpfung mit der Schnittstelle — 1130 der 1132 Datensätze zuordenbar |
| `Erstellt durch` | **100 %** | Empfänger „Ersteller" — 129 verschiedene Personen |
| `Letzte Änderung durch` | **100 %** | Empfänger „letzter Bearbeiter" — 93 verschiedene Personen |
| `Letzte Änderung` | 99,9 % | **das echte Redaktionsdatum** |
| `Erstellt` | 100 % | Untergrenze, wenn zuletzt nur ein technisches Konto dran war |
| `E-Mail` | 6 % | unbrauchbar — die Betriebs-Mail kommt aus der Schnittstelle (70 %) |

### Das API-Feld `changed` ist als Pflegedatum wertlos — der Export ist es nicht

Bei **990 von 1130** Datensätzen weichen beide Datumsangaben um mehr als 36 Stunden ab.
Beispiel `100045891`: die Schnittstelle meldet „geändert 2026-07-28", der Export sagt
„19.11.2025, durch `import-nrw`".

Die Trennung gelingt über den **Bearbeiter**: technische Konten haben keine Mailadresse.
Gefunden wurden u. a. `one.intelligence` (400 Datensätze als letzter Bearbeiter),
`import_user_<kommune>` (37 verschiedene), `import-nrw`, `import-teutoburger-wald`, `DeepL`.

### Damit funktioniert die 12-Monats-Regel — deine ursprüngliche Idee war richtig

| Grundlage | Fundmenge |
|---|---:|
| API-Feld `changed` älter als 12 Monate | **7** |
| Export: letzte **menschliche** Pflege älter als 12 Monate | **437** |
| … älter als 24 Monate | 287 |
| … älter als 36 Monate | 212 |
| Datensätze **ohne jeden menschlichen Kontakt** (nur technische Konten) | 207 |

Jahr der letzten menschlichen Änderung: 2016:1 · 2018:4 · 2022:24 · 2023:22 · 2024:87 ·
2025:249 · 2026:598.

Die Regel war nie das Problem — nur das Feld. Umgesetzt in
[zustaendige.js](../oz-logik/zustaendige.js) (liest das xlsx ohne Fremdbibliothek).

### Empfänger-Regel

1. **Gastronom**: `email` aus der Schnittstelle (70 % der Datensätze)
2. **Letzter Bearbeiter**: `Letzte Änderung durch` — **nur wenn es ein Mensch ist**
3. **Ersteller**: `Erstellt durch`, wenn abweichend und ein Mensch
4. Fällt niemand an (203 Fälle), geht die Anfrage an die **Regionsredaktion**

## Die Arbeitsliste

[arbeitsliste.js](../oz-logik/arbeitsliste.js) führt beide Quellen zusammen und erzeugt, was
`OZ-1 Prüflauf` später ausgibt:

| Prio | Fälle | Grund | Weg |
|---:|---:|---|---|
| **1** | **34** | leer → öffentlich **„immer geöffnet"** | 6 ohne Rückfrage · 2 zur Prüfung · 26 Anfrage |
| **2** | **115** | widerspricht dem eigenen Freitext | 115 Anfrage |
| **3** | **472** | seit über 12 Monaten kein Mensch dran | **keine Mail** — erst Webseite prüfen |
| | **621** | von 1132 | **305 Mails** |

**Warum Priorität 3 keine Mail auslöst:** Dort ist *kein Fehler bekannt*, nur Alter. Es gibt keine
zweite Fassung zum Ankreuzen — die Mail wäre das „pflegt mal eure Daten", das niemand liest.
Ohne diese Regel wären es **1130** Mails statt 305. Diese Fälle laufen zuerst gegen die
Betriebs-Webseite; findet sich dort ein Widerspruch, werden sie zu Priorität 2 **mit** konkreter
Frage.

**Vorschläge werden vor der Übernahme geprüft.** Hat ein Tag überlappende oder mehr als zwei
Zeitspannen, hat der Freitext-Parser Zeiten vermischt — belegt an `100044620` (Haus Hagemeyer):
„Do 11:00–13:30, 11:30–13:30, ab 17:00, 18:00–20:30". Solche Vorschläge gehen an einen Menschen,
nicht in die Datenbank. Von 8 Direkt-Vorschlägen bleiben so 6 automatisch übernehmbar.

### Datenschutz

Export und erzeugte Tabellen enthalten dienstliche Mailadressen von Kolleg:innen. Sie liegen
unter `oz-logik/daten/` und sind zusammen mit `PAGES-PrintOnDemand_*.xlsx` per `.gitignore` vom
Repo ausgeschlossen — das Frontend wird über ein GitHub-Repo veröffentlicht. Im Hackathon gehen
Mails ausschließlich an eigene Adressen.

---

## Der Schreibweg — gefunden (01.09.2026)

In der n8n-Instanz `n8n.oi.destination.one` ist ein **eigener Community-Node** installiert:
`CUSTOM.destinationData`, typeVersion 1 — in 21 von 24 vorhandenen Workflows im Einsatz. Er kann
lesen **und schreiben**. Damit ist der letzte offene Punkt des Vorhabens gelöst; die öffentlichen
`rest.ashx`-Dienste bleiben nur lesend, der Weg führt über diesen Node.

### Die drei Operationen

```jsonc
// 1. Suchen
{ "resource": "search", "type": "Poi", "experience": "572",
  "schema": { "value": "gl:Default" },        // gl:* liefert auch nicht zugewiesene Objekte
  "q": "_Name:*Churpfalzpark*" }

// 2. Objekt holen
{ "resource": "quickedit", "type": "Poi", "id": "={{ $json._ObjectId }}",
  "experience": "572", "schema": { "value": "minimal" } }

// 3. Felder schreiben
{ "resource": "quickedit", "operation": "quickedit-update-object-from-field-list",
  "type": "Poi", "id": "={{ $json._id }}", "experience": "572",
  "schema": { "value": "minimal" },
  "changesUi": { "changesValues": [
    { "field": "PRICE_CHILD", "value": "10" },
    { "field": "OBJECT_TEXT_TEASER_SOMMER_HTML", "value": "Hallo", "mode": "set-lang:de-DE" }
  ] } }
```

`mode: "set-lang:de-DE"` überschreibt in mehrsprachigen Feldern nur eine Sprache. Die Nodes
tragen **keine eigenen Credentials** — die Anmeldung kommt aus der Instanz-Konfiguration.

### ⚠️ quickedit benutzt interne Feldnamen, nicht `timeIntervals`

Geschrieben wird über Feld-Codes wie `PRICE_CHILD`, `OBJECT_TEXT_TEASER_SOMMER_HTML`,
`OBJECT_CONTACT_WEBSEITE1`, `DETAILS_INFOTEXT` — **nicht** über die `timeIntervals`-Struktur der
Lese-Schnittstelle. Der Weg von unserem Normalformat zum Schreibformat ist damit noch nicht
bekannt.

### In der Instanz vorhandene Werte

| | gefunden |
|---|---|
| `experience` | `572` (12×), `20844` (6×), `18738` (1×) — **keiner davon nachweislich teutoburgerwald** |
| `type` | `Poi` (14×), `Veranstaltung` (6×) — **`Gastro` noch nie verwendet** |
| `schema` | `minimal`, `gl:Default`, `hackathon-nrw` |

### Drei Dinge, die noch fehlen

1. **Die `experience`-Nummer für `teutoburgerwald`.** Die Lese-Schnittstelle nimmt den Namen, der
   Node eine Zahl.
2. **Ein quickedit-Schema, das die Öffnungszeit-Felder für Gastro freigibt.** Laut Sticky Note im
   Referenz-Workflow: *„Felder müssen für diese API global (z. B. `minimal`) oder
   kundenspezifisch (z. B. `open-data-nrw`) freigegeben werden."* Sind die Öffnungszeiten nicht
   freigegeben, ist das eine **Konfigurationsaufgabe in destination.data**, kein Code-Problem.
3. **Der Feldname der Öffnungszeiten in quickedit.** Ermittelbar, indem man die
   quickedit-GET-Operation für einen Gastro-Datensatz **ohne** „Select Fields" ausführt — dann
   listet sie die verfügbaren Spalten (ebenfalls aus den Sticky Notes des Referenz-Workflows).

### Referenz-Workflows in der Instanz

| ID | Name |
|---|---|
| `gdpLl4jiL3UIPrFp` | Lesen/Schreiben in one.data — die sauberste Vorlage (suchen · holen · schreiben) |
| `GbcICEJNEQ9v56J4` | Veranstaltung in one.data anlegen oder aktualisieren (aktiv, mit Dublettenprüfung) |
| `fCXK1xaOouuk4sQC` | one.data: Veranstaltung schreiben (Sub-Workflow) — Muster für `oz-schreiben` |

---

## Probe am `CUSTOM.destinationData`-Node (01.09.2026)

Mit einem Wegwerf-Workflow (nur lesend, danach gelöscht) wurde geprüft, wie weit der Schreibweg
trägt. Ergebnis in einem Satz: **die Suche funktioniert, quickedit ist durch Rechte gesperrt.**

### Credential

Der Node braucht `destinationOneIdOAuth2Api`. In der Instanz vorhanden:
`76y7pqqjt8V60jfE` — „id.destination.one SSO account 38". Dasselbe Credential nutzen die
aktiven one.data-Workflows. Im Workflow-JSON der Public API ist das Feld `credentials` bei
manchen Nodes `null`, bei anderen gefüllt — nicht darauf verlassen, sondern in einem **aktiven**
Workflow nachsehen.

⚠️ Es ist ein **persönliches SSO-Konto**. Alle Änderungen würden darauf gebucht — für einen
automatischen Ablauf die falsche Identität (siehe „Zugang & Anmeldung" im Bauplan).

### Was funktioniert: `resource: search`

```jsonc
{ "resource": "search", "type": "Gastro", "experience": "572",
  "schema": { "value": "gl:Default" }, "q": "", "limit": 3 }
```

Und das Suchschema liefert **genau die Metadaten, die wir mühsam aus dem xlsx-Export geholt
haben**:

| Feld | Bedeutung |
|---|---|
| `_ObjectId` / `GastroId` | Datensatz-ID — **identisch**, gleiche Nummerierung wie die Lese-API |
| `LastChange` / `LastChangeByUser` | letzte Änderung **und wer sie gemacht hat** |
| `Created` / `CreatedByUser` | Anlage und Ersteller |
| `_InExperience` | ist das Objekt der Experience zugewiesen? |
| `OBJECT_CONTACT_EMAIL`, `Telefon`, `Ort`, `PLZ`, `Strasse`, `_PagesUrl` | Kontakt und Adresse |
| `HasRecs`, `HasKitchenRecs` | hat der Datensatz Öffnungs- bzw. Küchenzeiten? |

→ **Der Excel-Export ist damit ersetzbar.** `zustaendige.js` kann später durch einen
Suchaufruf ersetzt werden; die Zwischenlösung bleibt gültig, ist aber nicht mehr nötig, sobald
die Suche im Workflow steht. `HasRecs` ist zusätzlich ein billiger Vorfilter für Priorität 1.

**Öffnungszeit-Felder sind im Suchschema nicht enthalten** — die liegen im quickedit-Schema.

### Drei Fallstricke bei `q`

1. **Keine Wildcards bei Gastro.** `_Name:*Bärenstein*` scheitert mit *„Ein CONTAINS- oder
   FREETEXT-Prädikat kann für das Objekt Gastro nicht verwendet werden, da keine
   Volltextindizierung vorliegt."* Bei `Poi` geht es (der Referenz-Workflow nutzt genau das).
2. **`_Id` existiert nicht** — *„Unbekanntes Suchfeld:_Id"*. Der Feldname ist `_ObjectId`
   bzw. `GastroId`.
3. **Suche nach ID hat trotzdem nichts geliefert** — auch `_ObjectId:<bekannte ID aus dem
   Ergebnis>` ergab 0 Treffer, ohne Fehler. Die richtige Schreibweise für einen Gleichheits-
   Vergleich ist noch offen. Praktischer Ausweg: ohne `q` über `limit`/`offset` blättern und
   lokal filtern — genau das tut `OZ-1` bereits.

### `experience` filtert bei `gl:*`-Schemas nicht

Die drei in der Instanz vorkommenden Nummern (`572`, `20844`, `18738`) liefern für
`type: Gastro` **dieselben** Datensätze — und zwar Harz-Betriebe (Bad Harzburg), nicht
Teutoburger Wald. Das deckt sich mit der Sticky Note im Referenz-Workflow: *„Um nicht nur der
Experience zugewiesene Objekte zu erhalten eins der `gl:*` Search Schemas verwenden."* Für eine
auf teutoburgerwald begrenzte Suche braucht es ein **nicht-`gl:`-Schema** und die richtige
Experience-Nummer — oder man filtert über `_InExperience`.

### 🔴 Was blockiert: `resource: quickedit`

```
Authorization failed - please check your credentials
```

Bei **allen drei** Schemas (`minimal`, `gl:Default`, `open-data-nrw`), mit demselben Credential,
mit dem die Suche funktioniert. Es ist also kein Konfigurationsfehler im Node, sondern eine
**Rechtefrage**.

### Was jetzt gebraucht wird

1. **quickedit-Recht** für den ausführenden Account auf `type: Gastro` — bevorzugt für einen
   technischen Benutzer, nicht für ein persönliches SSO-Konto.
2. **Ein quickedit-Schema, das die Öffnungszeit-Felder freigibt.** Erst danach lässt sich der
   Feldname ermitteln (quickedit-GET ohne „Select Fields" listet die Spalten).
3. *(nicht blockierend)* Die `experience`-Nummer für `teutoburgerwald` und die korrekte
   `q`-Schreibweise für einen ID-Vergleich.

Bis dahin bleibt `oz-schreiben` der austauschbare Baustein: `OZ-1` erzeugt die geprüfte
Arbeitsliste, die Übernahme geschieht bis zur Freigabe über die Oberfläche.

### Nachtrag: `experience` für teutoburgerwald ist **18395** (01.09.2026)

Damit erneut geprüft — quickedit bleibt gesperrt:

| Versuch | Ergebnis |
|---|---|
| `quickedit`, experience **18395**, schema `minimal` | 🔴 `Authorization failed - please check your credentials` |
| `quickedit`, experience **18395**, schema `open-data-nrw` | 🔴 `Authorization failed` |
| `quickedit`, experience 572, alle drei Schemas | 🔴 `Authorization failed` |
| `search`, experience 18395, schema `gl:Default` | ✅ funktioniert |

**Der Befund ist damit doppelt belegt und nicht experience-abhängig: dem Konto
„id.destination.one SSO account 38" fehlt das quickedit-Recht.** Das ist keine Frage der
Konfiguration im Node und auch nicht der Experience-Nummer — es braucht eine Rechtevergabe.

### Weitere Erkenntnisse zur Abfragesprache

- **`minimal` und `open-data-nrw` sind quickedit-Schemas, keine Such-Schemas.** In der Suche
  eingesetzt: `XsdSearchSchema configuration error: no search:config element found`. Die
  Schema-Auswahl ist im Node dieselbe Liste, die beiden Ressourcen brauchen aber
  unterschiedliche Schema-Typen.
- **`_InExperience` ist ein Integer, kein Boolean.** `_InExperience:true` →
  `Fehler beim Konvertieren des nvarchar-Werts "true" in den int-Datentyp`.
- **`_InExperience:1` liefert dennoch 0 Treffer**, ebenso `GastroId:<id>` und
  `_ObjectId:<id>` — die Gleichheits-Schreibweise der Abfragesprache ist weiter unklar. Eine
  auf teutoburgerwald begrenzte Suche gelang nicht; `gl:Default` liefert unabhängig von der
  `experience` immer denselben globalen Bestand (in der Stichprobe Harz-Betriebe).

**Für `OZ-1` ist das ohne Belang:** der Prüflauf liest über die öffentliche
meta-Schnittstelle, und die ist über `experience=teutoburgerwald` bereits richtig begrenzt.
Relevant wäre die Suche nur, um den Excel-Export durch einen Live-Aufruf zu ersetzen
(`LastChangeByUser` & Co.) — ein Komfortgewinn, kein Blocker.

---

## Der Ad-hoc-Bearbeitungslink — der Weg um die fehlenden Rechte herum

destination.data kann pro Datensatz einen **zeitlich begrenzten Bearbeitungslink** erzeugen und
per Mail verschicken:

```
https://data.destination.one/OpenObject.aspx?ah=<Token>
```

Aus der Beispielmail: *„Es steht ein Bearbeitungslink für Gastro Eiscafé Venezia für die
Experience Teutoburger Wald bereit … erstellt von … und ist bis 15.09.2026 verwendbar."* Also
rund **zwei Wochen** gültig, an einen Datensatz gebunden, ohne Anmeldung nutzbar.

### Entscheidung: der Link geht an **niemanden** — ein einziger Rückmeldeweg

Zwischenzeitlich war geplant, Ersteller und letztem Bearbeiter den Link mitzuschicken (sie kennen
destination.data ja). **Verworfen**, aus drei Gründen:

1. **Ein Token im Browser.** Stünde der Link im Fragebogen, müsste der Webhook ihn an den Browser
   ausliefern — dann liegt er im Netzwerk-Tab, auch wenn die Seite ihn nicht anzeigt.
2. **Zwei Wege, zwei Wahrheiten.** Wer direkt in der Oberfläche editiert, umgeht die
   Plausibilitätsprüfung und die Nachvollziehbarkeit. Der Fragebogen protokolliert, wer was
   bestätigt hat; ein Direkt-Edit nicht.
3. **Es ist kein Fortschritt.** Der Link muss ohnehin **von Hand pro Datensatz** erzeugt werden.
   Bei 621 Fällen ist das keine Automatisierung.

**Alle** Rückmeldungen laufen deshalb über den Fragebogen — Gastronom und Touristiker:innen
gleichermaßen. Ein Weg, eine Prüfung, ein Protokoll, kein Token im Browser.

Der Ad-hoc-Link bleibt damit ein **manueller Notweg für Einzelfälle**, nicht Teil des Ablaufs.

### ⚠️ Der Link ist selbst ein Zugangsmittel

Wer ihn hat, darf den Datensatz ändern — bis zum Ablaufdatum, ohne Anmeldung. Folgen für den Bau:

- **Nie in einer URL** (kein Query-Parameter), nie in einer Fehlermeldung, nie im Log
- **Nur an die hinterlegte Adresse** schicken, nicht an eine aus einer Antwort übernommene
- **Erst beim Versand erzeugen**, nicht im Prüflauf auf Vorrat — sonst ist er abgelaufen, bevor
  die Mail rausgeht. Die Fragebogen-Frist (7 Tage) liegt bewusst innerhalb der Gültigkeit
- In `oz_faelle` stehen dafür `bearbeitungslink` und `bearbeitungslink_gueltig_bis`; `OZ-1`
  lässt beide **leer**
- Auf der Fragebogen-Seite steht ein Hinweis „bitte nicht weitergeben" direkt am Link

### Umgesetzt

- `oz_faelle` neu angelegt mit `bearbeitungslink` und `bearbeitungslink_gueltig_bis`
  (ID **`ZqtInTqjOEJBFtba`**). Die Spalten bleiben — aber nur für die **interne**
  Änderungsliste der Redaktion, nie für den Fragebogen-Webhook.
- Im Frontend gibt es das Feld **gar nicht mehr**: kein `bearbeitungslink` im Typ `FallDaten`,
  keine Anzeige. Geprüft — `OpenObject.aspx` kommt im ausgelieferten HTML nicht vor.
- `/fragebogen?token=demo&rolle=gastronom` bleibt als Schalter, um die rollenabhängige Anrede
  zu zeigen.
- Die Sticky Notes stehen jetzt im Bau-Skript, nicht nur in der Instanz

### Offen

**Lässt sich der Link programmatisch erzeugen?** In der Oberfläche geht es per JavaScript pro
Datensatz. Für `OZ-3` wäre nötig: ein Aufruf, der für eine Datensatz-ID einen Link zurückgibt
(oder ihn direkt an eine Adresse schickt). Ist das nur ein Knopf in der Oberfläche, bleibt der
Schritt manuell — dann liefert die Arbeitsliste die Reihenfolge und den Direktlink, und die
Redaktion erzeugt die Links selbst.

---

## `OZ-2 Antwort` — gebaut und Ende-zu-Ende geprüft (01.09.2026)

Workflow-ID **`XwJ1UamqGydGsJjE`**, 15 Nodes + 3 Sticky Notes, **aktiv** (die Webhooks müssen
erreichbar sein). Erzeugt aus [oz-logik/baue-oz2-workflow.js](../oz-logik/baue-oz2-workflow.js).

```
GET  /webhook/oz-fragebogen          → liefert den Fall zu einem Token
POST /webhook/oz-fragebogen-antwort  → nimmt die Rückmeldung entgegen
```

### Geprüfte Fälle

| Fall | Ergebnis |
|---|---|
| Laden mit gültigem, offenem Token | ✅ Betrieb, Ort, beide Fassungen, Frist, Rolle |
| Laden mit bereits beantwortetem Token | ✅ `status: beantwortet` |
| Laden mit erfundenem Token | ✅ nur `{ status: "unbekannt" }` |
| Laden ohne Token | ✅ nur `{ status: "unbekannt" }` |
| Antwort mit unmöglichen Zeiten (`22:00–22:00`) | ✅ abgelehnt, mit Begründung — **Token bleibt gültig** |
| Derselbe Token, korrigierte Eingabe | ✅ angenommen |
| Derselbe Token zum dritten Mal | ✅ verbraucht, abgelehnt |
| Anderer Token, Fassung angekreuzt | ✅ gespeichert |
| Erfundener Token | ✅ abgelehnt |
| **Ende-zu-Ende über die echte Seite** | ✅ Browser → Webhook → Data Table, `auswahl: "B"` |

Dass eine **abgelehnte Eingabe den Token nicht verbraucht**, ist Absicht: die Person soll
korrigieren können, statt aus dem Vorgang zu fallen.

### Was gespeichert wird

Freie Eingaben werden **normalisiert** abgelegt — in derselben Schreibweise wie `variante_a/b/c`,
damit `OZ-3` sie direkt vergleichen kann:

```
Mo geschlossen · Di 09:00–12:00, 14:00–18:00 · Mi unbekannt · Do unbekannt
· Fr 20:00–02:00 (Folgetag) · Sa unbekannt · So unbekannt
```

### Eine Regel, eine Fassung

`pruefeEingabe()` in [normalisieren.js](../oz-logik/normalisieren.js) ist **verbindlich**; der
gleichlautende Check in `frontend-starter/app/fragebogen/typen.ts` dient nur der sofortigen
Rückmeldung im Browser. Wer die Regeln ändert, ändert sie in `normalisieren.js`.

Dazu neu: `wocheAusText()` als Umkehrung von `wocheAlsText()` — die Data Table speichert die
Fassungen als lesbaren Text für die Redaktion, die Seite braucht sie pro Wochentag. Beide
Richtungen stehen in derselben Datei und können nicht auseinanderlaufen.

### Security-Check: 9/9

Kein Key in Parametern, keine Credentials nötig, kein Bearbeitungslink in der Antwort, keine
echten Adressen, Fehlerantwort ohne Details, Token-Prüfung auf `status = offen`, Token-Suche auf
`limit 1` begrenzt.

Die Webhooks sind **öffentlich erreichbar** — das ist so gewollt und wird über die
Einmal-Tokens abgesichert. Ohne gültiges Token gibt es keinerlei Auskunft.

### Testdaten in der Instanz

`oz_faelle` (**`ZqtInTqjOEJBFtba`**) enthält zwei echte Fälle: `100022794` Café Hölter (Prio 2,
Widerspruch) und `100040904` Waldhotel Bärenstein (Prio 1, Direkt-Vorschlag). In `oz_antworten`
liegen vier Tokens, alle mit Platzhalter-Adressen `@example.invalid`.

Die drei Antworten zu Café Hölter widersprechen sich (`eigene` / `B` / `A`) — brauchbares
Material für die Entscheidungslogik in `OZ-3`.

---

## `OZ-3 Entscheiden & Abschließen` — gebaut und an 8 Szenarien geprüft (01.09.2026)

Workflow-ID **`lRQBhtog2no1SeHz`**, 7 Nodes + 3 Sticky Notes, **inaktiv** (läuft nicht von
selbst). Erzeugt aus [oz-logik/baue-oz3-workflow.js](../oz-logik/baue-oz3-workflow.js).

Liest `oz_faelle` und `oz_antworten`, entscheidet nach Konsens-Regeln, schreibt nach
`oz_ergebnisse` und setzt den Endstatus im Fall.

### Warum hier Text gegen Text verglichen wird

`OZ-2` legt **jede** Rückmeldung in derselben Schreibweise ab wie die Fassungen aus der Datenbank
(`Mo geschlossen · Di 08:00–18:30 · …`) — auch eine freie Eingabe wird vorher normalisiert. Zwei
gleiche Aussagen ergeben deshalb denselben Text, und der Konsens lässt sich durch Gruppieren
feststellen, ohne die Zeiten erneut zu parsen. Der Code-Node braucht die
Normalisierungs-Bibliothek gar nicht.

### Alle Entscheidungsregeln geprüft

| Szenario | Konfidenz | Endstatus | |
|---|---|---|---|
| alle Beteiligten einig | hoch | `entschieden` | ✅ |
| 2 von 3 geantwortet, einig | mittel | `entschieden` | ✅ |
| Widerspruch, Gastronom dabei → **Gastronom gewinnt** | mittel | `entschieden` | ✅ |
| Widerspruch ohne Gastronom, Mehrheit | mittel | `entschieden` | ✅ |
| Widerspruch ohne Gastronom, Patt | keine | `eskalation` | ✅ |
| niemand geantwortet, Frist abgelaufen | keine | `unbeantwortet` | ✅ |
| Konsens bestätigt den bestehenden Eintrag | hoch | `bestaetigt` | ✅ |
| **mehrere Rückmeldungen aus dem Betrieb widersprechen sich** | keine | `eskalation` | ✅ |

Die letzte Regel ist beim Testen entstanden: durch den Ende-zu-Ende-Test lagen zwei
Gastronomen-Antworten für Café Hölter vor, die sich widersprachen — und der Code nahm still die
erste. Jetzt eskaliert er stattdessen. Ohne den Testlauf wäre das nicht aufgefallen.

Zwei weitere „Fehlschläge" beim Prüfen waren **Fehler im Testaufbau**, nicht im Code: die
Antworten wählten die Fassung, die schon in der Datenbank stand — also griff korrekt die Regel
„bestätigt den bestehenden Eintrag". Erst mit einer abweichenden Fassung zeigten sich „2 von 3"
und „Mehrheit" als eigenständige Ergebnisse.

### Zwei bewusste Zurückhaltungen

- **Solange die Frist läuft und Rückmeldungen fehlen, wird nicht entschieden.** Der Fall bleibt
  liegen und kommt beim nächsten Lauf wieder.
- **Kein Dauer-Nachfassen.** Antwortet niemand, gibt es eine Erinnerung — danach Status
  `unbeantwortet` und Ruhe. Sonst wird der Ablauf zum Spam-Absender.

### Endstatus im Fall

`entschieden` · `bestaetigt` (Daten waren richtig, nichts zu ändern) · `eskalation` (ein Mensch
muss ran) · `unbeantwortet`

### Security-Check

Inaktiv, kein Webhook (Testzugang wieder entfernt), keine Credentials, **kein Node der nach außen
schreiben könnte** (nur `manualTrigger`, `scheduleTrigger`, `dataTable`, `code`), Schreibziele
ausschließlich die drei eigenen Tabellen, `geschrieben` steht immer auf `false` — geschrieben wird
erst durch `oz-schreiben`, sobald die quickedit-Rechte da sind.

### Aufgeräumt

Die 7 synthetischen Testfälle (`900001`–`900007`) und ihre 19 Antwortzeilen sind aus allen drei
Tabellen **gelöscht** — vorher mit `dryRun` geprüft, dass der Filter genau sie trifft und nichts
sonst. Erfundene Datensatz-IDs dürfen nicht liegen bleiben: ein späterer Schreibvorgang würde
sonst versuchen, Datensatz `900001` in destination.data zu ändern.

---

## Mailversand — gebaut, aber sicher stillgelegt (01.09.2026)

`OZ-1` hat jetzt eine Mail-Strecke. Sie erzeugt Zugänge und den Mailtext, **verschickt aber
nichts**: der Send-Email-Node ist deaktiviert und der Testmodus ist an.

```
Fall speichern → Zuständige lesen → Empfänger bestimmen → Token erzeugen
              → Mailtext bauen → Zugang anlegen → Anfrage senden (deaktiviert)
```

### Der Token kommt aus dem Crypto-Node, nicht aus dem Code

Im n8n Code Node ist **`crypto.randomUUID` nicht verfügbar** — geprüft, indem der Token je nach
Verfahren mit `a` oder `b` beginnt: er begann mit `b`, also griff der Rückfall auf `Math.random`.
Das ist zu wenig: `Math.random` ist vorhersagbar, und der Token ist der einzige Schutz des
Fragebogens.

Erzeugt wird er deshalb vom Node **`n8n-nodes-base.crypto`** mit
`{action: 'generate', encodingType: 'uuid', dataPropertyName: 'token'}`. Geprüft: 70 von 70
Tokens sind 32-stellige Hex-UUIDs, alle verschieden.

Weil der Token erst danach existiert, ist der Code in zwei Nodes geteilt: `Empfänger bestimmen`
(wer bekommt Post) und `Mailtext bauen` (Text mit Link).

### 🔴 Der Befund, der den Testmodus erzwungen hat

Beim ersten Probelauf entstanden 70 Zugänge — und **63 der Empfängeradressen waren echt**
(`schiedersee.de`, `parkhotel-hegers.de`, `hotel-aspethera.de` …). Die Gastronomen-Adressen kommen
live aus dem Feld `email` der Schnittstelle, sind also echte Betriebsadressen.

Es ging nichts raus, weil der Mail-Node deaktiviert war. Aber der Versand an 63 echte Betriebe
hing damit an **einem Häkchen**. Deshalb jetzt zweistufig:

```js
const TESTMODUS = true;                                  // Standard: an
const TEST_EMPFAENGER = 'test-empfaenger@example.invalid';
```

Solange `TESTMODUS` an ist, wird **jede** Empfängeradresse ersetzt; die echte steht nur im
Datenfluss (`echter_empfaenger`) und wird nirgends angeschrieben. Nachgeprüft: nach der Umstellung
gingen 0 von 70 Zugängen auf eine echte Domain.

### Vor dem ersten echten Versand — drei Dinge

1. `FRAGEBOGEN_BASIS` auf die veröffentlichte Adresse setzen (steht auf einem Platzhalter)
2. `ABSENDER` setzen und eine **SMTP-Credential** hinterlegen
3. `TESTMODUS = false` **und** den Node `Anfrage senden` aktivieren

### Der Mailtext

```
Betreff: Stimmen die Öffnungszeiten von Café Hölter?

Guten Tag,

für Café Hölter in Salzkotten liegen uns unterschiedliche Öffnungszeiten vor.
Sie kennen Ihren Betrieb am besten.

So sieht der Eintrag gerade für Gäste aus:
https://www.teutonavigator.de/…/g_100022794/caf-hoelter

Bitte bestätigen Sie mit einem Klick, welche Angabe stimmt:
https://…/fragebogen?token=…

Das dauert weniger als eine Minute. Wir warten bis zum 08.09.2026.

Vielen Dank für Ihre Hilfe
Teutoburger Wald Tourismus

--
Sie bekommen diese Nachricht, weil Ihre Adresse zu diesem Eintrag in
destination.data hinterlegt ist. Der Link oben gilt nur für Sie und nur einmal.
```

Rollenabhängig ist nur ein Satz (`Sie kennen Ihren Betrieb am besten.` /
`… zuletzt bearbeitet.` / `… angelegt.`). Bei leeren Öffnungszeiten kommt eine Zeile dazu:
*„Dort steht derzeit »immer geöffnet« — weil keine Öffnungszeiten hinterlegt sind."*

**Kein Bearbeitungslink in der Mail** — alle antworten über den Fragebogen.

Beim Bauen fiel dabei ein Fehler auf: ein `filter(zeile => zeile !== '')` hat **alle** Leerzeilen
entfernt, die Mail war ein dichter Block. Jetzt markiert `null` die bedingte Zeile, `''` bleibt
Leerzeile. Der Text lässt sich ohne n8n und ohne Versand prüfen — der lokale Renderer im
Scratchpad zeigt ihn genau so, wie er rausgehen würde.

### Messwerte des Probelaufs

| | |
|---|---:|
| Fälle angelegt | 40 |
| Zugänge angelegt | 70 |
| davon Anfrage-Fälle | 37 |
| Direkt-Vorschläge (**keine** Mail) | 3 |
| Empfänger: Gastronom / Redaktion / Bearbeiter | 33 / 30 / 7 |

Dass die Redaktion 30-mal auftaucht, liegt an `oz_zustaendige`: dort stehen nur die 34
Priorität-1-Fälle. Für alle anderen fällt keine zuständige Person an, und die Anfrage geht an die
Region — genau die vorgesehene Rückfallregel.
