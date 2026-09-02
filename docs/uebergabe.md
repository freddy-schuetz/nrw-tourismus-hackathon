# Übergabe: den Öffnungszeiten-Abgleich woanders wieder aufbauen

Diese Anleitung bringt die Lösung auf einem neuen Rechner, in einer neuen
n8n-Instanz oder unter einem anderen Konto zum Laufen. Sie ist so geschrieben, dass
man sie abarbeiten kann, ohne diesen Chatverlauf zu haben.

**Kurzfassung:** Der Code liegt vollständig im Git-Repo. Die n8n-Workflows werden
daraus **erzeugt**, nicht von Hand gebaut. Was nicht im Repo liegen kann, sind
Zugangsdaten und die IDs einer konkreten n8n-Instanz — für die gibt es Vorlagen und
ein Skript.

---

## Was wovon abhängt

| Bestandteil | Wo er lebt | Beim Umzug |
|---|---|---|
| Logik, Bauskripte, Tests, Doku | Git-Repo | kommt mit |
| Frontend (Fragebogen, Use-Case-Seite) | Git-Repo, `frontend-starter/` | kommt mit |
| **n8n-Workflows** | n8n-Instanz | **werden neu erzeugt** |
| **Data Tables** | n8n-Instanz | **werden neu erzeugt**, Inhalt nicht |
| Credentials (SMTP, KI) | n8n-Instanz | **von Hand neu anlegen** |
| Veröffentlichte Seite | `deploy.buildbar.de` | neu veröffentlichen |
| Der Chatverlauf | Claude-Konto | **nicht übertragbar** — deshalb diese Doku |
| Das Artifact der Präsentation | Claude-Konto | Inhalt liegt im Repo, nur die URL geht verloren |
| Lokales Gedächtnis von Claude Code | Benutzerprofil des Rechners | bleibt am Rechner |

**Ein Wechsel des Claude-Kontos kostet nur die letzten zwei Zeilen.** Das eigentliche
Risiko ist, dass die Hackathon-Infrastruktur abgeschaltet wird: die n8n-Instanz
`n8n.oi.destination.one`, das KI-Credential *one.intelligence account 47* und
`deploy.buildbar.de`.

---

## Umzug in 8 Schritten

### 1. Repo holen und Werkzeuge prüfen

```bash
git clone <dein-repo> && cd <ordner>
node --version    # 20 oder neuer
```

Auf einem Rechner ohne Administratorrechte lässt sich Node portabel ins
Benutzerprofil legen; dann müssen die Pfade in `.mcp.json` und
`.claude/launch.json` absolut sein.

### 2. `.mcp.json` auf die neue n8n-Instanz zeigen lassen

```bash
cp .mcp.json.example .mcp.json
```

Einzutragen sind `N8N_API_URL` und `N8N_API_KEY` (n8n → Einstellungen → n8n API).
Die Datei ist per `.gitignore` ausgeschlossen und **gehört nicht ins Repo**.

Gegenprobe:

```bash
node -e "const k=require('./.mcp.json').mcpServers['n8n-mcp'].env; fetch(k.N8N_API_URL+'/api/v1/workflows?limit=1',{headers:{'X-N8N-API-KEY':k.N8N_API_KEY}}).then(r=>console.log('HTTP',r.status))"
```

`HTTP 200` heißt: Verbindung steht.

### 3. Data Tables anlegen

```bash
node oz-logik/baue-tabellen.js
```

Legt `oz_faelle`, `oz_antworten`, `oz_ergebnisse` und `oz_zustaendige` mit allen
Spalten an und schreibt die IDs nach `oz-logik/tabellen.json`. Das Skript ist
wiederholbar: bestehende Tabellen erkennt es am Namen und ergänzt nur fehlende
Spalten — **es löscht nie etwas**.

Nur vergleichen, ohne zu ändern:

```bash
node oz-logik/baue-tabellen.js --pruefen
```

Und falls du den Anlege-Pfad in einer Instanz ausprobieren willst, in der die
echten Tabellen schon stehen — es werden Kopien unter anderem Namen erzeugt und
`tabellen.json` bleibt unberührt:

```bash
node oz-logik/baue-tabellen.js --praefix probe_
```

Die Testtabellen danach in n8n löschen.

### 4. Credentials in n8n anlegen und ihre IDs eintragen

Von Hand in n8n, weil Geheimnisse nirgends sonst hingehören:

| Schlüssel | Typ | Wofür |
|---|---|---|
| `ki` | ein Chat-Modell-Credential | OZ-1, Node *Sprachmodell* — liest Öffnungszeiten aus Webseiten-Fließtext |
| `smtp` | `smtp` | OZ-1 *Anfrage senden*, OZ-3 *Quittung senden* |

Dann:

```bash
cp oz-logik/credentials.json.example oz-logik/credentials.json
```

und die IDs eintragen. **Die ID steht in n8n in der Adresszeile**, wenn man das
Credential öffnet: `…/home/credentials/<ID>`. Über die API sind Credentials nicht
auflistbar (`GET /api/v1/credentials` → 403), deshalb dieser Umweg.

In `credentials.json` stehen nur **IDs und Namen**, keine Passwörter. Die Datei ist
gitignored.

> Nutzt die neue Instanz ein anderes Modell als `CUSTOM.lmChatOneIntelligence`, muss
> in `oz-logik/baue-oz1-workflow.js` zusätzlich `KI_MODELL` und der `type` des Nodes
> *Sprachmodell* angepasst werden. Alles andere bleibt.

### 5. Workflows erzeugen

```bash
node oz-logik/baue-oz1-workflow.js
node oz-logik/baue-oz2-workflow.js
node oz-logik/baue-oz3-workflow.js
```

Ohne `--update` wird jeweils ein **neuer** Workflow angelegt; die ausgegebenen IDs
notieren. Für spätere Änderungen dann `--update <id>`.

⚠️ **Nie im n8n-Editor an den Code-Nodes arbeiten.** Ihr Inhalt wird aus
`oz-logik/normalisieren.js` und `oz-logik/webseite.js` erzeugt; ein
`--update` überschreibt Handarbeit. Der Bau bricht ab, wenn beide Module denselben
Funktionsnamen belegen.

### 6. Prüfen, ohne etwas auszulösen

```bash
node oz-logik/ki-auswertung-test.js     # 33 Prüfungen, ohne n8n, ohne Modellaufruf
node oz-logik/baue-n8n-bundle.js        # Namenskollisionen + Selbsttest
node oz-logik/testlauf.js               # Vergleichslogik gegen den echten Datenbestand
```

Dazu in n8n `n8n_validate_workflow` für alle drei — erwartet: **0 Fehler**.

### 7. Frontend veröffentlichen

Die Fragebogen-Adresse steckt als `FRAGEBOGEN_BASIS` in
`oz-logik/baue-oz1-workflow.js` und muss nach dem Veröffentlichen dort eingetragen
werden.

`NEXT_PUBLIC_*` wird beim **Bauen** in die JavaScript-Dateien eingesetzt, nicht zur
Laufzeit gelesen — die n8n-Adresse gehört deshalb in `frontend-starter/.env.production`
und nicht in die `env`-Angabe des Deploys.

Die Use-Case-Seite wird mitgeliefert:

```bash
node oz-logik/baue-use-case-seite.js    # → frontend-starter/public/use-case.html
```

Für `deploy.buildbar.de` gilt: **die deployId aufschreiben.** Ein zweiter
`/prepare`-Aufruf liefert eine neue und damit eine neue Adresse — Details in
[destination-data-felder.md](destination-data-felder.md).

### 8. Erst danach scharf schalten

Solange getestet wird, sind **zwei** Sperren aktiv, und das soll so bleiben, bis
alles steht:

1. Die Versand-Nodes *Anfrage senden* und *Quittung senden* sind **abgeschaltet**
2. `TESTMODUS = true` leitet **jeden** Empfänger auf eine Testadresse um

Vor dem ersten echten Versand:

- Absenderadresse eintragen (steht als `noreply@BITTE-EINTRAGEN` in OZ-1 und OZ-3)
- SMTP-Credential **einmal von Hand** im Editor testen. Ein über die API angelegter
  Workflow konnte es sonst nicht nutzen („There was a problem executing the
  workflow", ohne gespeicherte Ausführung); ein Klick auf *Test workflow* löst das.
- `TESTMODUS = false`, Versand-Nodes einschalten
- Datenschutz klären — die Gastronomen-Adressen sind **echt**

---

## Was sich nicht mitnehmen lässt

| | |
|---|---|
| **Inhalt der Data Tables** | Fälle und Tokens gelten nur für einen Lauf. Auf der neuen Instanz einfach neu laufen lassen. |
| **`oz_zustaendige`** | Kommt aus einem Export des destination.data-Backends (Datensatz-ID, Ersteller-Mail, Bearbeiter-Mail). Die Lese-Schnittstelle liefert diese Felder nicht — `author` ist in 0 von 600 Datensätzen gefüllt. Einlesen mit `node oz-logik/zustaendige.js`. |
| **Geheimnisse in Credentials** | Nicht exportierbar, immer neu eintragen. |
| **quickedit-Schreibrechte** | Organisatorisch, nicht technisch. Braucht einen technischen Benutzer mit Rechten nur auf den eigenen Mandanten und nur auf Öffnungszeiten. |

---

## Wenn etwas klemmt

| Symptom | Ursache |
|---|---|
| `tabellen.json fehlt` | Schritt 3 nachholen |
| `credentials.json fehlt` | Schritt 4 nachholen |
| `CONNECTION_CLOSED` beim MCP-Server | `npx`/`node` nicht im Pfad von Claude Code — absolute Pfade in `.mcp.json` eintragen |
| Workflow lässt sich nicht aktivieren, „Missing or invalid required parameters: filters" | Ein Upsert-Node braucht **beides**: `filters.conditions` und `columns.matchingColumns` |
| `possible out-of-memory`, Instanz stürzt ab | Ein Node läuft einmal **pro Eingabe-Item**. Steht ein Node, der viele Zeilen liefert, vor einem Abruf, braucht der Abruf `executeOnce: true` |
| „A Model sub-node must be connected and enabled" | Der Ausgabe-Parser braucht mit `autoFix` eine **eigene** `ai_languageModel`-Verbindung |
| Fragebogen zeigt veraltete Fassungen | Mehrere Zeilen je Datensatz in `oz_faelle` — *Fall speichern* muss **upsert** auf `datensatz_id` sein |

Die ausführlichen Befunde und Messwerte stehen in
[destination-data-felder.md](destination-data-felder.md), der Prüfstand in
[Pruefbericht_Oeffnungszeiten-Abgleich_2026-09-01.md](Pruefbericht_Oeffnungszeiten-Abgleich_2026-09-01.md).

---
*Erstellt mit dem Hackathon-Starter · friedemann-schuetz.de*
