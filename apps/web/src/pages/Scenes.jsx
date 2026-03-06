import { useCallback, useEffect, useMemo, useState } from "react";
import PageInfoHelp from "../components/PageInfoHelp";
import useIsMobile from "../hooks/useIsMobile";
import {
  createScene,
  createSceneAction,
  getDevices,
  getSceneActions,
  getScenes,
  runScene,
} from "../services/api";

function Scenes() {
  const isMobile = useIsMobile(900);
  const [scenes, setScenes] = useState([]);
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [sceneActions, setSceneActions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busySceneId, setBusySceneId] = useState(null);

  const [sceneForm, setSceneForm] = useState({
    name: "",
    description: "",
  });

  const [actionForm, setActionForm] = useState({
    position: 1,
    target_device_id: "",
    command_type: "power_on",
  });

  const loadScenes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sceneList, deviceList] = await Promise.all([getScenes(), getDevices()]);
      setScenes(sceneList || []);
      setDevices(deviceList || []);
      const defaultSceneId = selectedSceneId || sceneList?.[0]?.id || null;
      setSelectedSceneId(defaultSceneId);
      if (defaultSceneId) {
        const actions = await getSceneActions(defaultSceneId);
        setSceneActions(actions || []);
      } else {
        setSceneActions([]);
      }
    } catch (err) {
      setError(err.message || "Errore caricando scene");
    } finally {
      setLoading(false);
    }
  }, [selectedSceneId]);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  async function loadActions(sceneId) {
    if (!sceneId) {
      setSceneActions([]);
      return;
    }
    try {
      const actions = await getSceneActions(sceneId);
      setSceneActions(actions || []);
    } catch (err) {
      setError(err.message || "Errore caricando azioni scena");
    }
  }

  async function handleCreateScene(e) {
    e.preventDefault();
    try {
      if (!sceneForm.name.trim()) {
        return;
      }
      await createScene({
        name: sceneForm.name.trim(),
        description: sceneForm.description.trim() || null,
        is_active: true,
      });
      setSceneForm({ name: "", description: "" });
      await loadScenes();
    } catch (err) {
      setError(err.message || "Errore creazione scena");
    }
  }

  async function handleCreateAction(e) {
    e.preventDefault();
    if (!selectedSceneId || !actionForm.target_device_id) return;
    try {
      await createSceneAction(selectedSceneId, {
        position: Number(actionForm.position) || 1,
        action_type: "device_command",
        target_device_id: Number(actionForm.target_device_id),
        payload: {
          command_type: actionForm.command_type,
          payload: {},
        },
        is_active: true,
      });
      await loadActions(selectedSceneId);
    } catch (err) {
      setError(err.message || "Errore creazione azione");
    }
  }

  async function handleRunScene(sceneId) {
    setBusySceneId(sceneId);
    try {
      await runScene(sceneId, { context: { source: "scenes_ui" } });
      await loadScenes();
      if (selectedSceneId === sceneId) {
        await loadActions(sceneId);
      }
    } catch (err) {
      setError(err.message || "Errore esecuzione scena");
    } finally {
      setBusySceneId(null);
    }
  }

  const selectedScene = useMemo(
    () => scenes.find((s) => s.id === selectedSceneId) || null,
    [scenes, selectedSceneId]
  );

  const card = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    borderRadius: 16,
    padding: 14,
    border: "1px solid #e2e8f0",
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Scenes</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Scene manuali minime per orchestrare comandi smart in sequenza.
          </p>
        </div>
        <PageInfoHelp title="Come usare Scenes">
          <p>Crea una scena e aggiungi azioni base. In questa fase le azioni usano il lifecycle comandi device gia esistente.</p>
          <p>Esegui la scena manualmente per testare il comportamento end-to-end.</p>
        </PageInfoHelp>
      </div>

      {loading ? <div style={card}>Caricamento scene...</div> : null}
      {error ? <div style={{ ...card, color: "#b91c1c" }}>{error}</div> : null}

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Nuova scena</h3>
        <form onSubmit={handleCreateScene} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1.5fr auto", gap: 8 }}>
          <input
            value={sceneForm.name}
            onChange={(e) => setSceneForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Nome scena (es. Check-in standard)"
            style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
          />
          <input
            value={sceneForm.description}
            onChange={(e) => setSceneForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Descrizione opzionale"
            style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
          />
          <button type="submit" style={{ borderRadius: 999, border: "1px solid #0f766e", padding: "8px 12px", background: "#0f766e", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Crea scena
          </button>
        </form>
      </div>

      {!loading && scenes.length === 0 ? <div style={card}>Nessuna scena configurata.</div> : null}

      {!loading && scenes.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr", gap: 10 }}>
          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>Elenco scene</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {scenes.map((scene) => (
                <div key={scene.id} style={{ border: scene.id === selectedSceneId ? "1px solid #14b8a6" : "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSceneId(scene.id);
                        loadActions(scene.id);
                      }}
                      style={{ border: "none", background: "transparent", padding: 0, margin: 0, textAlign: "left", cursor: "pointer" }}
                    >
                      <div style={{ fontWeight: 700 }}>{scene.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{scene.description || "Nessuna descrizione"}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunScene(scene.id)}
                      disabled={busySceneId === scene.id}
                      style={{ borderRadius: 999, border: "1px solid #0f766e", padding: "4px 10px", fontSize: 12, background: "#f0fdfa", color: "#115e59", fontWeight: 600, cursor: "pointer" }}
                    >
                      {busySceneId === scene.id ? "Run..." : "Run"}
                    </button>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
                    last run: {scene.last_run_at ? new Date(scene.last_run_at).toLocaleString("it-IT") : "mai"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>
              Azioni scena {selectedScene ? `- ${selectedScene.name}` : ""}
            </h3>

            {selectedSceneId ? (
              <>
                <form onSubmit={handleCreateAction} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "80px 1fr 1fr auto", gap: 8, marginBottom: 10 }}>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={actionForm.position}
                    onChange={(e) => setActionForm((prev) => ({ ...prev, position: e.target.value }))}
                    style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
                  />
                  <select
                    value={actionForm.target_device_id}
                    onChange={(e) => setActionForm((prev) => ({ ...prev, target_device_id: e.target.value }))}
                    style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
                  >
                    <option value="">Seleziona device</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        #{d.id} - {d.name} ({d.category})
                      </option>
                    ))}
                  </select>
                  <select
                    value={actionForm.command_type}
                    onChange={(e) => setActionForm((prev) => ({ ...prev, command_type: e.target.value }))}
                    style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
                  >
                    <option value="power_on">power_on</option>
                    <option value="power_off">power_off</option>
                  </select>
                  <button type="submit" style={{ borderRadius: 999, border: "1px solid #0f766e", padding: "8px 12px", background: "#0f766e", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Aggiungi
                  </button>
                </form>

                {sceneActions.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#64748b" }}>Nessuna azione configurata.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {sceneActions.map((action) => (
                      <div key={action.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#fff" }}>
                        <div style={{ fontWeight: 700 }}>
                          #{action.position} - {action.action_type}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                          device: {action.target_device_id || "n/d"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#64748b" }}>Seleziona una scena per vedere le azioni.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Scenes;
