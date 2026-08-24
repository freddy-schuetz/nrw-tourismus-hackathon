# 🗄️ Brauche ich eine Datenbank? — Niederschwellig zuerst

Kurz: **meistens brauchst du keine externe DB.** Wähle nach *wo die Daten leben*:

| Fall | Lösung | Setup-Aufwand |
|------|--------|---------------|
| Daten gehören zu einem **n8n-Workflow** | **n8n Data Tables** | ⭐ null (eingebaut) |
| **Sichtbares Tabellen-Grid** (wie Airtable) | **NocoDB** (buildbar, geteilt EU) | niedrig (Account + Token) |
| **Login / Datei-Uploads / Vektoren / deploytes Frontend** | **Supabase** (buildbar, geteilt EU) | niedrig (Keys aus dem Gate) |
| **Lokaler Prototyp / ein Backend-Prozess mit Volume** | **SQLite** | null (Datei) |

> Die geteilten EU-Bausteine (NocoDB, Supabase) sind dieselben wie für die Web-Teilnehmenden. Zugangsdaten stehen im **Zugangsbereich auf `buildbar.at/nrw`** (Passwort nennt die Moderation).

---

## 1. n8n Data Tables — Default für Workflows (null Setup)

In n8n **eingebaut**, schon in deiner **Cloud-Trial** dabei. Keine Anmeldung, kein Connection-String, kein eigener Server.

- Tabellen mit Spalten anlegen, aus Workflows **lesen / schreiben / aktualisieren / löschen** (Node **„Data Table"**) — oder von Claude per MCP (`n8n_manage_datatable`).
- **Limit: 50 MB** gesamt (alle Tabellen zusammen) auf Cloud — für Hackathon-Mengen reichlich.
- Ideal für: Lookups, Status/State merken, kleine Listen, Deduplizierung, Zwischenspeicher.
- Sag zu Claude: *„Leg eine Data Table `leads` mit Spalten name, email, status an und schreib im Workflow neue Einträge rein."*
- Winziger State ohne Tabelle: n8n **workflow static data** (Schlüssel-Werte).

→ **Das ist für die allermeisten n8n-Use-Cases der richtige, niederschwelligste Weg.**

## 2. NocoDB (buildbar, geteilt) — sichtbares Tabellen-Grid

Für „Claude, speicher/lies das in einer Tabelle" mit **sichtbarer Oberfläche** (wie Airtable). Geteilte EU-Instanz unter **`nocodb.buildbar.at`**.

- **Self-service:** dort einen **Account + API-Token** anlegen. Claude bindet das Token als **NocoDB-Credential** in deine n8n ein (Node „NocoDB").
- Ideal für: Anfragen/Anmeldungen sammeln, Event-Listen, alles was jemand **im Browser sehen/bearbeiten** soll.
- Geteilte Instanz → **eigene Tabellen/eigenes Präfix**, keine echten personenbezogenen Daten.

## 3. Supabase (buildbar, geteilt) — Login, Uploads, Vektoren

Wenn ein **deploytes Frontend** und/oder **mehrere Dienste** eine gemeinsame Postgres-DB brauchen, oder du **Login/Auth**, **Datei-Uploads** bzw. **Vektor-Suche (pgvector, KI-Memory)** willst. Geteilte self-hosted EU-Instanz unter **`supabase.buildbar.at`**.

- **Zugangsdaten** (Project-URL, `anon key`, `service_role`) stehen im **Zugangsbereich auf `buildbar.at/nrw`** (Passwort nennt die Moderation) — **keine eigene Anmeldung nötig**.
- **n8n:** Node **„Supabase"** oder **„Postgres"**. **Next.js:** `@supabase/supabase-js` (Keys als Deploy-`env`, nie ins Repo). **FastAPI:** `psycopg` mit dem Connection-String (siehe auskommentiertes Beispiel in `../backend-example/app/main.py`).
- Geteilte Instanz → **eigene Tabellen/Präfix**, keine echten personenbezogenen Daten. ⚠️ Keys **nie ins Repo**, nur als Deploy-`env` / n8n-Credential.
- *(Fallback für Self-Hoster / nach dem Event: eigenes Projekt auf [supabase.com](https://supabase.com), Free-Tier ohne Kreditkarte, pausiert nach 1 Woche Inaktivität.)*

## 4. SQLite — nur lokal / ein einzelner Prozess

Null Setup, eine Datei. Gut für **lokale Prototypen** oder ein **Backend, das als ein dauerhafter Prozess mit Volume** läuft (z.B. `backend-example` als Docker-Container mit gemountetem Volume).

- ⚠️ **Nicht für deployte Apps:** im Deploy-Container ist das Dateisystem flüchtig — die `.sqlite`-Datei ist nach einem Redeploy weg. Für ein deploytes Frontend ist SQLite daher die falsche Wahl (→ Supabase).
- Das [snipKI hackathon-starter-kit](https://github.com/freddy-schuetz/hackathon-starter-kit) nutzt SQLite, weil es **lokal** läuft — genau der passende Fall. **Sobald deployt → Supabase.**

---

### Faustregel
**n8n-Workflow → Data Tables. Sichtbare Tabellen → NocoDB (buildbar). Login/Uploads/Vektoren/deployt → Supabase (buildbar). Nur lokal → SQLite.**
