# Roadmap Prodotto

## Stato attuale
- Auth hardening (password hash, `auth/me`, guardrail produzione): completato
- RBAC base (viewer/operator read-only, manager/owner write): completato
- Tenant context su token/header: completato
- Isolamento dati tenant a livello ORM (`tenant_id` + filtri automatici): completato
- Audit trail backend (`audit_logs` + endpoint consultazione owner): completato
- Tenant onboarding piattaforma (`/platform/tenants` + owner seed): completato
- Admin UI (`/admin-control`) per audit/compliance/onboarding: completato
- Compliance policy endpoint pubblico (`/compliance/policy`): completato

## Backlog post-core (come richiesto)
- Osservabilita completa:
  - dashboard Grafana pronte all'uso (API latency p95, error rate, saturazione)
  - alerting Prometheus (Slack/Email) con soglie operative
  - runbook incidenti e SLO/SLA

## Prossimi blocchi per "prodotto 100%"
1. Gestione utenti reale (non solo admin singolo):
   - tabella utenti, ruoli per tenant, disattivazione account
   - inviti/reset password
2. Tenant onboarding:
   - creazione tenant via API/admin
   - provisioning seed per tenant nuovo
3. Compliance e governance:
   - audit log azioni critiche
   - policy retention dati e export/cancellazione
4. Operativita commerciale:
   - piani e billing
   - onboarding guidato cliente
