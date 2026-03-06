# Portal Current Functionality Analysis

Data di riferimento: 2026-03-06

## 1) Executive summary

Questo documento descrive lo stato attuale del prodotto "Essaouira Portal" in produzione locale/staging:
- cosa fa oggi a livello operativo per chi gestisce appartamenti/BnB
- come e costruito tecnicamente (frontend, backend, DB, infrastruttura)
- quali capability sono gia pronte per un uso multi-tenant e orientato a clienti esterni
- quali vincoli/limiti devono guidare la prossima ristrutturazione verso:
  - portale unico gestione operativa + domotica
  - architettura server unificata e scalabile

## 2) Scope funzionale attuale (business/operativo)

### 2.1 Dashboard operativa
Pagina: `/`

Funzioni principali:
- KPI economici e operativi del mese (revpar, share direct, pipeline 30g, ricavi/costi/profitto)
- alert giornalieri operativi
- arrivi del giorno
- avanzamento task staff del giorno
- filtri mese/anno

Valore operativo:
- controllo stato business e operazioni in un unico entry point

### 2.2 Prenotazioni
Pagine: `/calendar`, `/bookings`, `/arrivals-departures`, `/bookings/:id/document`

Funzioni principali:
- calendario prenotazioni e gestione disponibilita
- creazione/modifica prenotazione (ospite, date, unit, source, pricing, stato pagamento)
- conflitti date, informazioni finanziarie base booking
- gestione pagamenti booking (transazioni)
- emissione fattura booking
- CRM ospiti con storico prenotazioni
- documento booking stampabile
- pagina Arrivi & Partenze con azioni rapide e template messaggi

Valore operativo:
- flusso end-to-end da prenotazione a incasso e comunicazione ospite

### 2.3 Proprieta e pricing
Pagine: `/units`, `/pricing`, `/expenses`, `/business`

Funzioni principali:
- anagrafica unita/appartamenti
- default pricing, fee e impostazioni canali
- gestione spese manuali + spese derivate da operazioni
- analisi business mensile (P&L, costi per categoria, performance canali)
- export CSV cost lines

Valore operativo:
- controllo economico mensile e pricing governance

### 2.4 Operations & Staff
Pagine: `/staff-planner`, `/staff`, `/ops-automation`, `/staff-anagrafica`, `/maintenance`

Funzioni principali:
- planner giornaliero task staff per categoria
- board task staff giornaliera/settimanale con quick actions
- default operativi staff (assegnatario/costo/ore)
- anagrafica membri staff con ruoli e stato attivo
- manutenzioni/ticket con stato e priorita
- automazione operativa:
  - template messaggi
  - message jobs queue
  - checklist housekeeping per staff task

Valore operativo:
- pianificazione risorse, standardizzazione esecuzione, riduzione operativita manuale

### 2.5 Admin, tenant e compliance
Pagine: `/admin-control` (+ login `/login`)

Funzioni principali:
- audit log live + export CSV
- compliance links/config
- onboarding tenant da frontend (owner piattaforma)
- branding tenant base (primary color, logo)
- user management tenant (owner)
- reset password e change password

Valore operativo:
- base SaaS multi-cliente con separazione tenant e controllo governance

## 3) Funzionalita tecniche core backend

Backend: FastAPI + SQLAlchemy + Alembic (PostgreSQL)

### 3.1 Domini principali coperti
- Auth & utenti
- Tenants & RBAC
- Bookings
- Units
- Pricing defaults
- Cost items
- Staff tasks/defaults/members
- Maintenance tickets
- Sales core (guest profiles, payment transactions, invoice documents)
- Ops automation (message templates/jobs, housekeeping checklist)
- Distribution & revenue (channel connections, revenue rules, rate recommendations)
- Audit logs
- Platform tenant onboarding

### 3.2 Modello sicurezza
- JWT auth con scadenza token
- ruoli: `viewer`, `operator`, `manager`, `owner`
- isolamento tenant tramite `tenant_id` in token e filtri DB
- header opzionale `X-Tenant-Id` validato contro token
- endpoint platform protetti per `owner@default`

### 3.3 Migrazioni e bootstrap
- migrazioni Alembic versionate (`0001` ... `0010`)
- bootstrap configurabile (`AUTO_CREATE_SCHEMA`, `AUTO_SEED_DATA`)
- supporto setup locale rapido con Docker

## 4) API capability map (macro-gruppi)

Nota: elenco sintetico per capability; vedere `apps/server/app/main.py` e router effettivi per dettaglio payload.

### 4.1 Auth e utenti
- `POST /auth/login`
- `POST /auth/change-password`
- `GET/POST/PUT /users`
- `POST /users/{id}/reset-password`

### 4.2 Core operations
- `GET/POST/PUT/DELETE /bookings`
- `GET/POST/PUT/DELETE /units`
- `GET/POST/PUT/DELETE /cost-items`
- `GET/PUT /pricing-defaults`

### 4.3 Staff e manutenzioni
- `GET/POST/PUT/DELETE /staff-tasks`
- `GET/PUT /staff-defaults`
- `GET/POST/PUT/DELETE /staff-members`
- `GET/POST/PUT/DELETE /maintenance`

### 4.4 Sales core
- `GET /guests`, `GET /guests/{id}`, `GET /guests/{id}/bookings`
- `GET/POST /bookings/{id}/payments`
- `GET /invoices`, `POST /bookings/{id}/invoice`

### 4.5 Ops automation
- `GET/POST/PUT /message-templates`
- `GET /message-jobs`, `PUT /message-jobs/{id}/status`
- `GET/POST/PUT /staff-tasks/{id}/checklist...`

### 4.6 Distribution & revenue
- `GET/POST/PUT /channel-connections`
- `GET/POST/PUT /revenue-rules`
- `GET /revenue/rate-recommendations`
- `GET /analytics/channel-performance`

### 4.7 Governance
- `GET /audit-logs`
- `GET/POST /platform/tenants`
- `PUT /platform/tenants/{tenant_id}`

## 5) Frontend architecture attuale

Frontend: React + Vite

### 5.1 Struttura applicativa
- layout principale con sidebar/topbar desktop
- drawer + bottom nav su mobile
- routing per moduli operativi
- modal-first UX su azioni principali
- service layer centralizzato (`apps/web/src/services/api.js`, `auth.js`)
- protected routes per accesso autenticato

### 5.2 PWA/mobile
- manifest + service worker
- installabile su Android/iOS
- viewport mobile supportato
- QA checklist dedicata: `docs/GO_LIVE_MOBILE_QA.md`

### 5.3 Stato UX attuale
Punti forti:
- copertura funzionale ampia
- flussi operativi rapidi su booking/staff
- info help su pagine complesse

Aree da consolidare in ristrutturazione:
- uniformita visuale e pattern form/azioni cross-page
- riduzione complessita in moduli ad alta densita (es. automazioni/revenue)
- maggiore consistenza microcopy e stati vuoti

## 6) Data model (vista concettuale)

Entita business principali:
- Tenant
- User
- Unit
- Booking
- CostItem
- StaffMember
- StaffTask
- MaintenanceTicket
- GuestProfile
- PaymentTransaction
- InvoiceDocument
- MessageTemplate
- MessageJob
- HousekeepingChecklistItem
- ChannelConnection
- RevenueRule
- AuditLog

Relazioni chiave:
- Tenant 1-N quasi tutte le entita operative
- Booking 1-N PaymentTransaction
- Booking 1-1/N InvoiceDocument (in base a policy)
- StaffTask N-1 Unit (opzionale), N-1 Booking (opzionale)
- StaffTask 1-N HousekeepingChecklistItem

## 7) Infrastruttura e deployment attuale

### 7.1 Runtime locale principale
- Docker Compose: `web + backend + db`
- porte default: web `8081`, api `8000`, db `5432`

### 7.2 Osservabilita
Profilo ops:
- Prometheus (`9090`)
- Grafana (`3000`)

### 7.3 Backup e restore
- backup DB automatico con retention
- script restore e drill disponibili in `scripts/`

### 7.4 CI/CD
Workflow GitHub Actions:
- CI pipeline
- staging pipeline (manual trigger)
- release readiness pipeline

## 8) Test coverage attuale

Backend (pytest) con suite per:
- auth e security
- RBAC tenant
- audit logs
- sales core
- ops automation
- distribution analytics
- platform tenants
- lifecycle password

Frontend:
- lint + production build
- QA manuale (inclusa checklist mobile)

## 9) Gaps/limiti da considerare per "portale unico + domotica"

### 9.1 Limiti funzionali attuali
- nessun dominio domotica (dispositivi, scene, telemetria, allarmi IoT)
- nessuna orchestrazione eventi real-time tra booking/staff e device
- nessun inventory astratto device per unita/struttura

### 9.2 Limiti architetturali per scale-up IoT
- backend monolitico API (ottimo per fase attuale, da modularizzare per dominio)
- assenza message bus/event backbone per workload asincroni ad alto volume
- assenza time-series store per telemetria sensori
- assenza command gateway dedicato per integrazioni vendor domotica

### 9.3 Direzioni consigliate per ristrutturazione
- Domain split (modulare) in 3 macro-bounded context:
  - PMS Core (booking, pricing, finance)
  - Ops Core (staff, maintenance, automation)
  - Smart Building Core (devices, rules engine, telemetry)
- Event-driven integration layer (queue/broker)
- API gateway unico + policy centralizzata auth/tenant
- data strategy ibrida:
  - PostgreSQL per transazionale
  - TSDB per sensori/telemetria
  - object storage per allegati/exports

## 10) Blueprint minimo per la prossima fase (proposto)

### Fase A - Document & contract hardening
- congelare contratti API attuali (OpenAPI versionata)
- formalizzare capability matrix per ruolo/tenant
- definire naming convention unificata frontend/backend

### Fase B - Server architecture unificata
- introdurre API gateway
- estrarre modulo async jobs/event bus
- centralizzare observability (logs, metrics, traces)

### Fase C - Domotica foundation
- modello Device, DeviceState, DeviceCommand, AutomationRule
- integrazione webhook/connector per provider principali
- regole base: check-in/check-out -> scenari device

### Fase D - Unified portal UX
- unico workspace per Operations + Smart Building
- timeline eventi operativi + eventi device
- alerting unico e playbook automatici

## 11) Indice file chiave (implementazione attuale)

Backend:
- `apps/server/app/main.py`
- `apps/server/app/core/config.py`
- `apps/server/app/core/auth.py`
- `apps/server/app/core/tenant.py`
- `apps/server/app/models/*.py`
- `apps/server/alembic/versions/*.py`
- `apps/server/tests/*.py`

Frontend:
- `apps/web/src/App.jsx`
- `apps/web/src/components/Layout.jsx`
- `apps/web/src/services/api.js`
- `apps/web/src/services/auth.js`
- `apps/web/src/pages/*.jsx`

Infra/ops:
- `docker-compose.yml`
- `docker-compose.staging.yml`
- `infra/prometheus/prometheus.yml`
- `scripts/db-backup.sh`
- `scripts/db-restore.sh`

## 12) Conclusione

Lo stato attuale e gia superiore a un MVP: copre PMS + operations + base SaaS multi-tenant.
La ristrutturazione consigliata non parte da zero: deve preservare i flussi operativi esistenti e aggiungere un dominio domotica come estensione architetturale modulare, mantenendo isolamento tenant, audit e governabilita enterprise.
