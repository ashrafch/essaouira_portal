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

## UI/UX — da fare

### Migrazione al design system (coerenza “professionale”)
Pagine ancora su stili inline + `components/Modal`/`FeedbackMessage` legacy, da portare su `components/ui` (PageHeader, Button, Modal, toast):

- [ ] `Bookings.jsx` (1298 righe) — scomporre + `ui/Modal` + toast + tabella su design system.
- [ ] `Staff.jsx` (2039 righe) — scomporre in feature-component.
- [ ] `ArrivalsDepartures.jsx` — design system + toast.
- [ ] `Business.jsx` — aggiungere **grafici** (oggi solo tabelle) e KPI trend.
- [ ] `Pricing.jsx` — migrare le 2 modali legacy a `ui/Modal` + toast.
- [ ] `Maintenance.jsx`, `Expenses.jsx`, `Units.jsx`, `StaffPlanner.jsx`, `StaffDirectory.jsx` — allineare a `PageHeader`/`ui`.
- [ ] Rimuovere l'“escape hatch” CSS in `index.css` una volta migrate le pagine inline.

### Coerenza & rifiniture
- [ ] `PageHeader` uniforme su tutte le pagine core (oggi alcune usano `<h1>` inline).
- [ ] Formatter valuta/percentuale (`utils/format`) usato ovunque (restano `toLocaleString` sparsi).
- [ ] Date helper condivisi (`utils/dateUtils`) al posto delle re-implementazioni in `Bookings.jsx`/`Staff.jsx`.
- [ ] Sostituire i restanti `window.alert()` / emoji-come-UI con toast/icone.
- [ ] Icone “i” inline anche sulle sezioni interne (oltre alla topbar) dove utile.

### Mobile & accessibilità
- [ ] Layout mobile dedicato per le pagine dense (Bookings, Calendar, Staff) oltre allo scroll orizzontale.
- [ ] Valutare bottom-nav mobile (oggi solo drawer laterale).
- [ ] Pass accessibilità: focus-visible, label ARIA sulle azioni icona, contrasto in dark.

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
