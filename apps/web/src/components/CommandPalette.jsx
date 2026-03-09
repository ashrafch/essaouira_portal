import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { ArrowRight, Search } from "lucide-react";
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

function CommandPalette() {
  const navigate = useNavigate();
  const role = getRole();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [runningAction, setRunningAction] = useState(false);
  const [actionError, setActionError] = useState("");
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
      { label: "Smart Overview", path: "/smart-overview", routeKey: "smartOverview" },
      { label: "Properties", path: "/properties", routeKey: "properties" },
      { label: "Devices", path: "/smart-devices", routeKey: "smartDevices" },
      { label: "Alerts", path: "/smart-alerts", routeKey: "smartAlerts" },
      { label: "Automation", path: "/smart-automation", routeKey: "smartAutomation" },
      { label: "Setup Wizard", path: "/setup", routeKey: "setupWizard" },
      { label: "Staff Planner", path: "/staff-planner", routeKey: "staffPlanner" },
      { label: "Units", path: "/units", routeKey: "units" },
      { label: "Bookings", path: "/bookings", routeKey: "bookings" },
    ];
    return all.filter((item) => canAccessRoute(item.routeKey, role));
  }, [role]);

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

  function goTo(path) {
    navigate(path);
    setOpen(false);
  }

  async function triggerQuickAlert() {
    setRunningAction(true);
    setActionError("");
    try {
      await createSmartAlert({
        title: "Manual quick alert",
        alert_type: "custom.alert",
        severity: "warning",
        description: "Generated from command palette",
        unit_id: null,
      });
      goTo("/smart-alerts");
    } catch (err) {
      setActionError(err.message || "Action failed");
    } finally {
      setRunningAction(false);
    }
  }

  async function triggerFirstScene() {
    if (!entities.scenes.length) {
      setActionError("No available scene to trigger");
      return;
    }
    setRunningAction(true);
    setActionError("");
    try {
      await runSmartScene(entities.scenes[0].id, { source: "ui.command_palette" });
      goTo("/smart-automation");
    } catch (err) {
      setActionError(err.message || "Action failed");
    } finally {
      setRunningAction(false);
    }
  }

  return (
    <>
      <button
        className="cp-trigger-btn"
        type="button"
        onClick={() => setOpen(true)}
        title="Open command palette"
      >
        <Search size={14} />
        Search · Ctrl/Cmd+K
      </button>

      {open ? (
        <div className="cp-overlay" role="presentation" onClick={() => setOpen(false)}>
          <div className="cp-surface" role="presentation" onClick={(e) => e.stopPropagation()}>
            <Command label="Global Command Palette" shouldFilter className="cp-command">
              <div className="cp-input-wrap">
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search navigation, properties, units, devices, alerts, actions..."
                  className="cp-input"
                />
              </div>
              <Command.List className="cp-list">
                {loading ? <Command.Loading>Loading...</Command.Loading> : null}
                <Command.Empty>No results found.</Command.Empty>
                {actionError ? <div className="cp-error">{actionError}</div> : null}

                <Command.Group heading="Navigation">
                  {navItems.map((item) => (
                    <Command.Item className="cp-item" key={item.path} onSelect={() => goTo(item.path)}>
                      {item.label}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Properties">
                  {entities.properties.slice(0, 8).map((item) => (
                    <Command.Item className="cp-item" key={`prop-${item.id}`} onSelect={() => goTo("/properties")}>
                      {item.name}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Units">
                  {entities.units.slice(0, 10).map((item) => (
                    <Command.Item className="cp-item" key={`unit-${item.id}`} onSelect={() => goTo(`/smart-units/${item.id}`)}>
                      {item.name}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Devices">
                  {entities.devices.slice(0, 10).map((item) => (
                    <Command.Item className="cp-item" key={`dev-${item.id}`} onSelect={() => goTo("/smart-devices")}>
                      {item.name} · {item.category}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Open Alerts">
                  {entities.alerts.slice(0, 8).map((item) => (
                    <Command.Item className="cp-item" key={`alert-${item.id}`} onSelect={() => goTo("/smart-alerts")}>
                      {item.title}
                      <ArrowRight size={13} />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Quick Actions">
                  <Command.Item className="cp-item" onSelect={() => triggerQuickAlert()} disabled={runningAction}>
                    Create alert
                  </Command.Item>
                  <Command.Item className="cp-item" onSelect={() => triggerFirstScene()} disabled={runningAction}>
                    Trigger first scene
                  </Command.Item>
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

