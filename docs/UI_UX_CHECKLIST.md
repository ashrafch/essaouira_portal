# UI/UX & Roadmap — Checklist

Stato al momento della scrittura. `[x]` = fatto, `[ ]` = da fare.

## Fatto di recente

- [x] Sistema di **aiuto contestuale**: icona “i” in topbar → tutorial breve per la pagina corrente (`config/helpTopics.js`, `components/HelpButton.jsx`).
- [x] **Topbar contestuale**: titolo + sottotitolo cambiano in base alla pagina.
- [x] Util condivisi `dateUtils` + `format` (valuta unificata).
- [x] Calendario: `PageHeader` + icone (no emoji), toast al posto di `alert`, overlay prezzo/notte.
- [x] Dashboard: palette grafici theme-aware, valuta unificata, icone.
- [x] Revenue completo (Fasi 0–4): rate calendar, motore consigli, min-stay, guardrail, stagioni/lead-time/orfane, iCal export+import, comp-set, alert, sync-all, push (simulato).
- [x] Fix catena migrazioni Alembic (build da zero) e fix CI (`pytest` nudo).

## UI/UX

### Migrazione al design system — FATTA sulle pagine core
Portate a `components/ui` (PageHeader, Button, Modal accessibile, toast):

- [x] Fix globale contrasto **pulsanti bianchi** (`index.css`): copre `var(--color-surface)`/`transparent`/soft, non più solo `#fff`.
- [x] `Bookings.jsx` — `PageHeader`, `ui/Modal`, `Button`, toast (logica prenotazioni/availability invariata).
- [x] `ArrivalsDepartures.jsx` — `PageHeader`, `Button`, toast.
- [x] `Business.jsx` — `PageHeader`, `StatCard`, **grafici** (torta ricavi + barre per unità), toast, valuta unificata.
- [x] `Pricing.jsx` — 2 modali legacy → `ui/Modal` + toast.
- [x] `Maintenance.jsx`, `Expenses.jsx`, `Units.jsx` — `PageHeader`/`Button`/`Modal`/toast.
- [x] `StaffDirectory.jsx`, `StaffPlanner.jsx` — `PageHeader`/`Button`/`Modal`/toast.
- [x] `Staff.jsx` — light-touch (`PageHeader`, `Button`, toast).
- [x] Rifinitura Smart via `ui.css`: gerarchia titoli sezione (19px), KPI label uppercase, ritmo card.

Rimane:
- [ ] `Staff.jsx` — **decomporre** il monolite (2039 righe) in feature-component.
- [ ] Migrare `components/MessageModal` a `ui/Modal` (usata in ArrivalsDepartures).
- [ ] Toggle segmentati (day/week, stato task) come componente `ui` dedicato.
- [ ] Rimuovere l'“escape hatch” CSS in `index.css` quando non resta più nessun `<button>` inline.

### Coerenza & rifiniture
- [x] `PageHeader` sulle pagine core (restano fuori solo le utility: Login/404/Forbidden).
- [ ] Formatter valuta/percentuale (`utils/format`) ovunque (restano `toLocaleString` in alcune pagine smart).
- [ ] Date helper condivisi (`utils/dateUtils`) al posto delle re-implementazioni in `Bookings.jsx`/`Staff.jsx`.
- [ ] Rifinitura Smart **per-pagina** con feedback visivo (struttura più profonda dove serve).
- [ ] Icone “i” inline anche sulle sezioni interne (oltre alla topbar) dove utile.

### Mobile & accessibilità
- [x] **Bottom-nav mobile** (≤768px, RBAC-aware): Home/Prenotazioni/Calendario/Staff + “Menu” (apre il drawer).
- [x] **Topbar responsive**: su mobile nasconde meta ruolo/utente, pill connettività e ricerca comandi; resta titolo + icone.
- [x] Padding inferiore del contenuto per non finire sotto la bottom-nav.
- [x] `ui/Modal` in **portal** su `document.body` (centrato e robusto anche sotto la topbar con `backdrop-filter`).
- [x] Vista **agenda/lista** del Calendario su mobile (≤768px) al posto della griglia 7 colonne.
- [x] **Skip-link** “Salta al contenuto” + `main` focus target (a11y).
- [ ] Stacking “a card” delle tabelle dense su mobile (oltre allo scroll orizzontale).
- [ ] Pass accessibilità completo: audit ARIA su tutte le azioni icona, contrasto in dark, trap/riordino focus.

### RBAC/coerenza rotte
- [ ] `BookingDocument` dentro la tabella `appRoutes.js` (oggi cablata a parte in `App.jsx`).
- [ ] Razionalizzare accesso finanziario asimmetrico (`/business` vs `/expenses`,`/maintenance`).

### Test frontend
- [ ] Baseline **Vitest** (oggi nessun test frontend); coprire `utils`, `RateCalendarEditor`, `HelpButton`.

## Revenue — oltre la Fase 4 (dipendenze esterne, non stubbate)
- [ ] **Push prezzi OTA reale** (adapter attuale è simulato) — richiede API di connettività del canale.
- [ ] **Repricing automatico** schedulato (oggi “Applica consigli” è on-demand).
- [ ] **Feed di mercato live** al posto/oltre il comp-set manuale.
- [ ] **Scheduling** di `sync-all` (e auto-reprice) via cron/systemd o profilo ops.

## Gate prodotto (solo se venduto come SaaS)
- [ ] Isolamento tenant per le tabelle legacy (`Booking`/`Unit` non hanno `tenant_id`).
- [ ] i18n (oggi UI in italiano hardcoded).
- [ ] Pagamenti e pagina di booking pubblica.

Vedi anche: `docs/GAP_ANALYSIS_AND_ROADMAP.md`, `docs/REVENUE_MANAGEMENT_INTEGRATION_ANALYSIS.md`, `AGENTS.md`.
