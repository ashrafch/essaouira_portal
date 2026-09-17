import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, CheckCheck, ChevronRight, ClipboardList, Plus, RefreshCw, Wrench, Radio, TriangleAlert, Users } from "lucide-react";
import { getStaffTasks, getBookings, getUnits, getTodayAlerts, getDashboardSummary } from "../services/api";
import { Button, SegmentedToggle } from "../components/ui";
import MonthOverview from "../components/dashboard/MonthOverview";
import { canAccessPath, canAccessRoute, canEditOperations, getRole } from "../config/rbac";
import { loadSections } from "../services/loadSections";
import { formatISO } from "../utils/dateUtils";
import { filterBookings } from "../utils/bookingViews";
import "./workbench.css";

const TASK_LABELS = { checkin: "Check-in", checkout: "Check-out", cleaning: "Pulizia", maintenance: "Manutenzione", inspection: "Ispezione" };

function Dashboard() {
  const role = getRole();
  const canReadBusiness = canAccessRoute("business", role);
  const canReadStaff = canAccessRoute("staff", role);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = canReadBusiness && params.get("view") === "performance" ? "performance" : "today";
  const [period, setPeriod] = useState(() => formatISO(new Date()).slice(0, 7));
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ data: {}, failed: [] });
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(null);
  const [agendaView, setAgendaView] = useState("arrivals");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Use the server's operational date for both task queries and booking links.
      const snapshot = await loadSections({ riepilogo: getDashboardSummary });
      const date = snapshot.data.riepilogo?.date || formatISO(new Date());
      const sections = await loadSections({
        prenotazioni: getBookings, unita: getUnits, alert: getTodayAlerts,
        attivita: () => canReadStaff ? getStaffTasks({ date }) : null,
      });
      if (cancelled) return;
      setResult({ data: { ...snapshot.data, ...sections.data, date }, failed: [...snapshot.failed, ...sections.failed] });
      setLoading(false);
      setUpdated(new Date());
    }
    load();
    return () => { cancelled = true; };
  }, [refresh, canReadStaff]);

  const { riepilogo: summary, prenotazioni: bookings, unita: units, attivita: tasks, alert: alerts, date } = result.data;
  const today = date || formatISO(new Date());
  const unitMap = Object.fromEntries((units || []).map(unit => [unit.id, unit]));
  const agenda = filterBookings(bookings || [], { today, view: agendaView, query }, unitMap);
  const activeTasks = (tasks || []).filter(task => task.status !== "cancelled");
  const pendingTasks = activeTasks.filter(task => !["done", "completed"].includes(task.status));
  const completed = activeTasks.length - pendingTasks.length;
  const bookLink = selected => `/bookings?view=${selected}&date=${today}`;
  const stats = [
    { label: "Arrivi", value: bookings ? filterBookings(bookings, { today, view: "arrivals" }).length : null, to: bookLink("arrivals"), icon: <ArrowDownLeft size={18} />, tone: "info" },
    { label: "Partenze", value: bookings ? filterBookings(bookings, { today, view: "departures" }).length : null, to: bookLink("departures"), icon: <ArrowUpRight size={18} />, tone: "accent" },
    { label: "In casa", value: bookings ? filterBookings(bookings, { today, view: "in-house" }).length : null, to: bookLink("in-house"), icon: <Users size={18} />, tone: "primary" },
    { label: "Attivita aperte oggi", value: tasks ? pendingTasks.length : null, to: `/staff-planner?date=${today}`, icon: <ClipboardList size={18} />, tone: "warning" },
  ].filter(item => canAccessPath(item.to, role));
  const health = [
    { label: "Manutenzioni aperte", value: summary?.maintenance_open, to: "/maintenance", icon: <Wrench size={18} /> },
    { label: "Alert smart", value: summary?.smart?.alerts_open, to: "/smart-alerts", icon: <TriangleAlert size={18} /> },
    { label: "Unita da verificare", value: summary?.smart?.units_needing_attention, to: "/smart-operations", icon: <ClipboardList size={18} /> },
    { label: "Dispositivi online", value: summary?.smart ? `${summary.smart.devices_online}/${summary.smart.devices_total}` : null, to: "/smart-devices", icon: <Radio size={18} /> },
  ].filter(item => canAccessPath(item.to, role));

  return <div className="workbench">
    <header className="workbench__header">
      <div><p className="workbench__date">{new Date(`${today}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p><h1>Centro operativo</h1></div>
      <div className="workbench__actions">
        <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Aggiorna dashboard" title="Aggiorna" loading={loading} onClick={() => setRefresh(value => value + 1)} />
        {canEditOperations(role) && <Button icon={<Plus size={16} />} onClick={() => navigate(`/bookings?new_booking=1&date=${today}`)}>Nuova prenotazione</Button>}
      </div>
    </header>
    <div className="workbench__viewbar">
      {canReadBusiness ? <SegmentedToggle ariaLabel="Vista dashboard" value={view} onChange={value => setParams(value === "today" ? {} : { view: value })}
        options={[{ value: "today", label: "Oggi" }, { value: "performance", label: "Andamento" }]} /> : <h2>Oggi</h2>}
      <span className="workbench__freshness" role="status">{loading ? "Aggiornamento..." : `${result.failed.length ? "Dati parziali" : "Aggiornato"} alle ${updated?.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`}</span>
    </div>
    {view === "performance" ? <MonthOverview period={period} onPeriodChange={setPeriod} refresh={refresh} /> : <div className="workbench__view" aria-busy={loading}>
      {result.failed.length > 0 && <p role="alert" className="workbench__error">Dati non disponibili: {result.failed.join(", ")}. Riprova con Aggiorna.</p>}
      <div className="workbench__metrics">
        {stats.map(item => <Link key={item.label} to={item.to} className={`workbench__metric workbench__metric--${item.tone}`}>
          <span className="workbench__metric-label">{item.icon}{item.label}<ChevronRight size={14} /></span>
          <strong>{item.value ?? (loading ? "..." : "N/D")}</strong>
        </Link>)}
      </div>
      <div className="workbench__columns">
        <section className="workbench__section" aria-label="Agenda ospiti">
          <div className="workbench__section-heading"><h2><CalendarDays size={18} /> Agenda ospiti</h2><Link to={`/operations?date=${today}`}>Operazioni <ChevronRight size={14} /></Link></div>
          <div className="workbench__agenda-toolbar">
            <SegmentedToggle ariaLabel="Movimenti ospiti" value={agendaView} onChange={setAgendaView} options={[{ value: "arrivals", label: "Arrivi" }, { value: "departures", label: "Partenze" }]} />
            <input type="search" aria-label="Cerca in agenda" placeholder="Cerca ospite o unita" value={query} onChange={event => setQuery(event.target.value)} />
          </div>
          {!bookings ? <p className="workbench__empty">{loading ? "Caricamento agenda..." : "Agenda non disponibile."}</p> : agenda.length === 0 ? <p className="workbench__empty">{query ? "Nessun ospite corrisponde alla ricerca." : agendaView === "arrivals" ? "Nessun arrivo previsto oggi." : "Nessuna partenza prevista oggi."}</p> : <ul className="workbench__list">
            {agenda.map(booking => <li key={booking.id}><Link className="workbench__row" to={`/bookings?booking_id=${booking.id}`}>
              <span className={`workbench__movement workbench__movement--${agendaView}`} aria-hidden="true">{agendaView === "arrivals" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
              <span className="workbench__row-main"><strong>{booking.guest_name}</strong><small>{unitMap[booking.unit_id]?.name || `Unita #${booking.unit_id}`} · {(booking.num_adults || 0) + (booking.num_children || 0)} ospiti</small></span>
              <span className="workbench__row-meta">{agendaView === "arrivals" ? booking.estimated_arrival_time?.slice(0, 5) || "Orario da definire" : booking.has_late_checkout ? "Late check-out" : "Check-out"}</span><ChevronRight size={16} />
            </Link></li>)}
          </ul>}
        </section>
        {canReadStaff && <section className="workbench__section" aria-label="Attivita di oggi">
          <div className="workbench__section-heading"><h2><CheckCheck size={18} /> Attivita di oggi</h2><Link to={`/staff-planner?date=${today}`}>Planner <ChevronRight size={14} /></Link></div>
          {!tasks ? <p className="workbench__empty">{loading ? "Caricamento attivita..." : "Attivita non disponibili."}</p> : <>
            <div className="workbench__progress-label"><span>Completate</span><strong>{completed} / {activeTasks.length}</strong></div>
            <progress aria-label="Attivita completate" value={completed} max={activeTasks.length || 1} />
            {pendingTasks.length === 0 ? <p className="workbench__empty">{activeTasks.length ? "Tutte le attivita di oggi sono completate." : "Nessuna attivita programmata oggi."}</p> : <ul className="workbench__list">
              {pendingTasks.slice(0, 5).map(task => <li key={task.id}><Link className="workbench__row" to={`/staff-planner?${new URLSearchParams({ date: today, ...(task.unit_id ? { unit_id: task.unit_id } : {}), ...(task.booking_id ? { booking_id: task.booking_id } : {}) })}`}>
                <span className="workbench__row-main"><strong>{task.title || TASK_LABELS[task.task_type] || task.task_type}</strong><small>{unitMap[task.unit_id]?.name || "Struttura"}</small></span>
                <span className="workbench__row-meta">{task.status === "in_progress" ? "In corso" : "Da fare"}</span><ChevronRight size={16} />
              </Link></li>)}
            </ul>}
            {pendingTasks.length > 5 && <Link className="workbench__more" to={`/staff-planner?date=${today}`}>Altre {pendingTasks.length - 5} attivita <ChevronRight size={14} /></Link>}
          </>}
        </section>}
      </div>
      <section className="workbench__section" aria-label="Stato struttura">
        <h2>Stato struttura</h2>
        <div className="workbench__health">{health.map(item => <Link key={item.label} to={item.to}>{item.icon}<span>{item.label}</span><strong>{item.value ?? (loading ? "..." : "N/D")}</strong><ChevronRight size={14} /></Link>)}</div>
        {!alerts && !loading ? <p className="workbench__empty">Alert operativi non disponibili.</p> : alerts?.length > 0 && <ul className="workbench__alerts">{alerts.map(alert => <li key={alert.code}><TriangleAlert size={16} /><div><strong>{alert.title} ({alert.count})</strong><p>{alert.details}</p></div></li>)}</ul>}
      </section>
    </div>}
  </div>;
}

export default Dashboard;
