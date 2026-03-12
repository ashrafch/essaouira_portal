import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { ArrowRight, History, Search, Sparkles } from "lucide-react";
import { canAccessRoute, getRole } from "../config/rbac";
import {
  createSmartAlert,
  getProperties,
  getSmartAlerts,
  getSmartDevices,
  getSmartScenes,
  getUnits,
  runSmartScene,
} from "../services/api";

const RECENT_KEY = "essaouira_portal_recent_commands";

function CommandPalette() {
  const navigate = useNavigate();
  const role = getRole();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [runningAction, setRunningAction] = useState(false);
  const [actionError, setActionError] = useState("");
  const [recent, setRecent] = useState([]);
  const [entities, setEntities] = useState({
    properties: [],
    units: [],
    devices: [],
    alerts: [],
    scenes: [],
  });

  const navItems = useMemo(() => {
    const all = [
      { label: "Smart Dashboard", path: "/smart-dashboard", routeKey: "smartDashboard" },
      { label: "Smart Operations", path: "/smart-operations", routeKey: "smartOperations" },
      { label: "Smart Overview", path: "/smart-overview", routeKey: "smartOverview" },
      { label: "Property", path: "/properties", routeKey: "properties" },
      { label: "Dispositivi Smart", path: "/smart-devices", routeKey: "smartDevices" },
      { label: "Alert Smart", path: "/smart-alerts", routeKey: "smartAlerts" },
      { label: "Automazioni Smart", path: "/smart-automation", routeKey: "smartAutomation" },
      { label: "Assistant check-in", path: "/smart-assistant/checkin", routeKey: "smartCheckinAssistant" },
      { label: "Assistant checkout", path: "/smart-assistant/checkout", routeKey: "smartCheckoutAssistant" },
      { label: "Setup Wizard", path: "/setup", routeKey: "setupWizard" },
      { label: "Planner Staff", path: "/staff-planner", routeKey: "staffPlanner" },
      { label: "Unità", path: "/units", routeKey: "units" },
      { label: "Prenotazioni", path: "/bookings", routeKey: "bookings" },
    ];
    return all.filter((item) => canAccessRoute(item.routeKey, role));
  }, [role]);

  const commonActions = useMemo(
    () => [
      { label: "Vai a Smart Dashboard", type: "navigate", path: "/smart-dashboard" },
      { label: "Apri Assistant check-in", type: "navigate", path: "/smart-assistant/checkin" },
      { label: "Apri Assistant checkout", type: "navigate", path: "/smart-assistant/checkout" },
      { label: "Apri Setup Wizard", type: "navigate", path: "/setup" },
      { label: "Crea alert rapido", type: "action", action: "create_alert" },
      { label: "Esegui prima scena disponibile", type: "action", action: "run_first_scene" },
    ],
    [],
  );

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setRecent(Array.isArray(parsed) ? parsed : []);
    } catch {
      setRecent([]);
    }
  }, [open]);

  useEffect(() => {
    async function loadEntities() {
      if (!open) return;
      setLoading(true);
      setActionError("");
      try {
        const [properties, units, devices, alerts, scenes] = await Promise.all([
          getProperties(),
          getUnits(),
          getSmartDevices(),
          getSmartAlerts({ status: "open", limit: 20 }),
          getSmartScenes(),
        ]);
        setEntities({
          properties: properties || [],
          units: units || [],
          devices: devices || [],
          alerts: alerts || [],
          scenes: scenes || [],
        });
      } finally {
        setLoading(false);
      }
    }
    loadEntities();
  }, [open]);

  function pushRecent(entry) {
    try {
      const next = [entry, ...recent.filter((r) => !(r.type === entry.type && r.value === entry.value))].slice(0, 8);
      setRecent(next);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  function goTo(path, label) {
    if (label) {
      pushRecent({ type: "route", value: path, label });
    }
    navigate(path);
    setOpen(false);
  }

  async function triggerQuickAlert() {
    setRunningAction(true);
    setActionError("");
    try {
      await createSmartAlert({
        title: "Alert rapido manuale",
        alert_type: "custom.alert",
        severity: "warning",
        description: "Creato dalla command palette",
        unit_id: null,
      });
      pushRecent({ type: "action", value: "create_alert", label: "Crea alert rapido" });
      goTo("/smart-alerts");
    } catch (err) {
      setActionError(err.message || "Azione non riuscita");
    } finally {
      setRunningAction(false);
    }
  }

  async function triggerFirstScene() {
    if (!entities.scenes.length) {
      setActionError("Nessuna scena disponibile da eseguire");
      return;
    }
    setRunningAction(true);
    setActionError("");
    try {
      await runSmartScene(entities.scenes[0].id, { source: "ui.command_palette" });
      pushRecent({ type: "action", value: "run_first_scene", label: "Esegui prima scena disponibile" });
      goTo("/smart-automation");
    } catch (err) {
      setActionError(err.message || "Azione non riuscita");
    } finally {
      setRunningAction(false);
    }
  }

  function runCommon(item) {
    if (item.type === "navigate") {
      goTo(item.path, item.label);
      return;
    }
    if (item.action === "create_alert") {
      triggerQuickAlert();
      return;
    }
    if (item.action === "run_first_scene") {
      triggerFirstScene();
    }
  }

  return (
    <>
      <button
        className="cp-trigger-btn"
        type="button"
        onClick={() => setOpen(true)}
        title="Apri command palette"
      >
        <Search size={14} />
        Cerca · Ctrl/Cmd+K
      </button>

      {open ? (
        <div className="cp-overlay" role="presentation" onClick={() => setOpen(false)}>
          <div className="cp-surface" role="presentation" onClick={(e) => e.stopPropagation()}>
            <Command label="Command Palette Globale" shouldFilter className="cp-command">
              <div className="cp-input-wrap">
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Cerca pagine, property, unità, dispositivi, alert, azioni..."
                  className="cp-input"
                />
              </div>
              <Command.List className="cp-list">
                {loading ? <Command.Loading>Caricamento...</Command.Loading> : null}
                <Command.Empty>Nessun risultato trovato.</Command.Empty>
                {actionError ? <div className="cp-error">{actionError}</div> : null}

                <Command.Group heading="Azioni frequenti">
                  {commonActions.map((item) => (
                    <Command.Item className="cp-item" key={item.label} onSelect={() => runCommon(item)} disabled={runningAction}>
                      <Sparkles size={13} />
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>

                {recent.length > 0 ? (
                  <Command.Group heading="Recenti">
                    {recent.map((item, idx) => (
                      <Command.Item
                        className="cp-item"
                        key={`${item.type}-${item.value}-${idx}`}
                        onSelect={() => {
                          if (item.type === "route") {
                            goTo(item.value, item.label);
                          }
                        }}
                      >
                        <History size={13} />
                        {item.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}

                <Command.Group heading="Navigazione">
                  {navItems.map((item) => (
                    <Command.Item className="cp-item" key={item.path} onSelect={() => goTo(item.path, item.label)}>
                      {item.label}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Property">
                  {entities.properties.slice(0, 8).map((item) => (
                    <Command.Item
                      className="cp-item"
                      key={`prop-${item.id}`}
                      onSelect={() => goTo("/properties", `Property · ${item.name}`)}
                    >
                      {`Property · ${item.name}`}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Unità">
                  {entities.units.slice(0, 10).map((item) => (
                    <Command.Item
                      className="cp-item"
                      key={`unit-${item.id}`}
                      onSelect={() => goTo(`/smart-units/${item.id}`, `Unità · ${item.name}`)}
                    >
                      {`Unità · ${item.name}`}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Dispositivi">
                  {entities.devices.slice(0, 10).map((item) => (
                    <Command.Item
                      className="cp-item"
                      key={`dev-${item.id}`}
                      onSelect={() => goTo(`/smart-devices/${item.id}`, `Dispositivo · ${item.name}`)}
                    >
                      {`Dispositivo · ${item.name} (${item.category})`}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Alert aperti">
                  {entities.alerts.slice(0, 8).map((item) => (
                    <Command.Item
                      className="cp-item"
                      key={`alert-${item.id}`}
                      onSelect={() => goTo("/smart-alerts", `Alert · ${item.title}`)}
                    >
                      {`Alert · ${item.title}`}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default CommandPalette;

