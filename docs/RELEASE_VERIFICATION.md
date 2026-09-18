# Verifica congiunta Portal / VillaCore

Baseline di lavoro: 2026-09-15, ramo `hardening/production-release-gates` in
entrambe le repository. I risultati locali non sono una certificazione di
sicurezza o un collaudo hardware. Non e stata modificata la configurazione
segreta della villa e non sono stati azionati dispositivi reali.

Ripresa e verifica conclusiva: 2026-09-16. I comandi automatici restano distinti
dagli ACK: il pannello mostra "esecuzione da confermare" per richieste accettate
e impedisce dispatch concorrenti nello stesso pannello.

Revisione successiva della UX: [UX_FUNCTIONAL_REVIEW.md](UX_FUNCTIONAL_REVIEW.md).
Home operativa separata dal rendiconto, filtri prenotazioni e collegamenti
persistenti e calendario ad altezza costante con dettaglio giornaliero;
suite frontend ampliata a 80 test. Questa fase non modifica
backend, schema dati o automazioni VillaCore e non estende le garanzie hardware.

## Flussi e responsabilita

### Separazione gestionale / QA - 18 settembre 2026

- Creato il progetto Docker persistente `hostara-management`, web solo su
  `127.0.0.1:8081`, database e volumi indipendenti da `portal-verify-*`.
- Inventario iniziale verificato: una struttura, Appartamento A1-A6, nessuna
  prenotazione, task, manutenzione o dispositivo fittizio. Nessun dato eliminato
  dal vecchio QA (25 unita conservate).
- Doppia inizializzazione e ciclo stop/start: stessi sei ID, nessun duplicato,
  credenziali conservate. Primo archivio PostgreSQL locale creato correttamente.
- Sei test del launcher; verifica browser in sola lettura a 1440/390px:
  sei opzioni e sei unita libere nel form, sei opzioni nella timeline,
  zero scritture di dati e zero errori JavaScript. Screenshot ispezionati.
- Nessuna connessione HA o comando fisico: provider mock forzato, niente token
  copiati. Il mapping VillaCore a1-a6 resta un passo esplicito successivo.
  Non e una nuova certificazione di produzione o di recupero off-site.

### Copertura generale

| Flusso | Correzione / copertura | Limite |
| --- | --- | --- |
| Avvio e login | Migrazioni PostgreSQL vuoto, primo owner senza seed, API autenticate | Dati esistenti richiedono backup e prova di migrazione |
| Prenotazione -> disponibilita | Validazione date/importi/stato, annullamenti esclusi; lock unita condiviso con import canali; due richieste simultanee su PostgreSQL, un solo inserimento | Carico e stress multi-processo da ampliare |
| Prenotazione -> personale | Salvataggio atomico, identita stabili, lavoro completato/assegnazioni conservati, ripianificazione e cancellazione | Verificare eccezioni operative con lo staff |
| Task -> edificio | Provenienza immutabile, no comandi da note manuali, no ripetizione del completamento | Dispatch asincrono non prova lo stato fisico |
| Navigazione gestionale | Ricerca derivata dalle route/RBAC, contesto unita/prenotazione/data nei collegamenti, sezioni indipendenti | Non e una riscrittura totale di tutte le pagine |
| UI in produzione | Suite Playwright su tutte le route, temi light/dark, desktop/mobile e PDF | Smoke di caricamento: non ogni combinazione di form/ruolo |
| Link HA live | Autenticazione, contratto, classificazione catalogo e confronto segreti in sola lettura | Nessuna prova live di attuazione o rotazione token |
| Eventi VillaCore | ID distinti per eventi con stessa correlazione, ACK solo se ingest accetta | Rete interrotta e ripristino end-to-end sul sito da collaudare |
| Sicurezza appartamenti | Blocco manutenzione ripristinabile, unknown/unavailable rifiutati | Stato fisico e riavvio della macchina reale da verificare |
| Impianti comuni | Capabilities limitate a safe_off/alarm_reset dal portale | Interblocchi fisici, PLC e protezioni sul posto |
| Backup | Dump atomico, errore esplicito, restore PostgreSQL reale, copia remota non distruttiva | Destinazione cifrata, scheduling, retention e recovery keys da configurare |
| Accessi | Account disabilitato/cambio ruolo invalida sessioni in produzione; tenant legacy bloccato su default | Letture economiche non segregate per campo; non SaaS multi-cliente |

L'API task espone due campi di sola lettura additivi (`is_automatic`,
`transition_locked`), ignorati come input. I form usano questi valori per non
proporre cambi di identita o riaperture rifiutati dal server; le note non sono
una fonte di autorizzazione. Il lock di completamento segue l'ordine
prenotazione -> task, coerente con la riconciliazione delle prenotazioni.

## Comandi ripetibili

Portal, dalla radice:

```powershell
cd apps/server
.\venv\Scripts\python.exe -m pytest -q
```

```powershell
cd apps/web
npm run lint
npm run test:run
npm run build
npm audit --omit=dev --audit-level=high
```

```powershell
python scripts/verify-production.py --browser --keep
```

`verify-production` usa progetto, volumi, segreti e porta privati; provider mock,
nessun seed demo. Verifica anche che DB/API non espongano porte host e che i
backup di produzione non dipendano dal profilo ops. Credenziali e pulizia sono
descritte in [DEPLOYMENT.md](DEPLOYMENT.md). La suite POSIX dei backup si esegue
in Linux/WSL con `python scripts/tests/test_backup_scripts.py`.

VillaCore, dalla sua radice:

```powershell
.\scripts\validate.ps1
.\scripts\check-home-assistant.ps1
```

`scripts/check-portal-link-offline.py` esegue le sequenze YAML nel motore HA
con servizi stub, container `--network none --read-only`, tmpfs `/tmp` e
repository montata read-only. Usare la versione immagine HA fissata dal progetto.
Nessun token o runtime `.storage` viene letto da questo test.

## Evidenza raccolta

- Backend: 168 test superati dopo aggiornamento dipendenze; regressioni su transazioni,
  pianificazione, autorizzazione smart e migrazioni incluse nella repository.
  Warning residui: chiave JWT breve solo nelle fixture di test e deprecazione
  TestClient/httpx upstream (non errori della suite).
- VillaCore: 176 test superati, Ruff/mypy, contratti e 14 artefatti deterministici
  verificati. Restano warning non bloccanti di lunghezza righe YAML generate.
- Home Assistant: configurazione valida. Motore offline: 6 casi delivery,
  1 kill switch, 24 rifiuti manutenzione, 6 check-in; zero chiamate a servizi reali.
- Link live di sola lettura: raggiungibile e autenticato, `villacore.link.v1`,
  694 entita totali, 445 importabili, 249 escluse, 0 non classificate, 13 zone;
  segreti ingest confrontati senza stamparli.
- Docker: avvio da PostgreSQL vuoto, login/API, backup e restore del dato di prova
  superati; dump fallito correttamente respinto senza archivio parziale residuo.
- Browser: tutte le 29 route nei due temi, desktop 1440x1000 e mobile 390x844,
  senza errori JS/HTTP 5xx e con PDF scaricabile. Individuata e corretta la
  sovrapposizione della toolbar documento mobile. Frontend: 54 test superati.
- Dipendenze: aggiornati jsPDF e dipendenze npm vulnerabili; FastAPI 0.136.3,
  Starlette 1.3.1, PyJWT 2.14.0 e instrumentator 8.1.0. `pip-audit` sul file
  requirements risolto non segnala vulnerabilita note. Consultati i changelog
  ufficiali [FastAPI](https://fastapi.tiangolo.com/release-notes/) e
  [PyJWT](https://pyjwt.readthedocs.io/en/stable/changelog.html).
  La versione FastAPI scelta evita il cambio di routing introdotto in 0.137.
  `npm audit` completo: zero vulnerabilita note. Questo non include una scansione
  dei pacchetti OS delle immagini container: eseguirla sulla release destinata al sito.

## Prima dell'uso reale

Non restano soltanto attivita fisiche: configurare e collaudare anche backup
off-site, HTTPS/rete gestionale, credenziali, ripristino e monitoraggio. Provare
una copia del database esistente prima di aggiornarlo. La scheda ospite/ricevuta
attuale contiene intestazioni di esempio e non va presentata come documento
fiscale o modulo ufficiale conforme senza personalizzazione e verifica locale.

**Limiti software del comando:** il ricevitore HA non dispone ancora di un
registro durevole degli ID comando o di una verifica della scadenza all'arrivo.
Non ritentare automaticamente una richiesta di attuazione dall'esito incerto.
Non esiste un outbox durevole: la riconciliazione recupera lo stato, non tutti
gli eventi persi durante un'interruzione. Anche il passaggio task completato ->
dispatch puo interrompersi tra il commit e la chiamata al provider. Servono un
protocollo coordinato e test di crash/replay prima di abilitare automazioni che
richiedano garanzie di consegna. Vedi l'architettura Link nella repository VillaCore.

Sul posto: mappa entita fisiche/zone, riavvio e perdita rete, consegna eventi in
entrambe le direzioni, emergenza/manuale, sensori/interblocchi, rete VLAN,
Proxmox/HAOS, UPS e restore completo. Solo dopo queste prove autorizzare comandi
su carichi reali. Il software Home Assistant non sostituisce le protezioni.

Come prodotto: al momento e candidabile a installazioni dedicate per cliente,
non a un database SaaS condiviso. Restano isolamento legacy, privacy per ruolo,
personalizzazione documenti, contratti canali/pagamenti e gestione aggiornamenti
per cliente. Questi limiti non vanno mascherati da un miglioramento grafico.
