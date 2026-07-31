# Prompt pronti per il repository VillaCore

Ogni blocco qui sotto va incollato in una sessione aperta **su
`C:\Users\chouikha\Desktop\Ashraf\SviluppoPersonale\VillaCore`**, non su questo
repository. Sono scritti per rispettare l'`AGENTS.md` di VillaCore: una cosa per
volta, ADR quando l'architettura cambia, `CHECKLIST.md` aggiornata solo dopo una
validazione eseguita, nessun segreto committato, e i confini di sicurezza fisica
intatti.

Il contratto che implementano è descritto in [`VILLACORE_LINK.md`](VILLACORE_LINK.md).

## Stato al 31 luglio 2026

VillaCore ha completato le milestone 0→8 (villa, A1, piscina, giardino, cancello
ed esterni, energia) e sta lavorando alla 9 (contratto PLC). Il portale **classifica
già tutte le 290 entità del registry senza modifiche di codice**: le milestone
future vengono assorbite dal profilo e dal manifest.

Quindi questi prompt **non servono per far funzionare la lettura**, che funziona
già. Servono per: rendere permanente il trasporto (P1), attivare il push in tempo
reale (P2–P5), e colmare le lacune funzionali che il portale non può inventarsi
(P6–P9).

| # | Prompt | Serve per | Dipendenze |
| --- | --- | --- | --- |
| P1 | Rete `villacore_link` + porta mock-api | Trasporto permanente | nessuna |
| P2 | Package `portal_link.yaml` (rest_command, kill switch, stato) | Base del push | P1 |
| P3 | `sensor.portal_link_manifest` | Auto-discovery dichiarata | P2 |
| P4 | Script workflow parametrizzati | Contesto prenotazione + anti-loop | P2 |
| P5 | Eventi impianti (piscina, giardino, cancello, energia, PLC) | Alert e ticket automatici | P2 |
| P6 | Entità A1 mancanti (motion, lock, leak, cover, umidità) | Vacancy checkout, serratura | nessuna |
| P7 | Profilo clima eco/away | Energy saver pack | P6 consigliato |
| P8 | Handshake housekeeping/manutenzione | Allineamento pulizie e blocchi | P2 |
| P9 | Generatore appartamenti A2–A6 | Mappatura 1:1 con le 6 unità | nessuna |

Ordine consigliato: **P1 → P2 → P3 → P4 → P5**, poi P6 → P7 → P8, e P9 quando
serve scalare. Dopo ogni prompt, sul portale: apri **Link VillaCore**, premi
*Sincronizza catalogo* e controlla che "Non classificate" resti a zero.

---

## P1 — Rete condivisa `villacore_link` e porta del mock-api

```text
Obiettivo: rendere permanente il collegamento di rete verso il portale di
management (progetto essaouira_portal) e togliere un conflitto di porta.

Contesto: il portale gira in un suo stack Docker Compose e raggiunge Home
Assistant per nome di servizio su una rete Docker esterna condivisa chiamata
`villacore_link`. Oggi il collegamento viene creato a runtime con
`docker network connect`, quindi si perde ogni volta che il container HA viene
ricreato.

Modifiche richieste:
1. In docker-compose.yml, aggiungi al servizio `home-assistant` la rete
   `villacore_link` (oltre a quelle attuali), dichiarandola in fondo come:
       networks:
         villacore_link:
           external: true
           name: ${VILLACORE_LINK_NETWORK:-villacore_link}
   La rete NON deve essere `internal`, perché il backend del portale vi si
   collega dall'esterno dello stack.
2. Poiché la rete è esterna, documenta in README.md che va creata una volta con
   `docker network create villacore_link` (oppure eseguendo
   `scripts/link-villacore.ps1` dal portale) e che senza di essa lo stack non
   parte. Se preferisci evitare questa dipendenza per chi non usa il portale,
   metti la rete in un overlay opzionale `docker-compose.portal.yml` invece che
   nel file base: scegli tu, ma spiega la scelta.
3. Il servizio `mock-api` pubblica 127.0.0.1:8000, che è la stessa porta della API
   del portale. Cambia il default di MOCK_API_PORT da 8000 a 8010 in
   .env.example (e in .env se presente), lasciando la porta interna a 8000.
4. Aggiorna la tabella degli endpoint locali in README.md.

Validazione: `docker compose --env-file .env.example config --quiet` deve
passare, e dopo `docker network create villacore_link` lo stack deve avviarsi
sano. Aggiorna CHECKLIST.md solo dopo aver verificato entrambe.
```

---

## P2 — Package `portal_link.yaml`: canale di uscita verso il portale

```text
Obiettivo: dare a VillaCore un canale unico e sicuro per notificare al portale di
management gli eventi operativi, senza che un portale offline possa mai bloccare
l'automazione locale.

Crea `home-assistant/packages/portal_link.yaml` con:

1. Segreti in secrets.yaml (aggiungi le chiavi a secrets.yaml.example con
   placeholder CHANGE_ME, mai valori reali):
     portal_base_url: http://backend:8000
     portal_ingest_token: CHANGE_ME_PORTAL_INGEST_TOKEN

2. rest_command.portal_link_event:
     url: "{{ portal_base_url }}/smart/link/events"   (usa !secret)
     method: POST
     timeout: 5
     headers:
       X-Smart-Ingest-Token: !secret portal_ingest_token
       Content-Type: application/json
     payload: un template JSON che accetta i campi:
       event, entity_id, zone, kind, severity, reason, correlation_id,
       booking_ref, state, occurred_at
     e produce sempre:
       {"schema": "villacore.event.v1", "site": "<VILLACORE_SITE_ID o dev>", ...}
     Ometti i campi non valorizzati invece di mandare stringhe vuote.

3. script.portal_notify_event: wrapper unico con `fields` per gli stessi
   parametri, mode: queued (max 25). Deve:
   - non fare nulla se input_boolean.portal_link_enabled è off (kill switch);
   - chiamare rest_command.portal_link_event;
   - in caso di errore, scrivere il messaggio in
     input_text.portal_link_last_error e incrementare
     counter.portal_link_failures, SENZA propagare l'errore: nessuna automazione
     locale deve fallire perché il portale non risponde.

4. Helper e diagnostica:
   - input_boolean.portal_link_enabled (initial: on) — kill switch;
   - input_text.portal_link_last_error;
   - counter.portal_link_failures;
   - input_datetime.portal_link_last_success;
   - template sensor.portal_link_status con stato ok | degraded | disabled e
     attributi last_error, failures, last_success.
   Escludi queste entità dalla dashboard ospite.

5. Registra ogni entità in config/entity-registry.yaml con status: implemented.

Vincoli: nessun segreto nel package; il timeout deve essere esplicito; il canale
deve essere fail-safe (portale assente = solo log locale).

Validazione: `scripts/validate.ps1` e `scripts/check-home-assistant.ps1` devono
passare. Verifica a runtime chiamando script.portal_notify_event a mano con il
kill switch on e poi off, e controlla sensor.portal_link_status nei due casi.
Aggiorna CHECKLIST.md solo dopo la verifica runtime.
```

> Nota: il portale espone `POST /smart/link/events` e risponde `200` con
> `accepted: false` quando non riconosce l'entità (tipicamente perché non ha
> ancora fatto una sincronizzazione). Un `401` significa token sbagliato.

---

## P3 — `sensor.portal_link_manifest`: dichiarare il contratto

```text
Obiettivo: far dichiarare a VillaCore stesso quali zone e quali capability
espone, così il portale di management non deve inseguire ogni milestone con
modifiche di codice.

Aggiungi a `home-assistant/packages/portal_link.yaml` un template sensor
`sensor.portal_link_manifest` con stato "ok" e questi attributi:

  contract_version: villacore.link.v1
  site: <site id>
  zones:
    villa:   { kind: unit,     display_name: Villa }
    a1:      { kind: unit,     display_name: Appartamento A1 }
    pool:    { kind: facility, display_name: Piscina, machine: filtration }
    garden:  { kind: facility, display_name: Giardino e irrigazione, machine: irrigation }
    outdoor: { kind: facility, display_name: Esterni e cancello, machine: gate }
    energy:  { kind: facility, display_name: Energia, subject_zones: true }
    plc:     { kind: facility, display_name: PLC e sicurezza }
    villa_core: { kind: common, display_name: Sistema VillaCore }
  capabilities:
    workflow.checkin:   [script.a1_check_in]
    workflow.checkout:  [script.a1_check_out]
    workflow.mark_ready:[script.a1_mark_ready]
    facility.safe_off:  [script.pool_filtration_safe_off, script.garden_irrigation_safe_off]
    facility.alarm_reset:[script.pool_alarm_reset, script.garden_alarm_reset, script.outdoor_gate_alarm_reset]
    setting.energy_price:[input_number.energy_price_per_kwh]
  (aggiungi le altre che ritieni utili: sono binding espliciti, non un elenco
   esaustivo — il portale completa con le sue regole di naming)

Requisiti:
- `kind` ammette solo unit | facility | common;
- `subject_zones: true` va usato per le zone di misura le cui entità descrivono
  altre zone (energy: `sensor.energy_a1_daily` misura a1, non energy);
- genera gli attributi dalle stesse fonti già usate per
  config/entity-registry.yaml, così non nascono due verità;
- il sensore deve restare valido anche se una zona non è ancora implementata.

Validazione: check_config, e verifica che il sensore esponga gli attributi
attesi. Sul portale: Link VillaCore deve mostrare "Manifest VillaCore" verde con
il contract_version.
```

---

## P4 — Script workflow parametrizzati con contesto prenotazione

```text
Obiettivo: permettere al portale di management di passare il contesto della
prenotazione ai workflow ospite, e di riconoscere la conferma del proprio stesso
comando (protezione anti-loop).

Modifica in `home-assistant/packages/apartment_a1.yaml`:

1. script.a1_check_in acquisisce `fields` opzionali:
     booking_ref (testo), guest_name (testo), guests (numero),
     target_temp_c (numero), arrival_time (testo), correlation_id (testo),
     source (testo)
   Comportamento:
   - se booking_ref è valorizzato, salvalo in input_text.a1_booking_ref (nuovo
     helper) e guests in input_number.a1_guest_count (nuovo helper);
   - se target_temp_c è valorizzato e compreso tra min_temp e max_temp del
     clima, usalo come temperatura target al posto del default;
   - MANTIENI invariate le condizioni di sicurezza attuali: il clima parte solo
     se la finestra è chiusa e la temperatura è valida. I campi non devono poter
     aggirare quei controlli;
   - alla fine chiama script.portal_notify_event con
     event: unit.checkin.completed, zone: a1, kind: unit,
     e ripassa correlation_id e booking_ref ricevuti.

2. Stessa cosa per script.a1_check_out (event: unit.checkout.completed) e
   script.a1_mark_ready (event: unit.ready), con i campi correlation_id e source.

3. Le automazioni di sicurezza esistenti notificano il portale:
   - a1_climate_window_open_safety -> event: unit.climate.safety_stop,
     reason: window_open
   - a1_climate_temperature_unavailable -> event: unit.climate.safety_stop,
     reason: sensor_invalid
   - a1_devices_offline -> event: unit.devices.unavailable
   - aggiungi un'automazione di ripristino che invia unit.devices.recovered
     quando binary_sensor.a1_devices_available torna on per 30 secondi.
   Queste NON portano correlation_id: non sono conseguenza di un comando del
   portale.

4. Registra i nuovi helper in config/entity-registry.yaml e aggiungi gli scenari
   di simulazione corrispondenti se mancanti.

Vincolo importante: correlation_id va ripassato **identico**. Il portale lo usa
per capire che un evento è l'eco del proprio comando e non ri-triggerare le
regole: se lo modifichi si crea un ciclo.

Validazione: check_config, test statici, e verifica runtime chiamando
script.a1_check_in dalla dashboard con e senza i campi. Aggiorna CHECKLIST.md
dopo la verifica.
```

---

## P5 — Eventi degli impianti (piscina, giardino, cancello, energia, PLC)

```text
Obiettivo: notificare al portale di management ciò che richiede intervento umano
sugli impianti condivisi, così che diventi alert e ticket di manutenzione.

Per ciascun impianto già implementato (piscina M5, giardino M6, cancello ed
esterni M7, energia M8, PLC M9) aggiungi chiamate a script.portal_notify_event
nelle automazioni esistenti, senza modificarne la logica di sicurezza:

- ogni automazione di arresto di sicurezza -> event: facility.safety_stop con
  `reason` fra: no_flow | thermal | timeout | consent_lost | rain | leak |
  obstacle | max_runtime
- allarme che si alza  -> event: facility.alarm.raised, severity: critical
- allarme riarmato     -> event: facility.alarm.cleared
- cambio di stato della macchina -> event: facility.state.changed, severity: info
  (mettilo in throttle: solo su transizione effettiva, non su ogni tick)
- ciclo completato     -> event: facility.cycle.completed
- dispositivi impianto non disponibili / ripristinati ->
  facility.devices.unavailable / facility.devices.recovered
- perdita acqua rilevata (villa, giardino, futuro bagno A1) ->
  event: water.leak.detected, severity: critical
- energia: anomalia attiva -> facility.alarm.raised su zona energy
- PLC: watchdog non ok o contratto incompatibile ->
  event: facility.safety_stop, zone: plc, reason: timeout (watchdog) oppure
  un reason nuovo che documenti nel contratto

Ogni chiamata deve passare `zone` (pool | garden | outdoor | energy | plc),
`kind: facility` e l'`entity_id` più rappresentativo dell'evento (di norma il
sensore di stato o l'allarme dell'impianto).

Vincoli: nessuna modifica alle condizioni di sicurezza, agli interblocchi o ai
timeout; la notifica è l'ultima azione della sequenza e non deve poterne impedire
l'esecuzione.

Validazione: esegui gli scenari di simulazione esistenti (no_flow piscina,
pioggia e perdita giardino, ostacolo cancello) e verifica che il portale apra
l'alert con la causa corretta e la chiuda al ripristino.
```

---

## P6 — Entità A1 mancanti per l'operatività alberghiera

```text
Obiettivo: colmare le lacune che impediscono al portale di management di
validare il checkout e di gestire l'accesso ospite. Oggi A1 ha porta d'ingresso,
finestra, luci, clima, potenza ed energia, ma non ha presenza, serratura, perdita
acqua né tapparelle.

Aggiungi al pilota A1 (package apartment_a1.yaml, template appartamento,
simulatore, scenari, dashboard, registry, test):

1. Presenza / occupazione:
   - binary_sensor.a1_living_motion (device_class: motion)
   - binary_sensor.a1_bedroom_1_motion, binary_sensor.a1_bedroom_2_motion
   - template binary_sensor.a1_occupancy_detected che aggrega i tre con un
     ritardo di caduta configurabile (input_number.a1_occupancy_clear_minutes,
     default 15)
   Serve al portale per validare "unità vuota" al checkout.

2. Perdita acqua:
   - binary_sensor.a1_bathroom_water_leak (device_class: moisture)
   - includilo nella logica di allarme perdite già presente per la villa, con lo
     stesso principio: notifica, nessun controllo valvola software.

3. Serratura:
   - lock.a1_entry, simulata via MQTT, con stati locked/unlocked
   - input_text.a1_access_code come segnaposto del codice ospite (nessun codice
     reale nel repository; documenta che la gestione del codice reale arriverà
     con l'hardware)
   - script.a1_lock_entry e script.a1_unlock_entry con notifica al portale
   - documenta esplicitamente che la serratura software non sostituisce la
     chiusura meccanica.

4. Comfort:
   - cover.a1_living_shutter (come le tapparelle villa)
   - sensor.a1_living_humidity (device_class: humidity, state_class: measurement)

5. Aggiorna config/apartment-template.yaml aggiungendo le capability
   corrispondenti (motion, leak, lock, cover, humidity) così che gli
   appartamenti futuri le ereditino, e aggiorna la dashboard ospite esponendo
   solo comfort/luci/aperture come già previsto dall'ADR 0011.

Validazione: nuovi discovery MQTT verificati live, scenari deterministici per
occupazione e perdita bagno, check_config, test statici. Aggiorna CHECKLIST.md.

Nota per il portale: finché questo prompt non è applicato, il portale dichiara
"non disponibile" la validazione vacancy al checkout e i comandi serratura,
invece di simularli.
```

---

## P7 — Profilo clima eco/away e guardia energia

```text
Obiettivo: alimentare l'energy saver pack del portale con un comportamento eco
reale, definito dove vivono le protezioni.

Aggiungi ad A1 (e al template appartamento):
1. input_number.a1_setpoint_comfort (default 21) e
   input_number.a1_setpoint_eco (default 17), con min/max coerenti con il clima.
2. script.a1_climate_eco: porta il clima al setpoint eco senza spegnerlo;
   script.a1_climate_comfort: riporta al setpoint comfort, ma solo se le
   condizioni di sicurezza attuali sono soddisfatte (finestra chiusa, sensore
   valido).
3. Automazione: se l'unità risulta non occupata per N minuti
   (input_number.a1_vacancy_eco_minutes, default 30) e la modalità ospite è
   attiva, passa a eco e notifica il portale con event: state.changed e
   zone: a1. Richiede binary_sensor.a1_occupancy_detected (prompt P6).
4. Guardia energia: se sensor.a1_power supera una soglia
   (input_number.a1_power_alert_w) per 10 minuti, notifica il portale con
   event: facility.alarm.raised, zone: a1, kind: unit, reason: power_anomaly.
5. Registry, scenari, dashboard e test come da prassi.

Vincolo: eco non deve mai riattivare il clima quando un'automazione di sicurezza
lo ha fermato. La riattivazione resta manuale, come oggi.

Validazione: scenario deterministico "unità vuota 30 minuti -> eco" e
"riattivazione bloccata dopo arresto di sicurezza".
```

---

## P8 — Handshake pulizie e blocco manutenzione

```text
Obiettivo: allineare lo stato pulizie e il blocco manutenzione tra PMS e
edificio, senza duplicare la verità.

1. input_select.a1_housekeeping con opzioni: Da fare | In corso | Fatto
   (initial: Fatto). Al check-out passa automaticamente a "Da fare".
2. script.a1_housekeeping_set con field `status`, che valida l'opzione e notifica
   il portale con event: unit.housekeeping.changed, zone: a1, kind: unit.
3. input_boolean.a1_maintenance_lock: quando è on,
   - script.a1_check_in rifiuta l'esecuzione (con notifica locale che spiega il
     motivo) e notifica il portale con event: state.changed e
     reason: maintenance_lock;
   - la dashboard ospite mostra l'unità come non disponibile.
4. Collega il blocco al binary_sensor.villa_core_maintenance_active esistente
   solo in lettura: la modalità manutenzione di sito non deve sovrascrivere il
   blocco per singola unità.
5. Registry, scenari, dashboard, test.

Vincolo di confine: il PMS resta proprietario del ciclo di vita del task di
pulizia. Questi helper riflettono e comunicano, non decidono la pianificazione.

Validazione: scenario "check-in con maintenance_lock attivo viene rifiutato" e
verifica che il portale riceva l'evento.
```

---

## P9 — Generatore appartamenti A2–A6

```text
Obiettivo: portare da 1 a 6 gli appartamenti, così che le sei unità del portale
di management abbiano una controparte fisica 1:1.

Da config/apartment-template.yaml (due camere) genera A2, A3, A4, A5, A6
replicando quanto già validato su A1:
1. Package per appartamento oppure un package parametrico: scegli l'approccio più
   manutenibile e spiega la scelta in un ADR (il template esiste proprio per non
   duplicare a mano).
2. Per ogni appartamento: luci open space e due camere, contatto porta ingresso,
   contatto finestra, temperatura, clima con le stesse protezioni di A1,
   potenza ed energia, disponibilità dispositivi, stato soggiorno, modalità
   ospite, workflow check-in/check-out/pronto, più le entità aggiunte con P6 se
   già applicato.
3. Naming rigorosamente `<domain>.a<N>_<function>`, coerente con l'ADR 0007: il
   portale classifica per prefisso di zona e riconosce a2..a6 senza modifiche.
4. Simulatore: estendi i dispositivi e mantieni identificatori stabili e seed
   deterministico.
5. Energia: aggiungi sensor.energy_a<N>_daily coerente con la milestone 8, così
   il portale attribuisce i consumi alla unità giusta.
6. Registry completo, dashboard proprietario e dashboard ospite per unità,
   scenari, test.

Validazione: conteggio discovery MQTT atteso, check_config, runtime sano,
scenari check-in/out per almeno due appartamenti nuovi. Aggiorna CHECKLIST.md e
ROADMAP.md (questo è il cuore della milestone 12).

Nota per il portale: dopo questo prompt, apri Link VillaCore, sincronizza e
associa nella mappa zone a2..a6 alle unità Unit B..Unit F.
```

---

## P10 — ADR e documentazione del link

```text
Obiettivo: documentare in VillaCore il contratto verso il portale, così che le
due repository dichiarino la stessa cosa.

1. Scrivi docs/decisions/0012-portal-link.md con:
   - contesto: due sistemi distinti (building OS e business OS) e perché non si
     fondono;
   - decisione: contratto villacore.link.v1, push via rest_command autenticato a
     token, manifest per l'auto-discovery, correlation_id per l'anti-loop;
   - conseguenze: VillaCore resta proprietario di stati macchina e interblocchi;
     il portale non comanda mai aggirando una protezione; un portale offline non
     degrada l'automazione locale;
   - alternative scartate: MQTT verso il portale (accoppiamento più stretto,
     nessun vantaggio qui) e polling puro dal portale (latenza sugli allarmi).
2. Scrivi docs/architecture/portal-link.md con la tabella degli eventi, i campi
   dell'envelope, l'elenco delle capability dichiarate nel manifest e la
   procedura di rotazione del token.
3. Aggiorna docs/decisions/README.md, AGENTS.md (sezione confini: aggiungi il
   portale di management come consumatore di eventi) e README.md.
4. Aggiungi a CHECKLIST.md una sezione "Portal link" con le caselle
   corrispondenti ai prompt applicati, spuntate solo dopo validazione.

Vincolo: nessun token o URL reale nella documentazione, solo placeholder.
```

---

## Dopo aver applicato i prompt

Sul portale, in quest'ordine:

1. `python scripts/get_villacore_token.py` — crea il token HA e lo scrive in `.env`.
2. `scripts/link-villacore.ps1 -Token "<token>"` — verifica rete e token.
3. Pagina **Link VillaCore** → *Sincronizza catalogo*, poi controlla che
   "Non classificate" sia zero e che il manifest risulti presente.
4. Mappa zone: associa `villa` e `a1` (e in seguito `a2..a6`) alle unità PMS.
5. Pagina **Impianti e aree comuni**: verifica stato, allarmi e, a fine mese,
   *Registra costi del mese*.
6. Su un'unità: **Workflow edificio** → Check-in, e controlla che l'evento di
   conferma compaia nella timeline dell'unità.

Se una capability risulta non disponibile, il portale lo dice esplicitamente
invece di simularla: è il segnale che il prompt corrispondente non è ancora stato
applicato.
