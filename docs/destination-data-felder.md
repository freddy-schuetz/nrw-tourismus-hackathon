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
