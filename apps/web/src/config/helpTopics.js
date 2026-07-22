/**
 * Short, per-page tutorials shown by the Help ("i") button in the top bar.
 * Keep every topic concise: one-line intro + a few actionable steps.
 */

export const GENERAL = {
  title: "Guida rapida al portale",
  intro: "Prenotazioni, staff, costi, tariffe e smart building in un unico posto.",
  steps: [
    "Usa il menu a sinistra per spostarti tra le aree (su mobile aprilo con l'icona ☰).",
    "Premi Ctrl/⌘ + K per la ricerca rapida dei comandi.",
    "Il campanello in alto mostra gli alert smart aperti.",
    "Cambia tema chiaro/scuro con l'icona luna/sole.",
    "Questa icona “i” mostra sempre la guida della pagina in cui ti trovi.",
  ],
};

const HELP = {
  "/": {
    title: "Dashboard",
    intro: "Panoramica del mese: operatività di oggi e KPI economici.",
    steps: [
      "Le tessere in alto (arrivi, partenze, task, alert…) sono cliccabili e portano alla pagina relativa.",
      "Cambia mese/anno coi selettori in alto a destra; “Scarica report” esporta il CSV.",
      "I grafici mostrano provenienza ricavi e principali categorie di spesa.",
    ],
  },
  "/operations": {
    title: "Arrivi & Partenze",
    intro: "Check-in e check-out del giorno, con messaggi e stampa.",
    steps: [
      "Vedi arrivi e partenze previsti per oggi.",
      "Usa i template per contattare rapidamente gli ospiti.",
      "Stampa la scheda quando serve.",
    ],
  },
  "/bookings": {
    title: "Prenotazioni",
    intro: "Crea e gestisci le prenotazioni.",
    steps: [
      "“Nuova prenotazione” apre il form: unità, date, ospite, prezzo.",
      "Se non forzi il totale, viene calcolato dal calendario tariffe (o dalla tariffa base).",
      "Il sistema blocca le sovrapposizioni e rispetta il soggiorno minimo.",
      "Filtra per unità e stato di pagamento.",
    ],
  },
  "/calendar": {
    title: "Calendario occupazione",
    intro: "Occupazione mensile e tariffe per unità.",
    steps: [
      "Ogni pillola è una prenotazione, colorata per canale.",
      "Trascina una prenotazione (dal giorno di check-in) per spostarla.",
      "Nella timeline per unità vedi prezzo/notte e riepilogo tariffe del mese.",
      "Il “+” su un giorno crea una nuova prenotazione per quella data.",
    ],
  },
  "/tariffe-canali": {
    title: "Tariffe & Canali (Revenue)",
    intro: "Il centro revenue: tariffe, regole, consigli, comp-set, alert e canali iCal.",
    steps: [
      "Imposta la tariffa base e i guardrail min/max per ogni unità.",
      "Nel Calendario tariffe modifichi prezzo e soggiorno minimo per giorno; “Applica consigli” usa il motore (stagioni, weekend, occupazione, lead-time).",
      "Profili stagionali e regole lead-time modellano i prezzi consigliati.",
      "Comp-set: inserisci tariffe di mercato; gli alert segnalano prezzi fuori banda, notti orfane e occupazione bassa.",
      "Canali iCal: condividi l'URL di export con gli OTA e importa i loro calendari (anti overbooking).",
    ],
  },
  "/staff": {
    title: "Staff & Pulizie",
    intro: "Attività di staff e pulizie, generate anche dalle prenotazioni.",
    steps: [
      "Ogni prenotazione crea task automatici (check-in/out, pulizia, colazioni).",
      "Assegna i task e aggiornane lo stato.",
      "Per la vista giorno usa il Planner staff.",
    ],
  },
  "/staff-planner": {
    title: "Planner staff (giorno)",
    intro: "Vista giornaliera del carico di lavoro dello staff.",
    steps: [
      "Scorri i giorni per vedere i task pianificati.",
      "Controlla assegnatari e ore stimate.",
      "Segna i task completati.",
    ],
  },
  "/staff-anagrafica": {
    title: "Anagrafica staff",
    intro: "Registro dei membri dello staff.",
    steps: [
      "Aggiungi o modifica i membri.",
      "Imposta ruoli e assegnatari di default (usati per generare i task).",
    ],
  },
  "/business": {
    title: "Business & Analytics",
    intro: "Analisi economica mensile: ricavi, costi, profitto.",
    steps: [
      "Scegli il mese in alto.",
      "Consulta ricavi per canale/unità e le righe di costo.",
      "Esporta i dati in CSV.",
    ],
  },
  "/maintenance": {
    title: "Manutenzioni & Migliorie",
    intro: "Ticket di manutenzione della struttura.",
    steps: [
      "Apri un ticket con priorità e costo stimato.",
      "Aggiorna lo stato fino alla chiusura.",
    ],
  },
  "/expenses": {
    title: "Spese generali",
    intro: "Spese della struttura non legate alla singola prenotazione.",
    steps: [
      "Registra le spese per categoria.",
      "Confluiscono nel conto economico (pagina Business).",
    ],
  },
  "/units": {
    title: "Appartamenti",
    intro: "Le unità della struttura.",
    steps: [
      "Consulta e aggiorna i dati delle unità.",
      "La tariffa base si imposta qui e in Tariffe & Canali.",
    ],
  },
  "/properties": {
    title: "Proprietà",
    intro: "Portfolio proprietà e connessioni provider (multi-tenant).",
    steps: [
      "Gestisci le proprietà del tenant.",
      "Collega i provider smart alle proprietà.",
    ],
  },
  "/admin-control": {
    title: "Admin & Config",
    intro: "Amministrazione: utenti e impostazioni di default.",
    steps: [
      "Crea utenti e assegna i ruoli.",
      "Configura i default di staff e pricing.",
    ],
  },
  "/setup": {
    title: "Setup guidato",
    intro: "Procedura guidata per configurare la smart property.",
    steps: [
      "Segui i passi in ordine.",
      "Puoi interrompere e riprendere dove eri rimasto.",
    ],
  },
  "/smart": {
    title: "Smart building",
    intro: "Dispositivi, telemetria, alert e automazioni della struttura.",
    steps: [
      "Overview e Dashboard danno lo stato d'insieme.",
      "In Operations trovi le unità da attenzionare e i problemi aperti.",
      "Dispositivi, Alert e Automazioni gestiscono l'impianto smart.",
      "Nota: senza hardware collegato i dati sono simulati (modalità mock).",
    ],
  },
};

/** Resolve the best-matching topic for a pathname (params-aware), else GENERAL. */
export function resolveHelp(pathname) {
  if (HELP[pathname]) return HELP[pathname];
  if (pathname.startsWith("/smart")) return HELP["/smart"];
  if (pathname.startsWith("/units/")) return HELP["/units"];
  if (pathname.startsWith("/bookings/")) return HELP["/bookings"];
  return GENERAL;
}

export default HELP;
