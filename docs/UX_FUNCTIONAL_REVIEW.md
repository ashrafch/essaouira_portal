# Revisione funzionale e UX

Sviluppo e test: 2026-09-16. Chiusura e verifica avvio: 2026-09-17.
Ambito: interfaccia del Portal e flussi gestionali;
nessuna modifica a database, contratti VillaCore o comandi verso impianti.

## Interventi

- Home operativa: separazione fra Oggi e Andamento. Agenda ospiti ricercabile,
  arrivi/partenze, attivita del giorno, accesso al planner e stato struttura.
  Niente parete di KPI economici prima del lavoro da svolgere.
- Le metriche ospiti e i collegamenti filtrati usano la stessa selezione di
  prenotazioni confermate. Il contatore staff riguarda solo il giorno indicato,
  non tutte le attivita aperte nel database.
- Data operativa ricavata dal riepilogo server, condivisa con task e link.
  Se il riepilogo non risponde si usa la data del browser con avviso di errore.
- Aggiornamento manuale senza perdere ricerca o selezione arrivi/partenze.
  Le sezioni fallite mostrano indisponibilita, non un valore zero inventato.
- Andamento conserva ricavi, costi, risultato, occupazione, ADR, RevPAR,
  quota diretta, previsione 30 giorni, grafici e CSV. Le richieste economiche
  partono solo quando si apre la vista, nel rispetto del registro ruoli.
  Il mese non e piu vincolato a tre anni fissati nel codice.
- Prenotazioni: ricerca per ospite, contatti, unita e ID; viste arrivi,
  partenze, in casa e cancellate; filtro data e azzeramento filtri.
- Stato prenotazione distinto da pagamento. Le cancellate non occupano
  l'unita nel controllo visivo e non compaiono nel filtro Da incassare.
  La validazione autorevole rimane nel backend.
- Dettaglio e nuova prenotazione indirizzabili via URL. I collegamenti
  precedenti basati su router state vengono convertiti, evitando la perdita
  dell'intento durante le transizioni di pagina. Chiusura e salvataggio
  rimuovono l'intento per non riaprire il form.
- Rimossa l'animazione di uscita delle pagine che poteva rimontare il nuovo
  contenuto e azzerare lo stato del form. L'apertura da link viene gestita
  una sola volta, anche se il salvataggio aggiorna prima i dati e poi l'URL.
- Etichette associate ai campi del form; navigazione da tastiera nei
  selettori segmentati. Pulsanti della barra mobile con area di 44px.
- Tema scuro su superfici neutre, colori di stato distinti; barra superiore
  meno affollata e nessun fondale decorativo. Le sezioni della home non sono
  contenitori annidati. Il badge di rete non pretende di misurare la salute HA.
- Griglia mobile con colonna comprimibile anche a 320px. Il controllo
  overflow confronta scrollWidth con clientWidth: innerWidth puo crescere
  con lo zoom automatico del browser mobile e nascondere il problema.

## Percorsi diretti

| Percorso | Uso |
| --- | --- |
| `/` | Centro operativo |
| `/?view=performance` | Rendiconto mensile |
| `/bookings?view=arrivals&date=2026-09-16` | Arrivi della data |
| `/bookings?view=departures&date=2026-09-16` | Partenze della data |
| `/bookings?view=in-house&date=2026-09-16` | Ospiti confermati in casa |
| `/bookings?view=cancelled` | Prenotazioni cancellate |
| `/bookings?booking_id=123` | Dettaglio prenotazione, con autorizzazione esistente |
| `/bookings?new_booking=1&date=2026-09-16` | Nuova prenotazione con data iniziale |

Testo di ricerca e contatti ospite non vengono salvati nell'URL o nel browser.
I filtri locali unita/pagamento non sono persistenti fra ricaricamenti.

## Verifica ripetibile

Usare esclusivamente uno stack di prova generato da
`python scripts/verify-production.py --browser --keep`, mai un database reale.
Lo script stampa URL, credenziali e comandi di pulizia. Vedi
[DEPLOYMENT.md](DEPLOYMENT.md) per avvio locale e produzione.

```powershell
cd apps/web
npm run lint
npm run test:run
$env:E2E_DISPOSABLE = 'true'
$env:E2E_BASE_URL = 'http://127.0.0.1:PORTA_STAMPATA_DAL_VERIFICATORE'
npm run test:e2e
```

`production.spec.mjs` controlla tutte le route in light/dark su desktop/mobile,
errori JavaScript, HTTP 5xx, overflow e download PDF.
`workbench.spec.mjs` crea dati sintetici e verifica agenda, aggiornamento,
collegamento al dettaglio, modifica realmente persistita, filtri e reload,
creazione nelle date di una cancellata, grafico mensile, CSV, mese futuro,
errore parziale e recupero. Include screenshot e controllo home a 320px.
I test unitari coprono selezioni, sovrapposizioni, permessi e stati della home.

### Esito locale

- ESLint senza errori; 74 test Vitest superati in 12 file.
- Build di produzione Vite eseguita nell'immagine Docker, avvio web healthy.
- Playwright: 6 prove superate sull'ultima build (4,9 minuti).
  Include 29 route nei due temi, desktop 1440x1000 e mobile 390x844,
  piu i percorsi gestionali e di recupero descritti sopra.
- Home a 320x740: clientWidth, scrollWidth e larghezza del main pari a 320px;
  screenshot desktop/mobile e grafici mensili ispezionati.
- API `/api/health`: `{"status":"ok"}`; web/backend/PostgreSQL healthy
  alla ripresa del 17 settembre. Database e API non esposti sull'host.
- Nessuna modifica alla repository VillaCore in questa fase. Nessun comando
  inviato agli impianti e nessuna nuova attestazione di commissioning sul posto.

## Calendario affollato - 17 settembre 2026

- Griglia mensile con celle da 160px, colonne vincolate e massimo tre
  prenotazioni visibili. Ospite e appartamento su due righe separate,
  nomi lunghi abbreviati solo nell'anteprima, canale distinto per colore.
- Il numero del giorno e `+N altre` aprono l'elenco completo e scorrevole:
  nomi integrali, date, canale e stato; apertura diretta della prenotazione.
  Intestazione e azione nuova prenotazione restano visibili durante lo scroll.
- Cancellate escluse da griglia, agenda mobile e occupazione della timeline.
  Opzioni e prenotazioni in attesa mantengono il comportamento precedente.
  Check-out esclusivo, conteggio notti intero anche al cambio dell'ora.
- Trascinamento solo dal check-in e solo per utenti abilitati online;
  nuova prenotazione con data/unita precompilate e URL persistente.
- Sei test unitari dedicati: overflow, dettaglio completo, tastiera/focus,
  permessi, cache offline e trascinamento. Suite frontend: 80 test in 13 file.
  Una riesecuzione sotto carico ha avuto un timeout nel test preesistente
  `Bookings.test.jsx`; la suite completa rieseguita con `--maxWorkers=1`
  e passata (80/80), senza modificare o allentare le asserzioni.
- `e2e/calendar.spec.mjs`: fixture intercettate nel browser, dieci prenotazioni
  con nomi lunghi, cancellata, griglia a 1440/1100/820px e agenda a 390/320px,
  light/dark, geometria costante, hover, dettaglio, modifica e creazione.
  Il test drag verifica payload e aggiornamento UI con risposta API simulata:
  non costituisce una nuova verifica della persistenza del trascinamento.
- Ricostruita e riavviata solo l'immagine web dello stack QA Docker isolato;
  backend, dati della villa e Home Assistant non modificati.

## Limiti e prossime priorita

- Questa revisione non certifica ogni combinazione di form, ruolo e stato.
  Ampliare i percorsi E2E alla persistenza del drag calendario, ripianificazione staff,
  manutenzioni, import iCal e procedure di emergenza.
- La data server usa ancora la configurazione temporale del backend:
  definire in modo trasversale il fuso della struttura, soprattutto per
  operatori remoti e cambio di giornata. La home non introduce un nuovo fuso.
- Il riepilogo legacy include opzioni/in attesa nei conteggi prenotazioni;
  la home usa solo confermate per coerenza con agenda e filtro destinazione.
  Uniformare esplicitamente la semantica dei badge legacy in una modifica API
  dedicata, con test, senza cambiare qui la prenotabilita delle opzioni.
- Liste ancora caricate integralmente: introdurre paginazione/ricerca server
  con crescita del numero di strutture, senza duplicare le regole operative.
- Completare accessibilita di drawer mobile, vecchi modali e planner;
  una verifica visiva non equivale a un audit WCAG.
- Modulo prenotazione ancora lungo: raggruppamento progressivo dei dettagli
  economici e validazioni per campo sono il prossimo intervento mirato.
- I limiti di produzione, privacy e consegna comandi HA restano quelli di
  [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md). Nessuna attuazione fisica
  e nessuna modifica ai segreti della villa durante questo giro.
