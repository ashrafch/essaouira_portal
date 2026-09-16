import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCallback } from "react";
import { Command } from "cmdk";
import { ArrowRight, History, Search } from "lucide-react";
import { canAccessPath, getRole } from "../config/rbac";
import { getNavigationItems } from "../routes/navigation";
import { getCurrentTenant, getCurrentUsername } from "../services/auth";
import { getSmartAlerts, getSmartDevices, getUnits } from "../services/api";
import { loadSections } from "../services/loadSections";
import { Modal } from "./ui";

function CommandPalette() {
  const navigate = useNavigate();
  const role = getRole();
  const recentKey = `essaouira_portal_recent_commands:${getCurrentTenant()}:${getCurrentUsername()}`;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [recent, setRecent] = useState([]);
  const [entities, setEntities] = useState({ units: [], devices: [], alerts: [] });

  const prepareSearch = useCallback(() => {
    setQuery("");
    setLoading(true);
    setError("");
    setEntities({ units: [], devices: [], alerts: [] });
    try {
      const parsed = JSON.parse(localStorage.getItem(recentKey) || "[]");
      setRecent(Array.isArray(parsed) ? parsed.filter((entry) => entry?.type === "route" && typeof entry.label === "string" && canAccessPath(entry.value, role)).slice(0, 8) : []);
    } catch { setRecent([]); }
  }, [recentKey, role]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        prepareSearch();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prepareSearch]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadSections({
      units: getUnits,
      devices: getSmartDevices,
      alerts: () => getSmartAlerts({ status: "open", limit: 20 }),
    }).then(({ data, failed }) => {
      if (cancelled) return;
      setEntities({ units: data.units || [], devices: data.devices || [], alerts: data.alerts || [] });
      setError(failed.length ? "Alcuni risultati non sono disponibili. Le pagine restano accessibili." : "");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, role, recentKey]);

  function goTo(path, label) {
    if (!canAccessPath(path, getRole())) return;
    const next = [{ type: "route", value: path, label }, ...recent.filter((entry) => entry.value !== path)].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* Storage is optional. */ }
    navigate(path);
    setOpen(false);
  }

  const groups = [
    { label: "Recenti", items: recent.map((item) => ({ path: item.value, label: item.label })) },
    { label: "Navigazione", items: getNavigationItems(role) },
    { label: "Unita", items: entities.units.map((item) => ({ label: item.name, path: `/units/${item.id}/timeline` })) },
    { label: "Dispositivi", items: entities.devices.map((item) => ({ label: item.name, path: `/smart-devices/${item.id}` })) },
    { label: "Alert aperti", items: entities.alerts.map((item) => ({ label: item.title, path: `/smart-alerts?alert_id=${encodeURIComponent(item.id)}` })) },
  ];

  return (
    <>
      <button className="cp-trigger-btn" type="button" onClick={() => { prepareSearch(); setOpen(true); }} title="Apri ricerca">
        <Search size={14} /> Cerca
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cerca" size="md">
        <Command label="Ricerca globale" className="cp-command">
          <div className="cp-input-wrap">
            <Command.Input value={query} onValueChange={setQuery} placeholder="Cerca..." className="cp-input" />
          </div>
          {error ? <p className="cp-error" role="status">{error}</p> : null}
          <Command.List className="cp-list">
            {loading ? <Command.Loading>Caricamento...</Command.Loading> : null}
            <Command.Empty>Nessun risultato trovato.</Command.Empty>
            {groups.map((group) => (
              <Command.Group heading={group.label} key={group.label}>
                {group.items.filter((item) => canAccessPath(item.path, role)).map((item) => (
                  <Command.Item className="cp-item" key={item.path} value={`${group.label} ${item.label} ${item.path}`} onSelect={() => goTo(item.path, item.label)}>
                    {group.label === "Recenti" ? <History size={13} /> : null}
                    {item.label}<ArrowRight size={13} />
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </Modal>
    </>
  );
}

export default CommandPalette;
