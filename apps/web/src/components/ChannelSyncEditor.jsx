import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button, useToast } from "./ui";
import {
  getChannels,
  createChannel,
  deleteChannel,
  syncChannel,
  syncAllChannels,
  pushChannelPrices,
  getChannelExportInfo,
} from "../services/api";

const CHANNELS = ["airbnb", "booking", "vrbo", "other"];
const STATUS_COLOR = {
  ok: "var(--color-success-strong)",
  partial: "var(--color-warning-strong)",
  error: "var(--color-danger)",
  never: "var(--color-text-subtle)",
};

/**
 * Manage per-unit iCal channel connections: share our export URL with OTAs and
 * import their busy dates (two-way availability sync, anti double-booking).
 */
export default function ChannelSyncEditor({ units = [] }) {
  const toast = useToast();
  const [unitId, setUnitId] = useState(units[0]?.id ?? null);
  const [connections, setConnections] = useState([]);
  const [exportInfo, setExportInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ channel: "airbnb", ical_import_url: "" });
  const [savingAdd, setSavingAdd] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [pushingId, setPushingId] = useState(null);

  useEffect(() => {
    if (unitId == null && units.length > 0) setUnitId(units[0].id);
  }, [units, unitId]);

  const reload = useCallback(async () => {
    if (unitId == null) return;
    setLoading(true);
    try {
      const [conns, info] = await Promise.all([
        getChannels(unitId),
        getChannelExportInfo(unitId).catch(() => null),
      ]);
      setConnections(conns || []);
      setExportInfo(info);
    } catch (err) {
      toast.error("Errore caricando i canali: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [unitId, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const exportUrl = useMemo(() => {
    if (!exportInfo) return "";
    return `${window.location.origin}/api${exportInfo.ical_path}?token=${exportInfo.token}`;
  }, [exportInfo]);

  async function addConnection() {
    if (!form.ical_import_url) {
      toast.info("Inserisci l'URL iCal del canale.");
      return;
    }
    setSavingAdd(true);
    try {
      await createChannel({
        unit_id: unitId,
        channel: form.channel,
        ical_import_url: form.ical_import_url,
      });
      toast.success("Connessione aggiunta.");
      setForm({ channel: "airbnb", ical_import_url: "" });
      await reload();
    } catch (err) {
      toast.error("Errore salvataggio connessione: " + err.message);
    } finally {
      setSavingAdd(false);
    }
  }

  async function removeConnection(id) {
    try {
      await deleteChannel(id);
      toast.success("Connessione rimossa (blocchi importati eliminati).");
      await reload();
    } catch (err) {
      toast.error("Errore: " + err.message);
    }
  }

  async function runSync(id) {
    setSyncingId(id);
    try {
      const res = await syncChannel(id);
      toast.success(
        `Sync: ${res.created} blocchi importati, ${res.conflicts.length} conflitti su ${res.events} eventi.`
      );
      await reload();
    } catch (err) {
      toast.error("Sincronizzazione non riuscita: " + err.message);
      reload();
    } finally {
      setSyncingId(null);
    }
  }

  async function runSyncAll() {
    setSyncingAll(true);
    try {
      const res = await syncAllChannels();
      toast.success(`Sync completa: ${res.synced} ok, ${res.errors} errori.`);
      await reload();
    } catch (err) {
      toast.error("Sincronizzazione globale non riuscita: " + err.message);
    } finally {
      setSyncingAll(false);
    }
  }

  async function runPush(id) {
    setPushingId(id);
    try {
      const res = await pushChannelPrices(id);
      toast.info(res.message);
      await reload();
    } catch (err) {
      toast.error("Push non riuscito: " + err.message);
    } finally {
      setPushingId(null);
    }
  }

  async function copyExport() {
    if (!exportUrl) return;
    try {
      await navigator.clipboard.writeText(exportUrl);
      toast.success("URL di export copiato.");
    } catch {
      toast.info(exportUrl);
    }
  }

  const card = {
    background: "var(--color-surface)",
    borderRadius: 14,
    padding: 14,
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };
  const input = {
    borderRadius: 8,
    border: "1px solid var(--color-border-strong)",
    padding: "6px 8px",
    fontSize: 13,
    background: "var(--color-surface)",
    color: "var(--color-text)",
    width: "100%",
  };
  const th = {
    textAlign: "left",
    borderBottom: "1px solid var(--color-border)",
    padding: "6px 6px",
    color: "var(--color-text-muted)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  };
  const td = {
    padding: "5px 6px",
    borderBottom: "1px solid var(--color-border)",
    verticalAlign: "middle",
    fontSize: 13,
  };

  return (
    <div style={card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div>
          <h2 style={{ fontSize: 14, margin: 0 }}>Canali & sync iCal</h2>
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
            Condividi l'URL di export con gli OTA e importa i loro calendari per
            bloccare le date (anti overbooking a due vie).
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={15} />}
            onClick={runSyncAll}
            loading={syncingAll}
          >
            Sincronizza tutti
          </Button>
          <select
            value={unitId ?? ""}
            onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}
            style={{ ...input, width: "auto" }}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* EXPORT URL */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600 }}>
          URL di export (.ics) da incollare su Airbnb / Booking
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input readOnly value={exportUrl} style={{ ...input, fontFamily: "monospace", fontSize: 12 }} />
          <Button
            variant="secondary"
            size="sm"
            icon={<Copy size={15} />}
            onClick={copyExport}
            disabled={!exportUrl}
          >
            Copia
          </Button>
        </div>
      </div>

      {/* IMPORT CONNECTIONS */}
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Caricamento…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Canale</th>
                <th style={th}>URL iCal import</th>
                <th style={th}>Ultima sync</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...td, textTransform: "capitalize" }}>{c.channel}</td>
                  <td style={{ ...td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.ical_import_url || "—"}
                  </td>
                  <td style={td}>
                    <span style={{ color: STATUS_COLOR[c.last_sync_status] || "var(--color-text)" }}>
                      {c.last_sync_status}
                    </span>
                    {c.last_sync_message ? (
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                        {c.last_sync_message}
                      </div>
                    ) : null}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<RefreshCw size={14} />}
                        onClick={() => runSync(c.id)}
                        loading={syncingId === c.id}
                        aria-label="Sincronizza"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Send size={14} />}
                        onClick={() => runPush(c.id)}
                        loading={pushingId === c.id}
                        aria-label="Push prezzi (simulato)"
                        title="Push prezzi (simulato)"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={() => removeConnection(c.id)}
                        aria-label="Rimuovi connessione"
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {connections.length === 0 && (
                <tr>
                  <td style={{ ...td, color: "var(--color-text-muted)" }} colSpan={4}>
                    Nessuna connessione. Aggiungine una qui sotto.
                  </td>
                </tr>
              )}
              <tr>
                <td style={td}>
                  <select
                    style={input}
                    value={form.channel}
                    onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}
                  >
                    {CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={td} colSpan={2}>
                  <input
                    style={input}
                    placeholder="https://www.airbnb.it/calendar/ical/....ics"
                    value={form.ical_import_url}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, ical_import_url: e.target.value }))
                    }
                  />
                </td>
                <td style={td}>
                  <Button
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={addConnection}
                    loading={savingAdd}
                    disabled={unitId == null}
                    aria-label="Aggiungi connessione"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
