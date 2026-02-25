import { useEffect, useMemo, useState } from "react";
import AppModal from "../components/AppModal";
import PageInfoHelp from "../components/PageInfoHelp";
import {
  createMessageTemplate,
  createTaskChecklistItem,
  getMessageJobs,
  getMessageTemplates,
  getStaffTasks,
  getTaskChecklist,
  getUnits,
  updateMessageJobStatus,
  updateMessageTemplate,
  updateTaskChecklistItem,
} from "../services/api";

function formatTaskLabel(task, unitMap) {
  const unitName = task.unit_id ? unitMap[task.unit_id] || `Unit #${task.unit_id}` : "Senza unita";
  const assignee = task.assignee_name || "Staff non assegnato";
  return `${task.date || "n/d"} - ${unitName} - ${task.task_type || "task"} - ${assignee}`;
}

function getIsoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const TEMPLATE_PRESETS = [
  {
    key: "welcome",
    label: "Welcome check-in",
    payload: {
      name: "Welcome check-in",
      trigger_type: "checkin",
      offset_hours: "-24",
      subject: "Benvenuto - info check-in",
      body: "Ciao {{guest_name}}, domani ti aspettiamo per il check-in. In caso di ritardo scrivici qui.",
    },
  },
  {
    key: "checkout",
    label: "Promemoria checkout",
    payload: {
      name: "Promemoria checkout",
      trigger_type: "checkout",
      offset_hours: "-12",
      subject: "Promemoria checkout",
      body: "Ciao {{guest_name}}, ti ricordiamo il checkout entro le 10:00. Grazie per il soggiorno.",
    },
  },
  {
    key: "upsell",
    label: "Upsell colazione",
    payload: {
      name: "Upsell colazione",
      trigger_type: "checkin",
      offset_hours: "6",
      subject: "Colazione disponibile",
      body: "Buongiorno {{guest_name}}, se vuoi possiamo aggiungere colazione domani mattina.",
    },
  },
];

function OpsAutomation() {
  const [activePanel, setActivePanel] = useState("templates");

  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [units, setUnits] = useState([]);
  const [taskCatalog, setTaskCatalog] = useState([]);

  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [error, setError] = useState("");

  const [templateForm, setTemplateForm] = useState({
    id: null,
    name: "",
    trigger_type: "checkin",
    offset_hours: "-24",
    channel: "email",
    subject: "",
    body: "",
    is_active: true,
  });

  const [checklistTaskId, setChecklistTaskId] = useState("");
  const [checklistItems, setChecklistItems] = useState([]);
  const [checklistTitle, setChecklistTitle] = useState("");
  const [taskQuery, setTaskQuery] = useState("");

  const [jobStatusFilter, setJobStatusFilter] = useState("all");
  const [jobSearch, setJobSearch] = useState("");

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isTemplateInfoOpen, setIsTemplateInfoOpen] = useState(false);

  const unitMap = useMemo(() => {
    return units.reduce((acc, u) => {
      acc[u.id] = u.name;
      return acc;
    }, {});
  }, [units]);

  const templateStats = useMemo(() => {
    const active = templates.filter((t) => t.is_active).length;
    const inactive = templates.length - active;
    return { total: templates.length, active, inactive };
  }, [templates]);

  const jobStats = useMemo(() => {
    const out = { scheduled: 0, sent: 0, failed: 0 };
    jobs.forEach((j) => {
      if (j.status === "scheduled") out.scheduled += 1;
      if (j.status === "sent") out.sent += 1;
      if (j.status === "failed") out.failed += 1;
    });
    return out;
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    return jobs.filter((j) => {
      const statusOk = jobStatusFilter === "all" ? true : j.status === jobStatusFilter;
      const search = jobSearch.trim().toLowerCase();
      if (!search) return statusOk;
      const asText = `#${j.id} ${j.booking_id} ${j.channel} ${j.status}`.toLowerCase();
      return statusOk && asText.includes(search);
    });
  }, [jobs, jobStatusFilter, jobSearch]);

  const filteredTasks = useMemo(() => {
    const search = taskQuery.trim().toLowerCase();
    const base = taskCatalog.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (!search) return base;
    return base.filter((t) => formatTaskLabel(t, unitMap).toLowerCase().includes(search));
  }, [taskCatalog, taskQuery, unitMap]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [t, j] = await Promise.all([getMessageTemplates(), getMessageJobs()]);
      setTemplates(t || []);
      setJobs(j || []);
    } catch (err) {
      setError(err.message || "Errore caricando automazioni");
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog() {
    setCatalogLoading(true);
    try {
      const [u, tasks] = await Promise.all([
        getUnits(),
        getStaffTasks({ from_date: getIsoOffset(-14), to_date: getIsoOffset(14) }),
      ]);
      setUnits(u || []);
      setTaskCatalog(tasks || []);
    } catch (err) {
      setError(err.message || "Errore caricando task catalog");
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    loadCatalog();
  }, []);

  async function handleSaveTemplate(e) {
    e.preventDefault();
    const payload = {
      name: templateForm.name,
      trigger_type: templateForm.trigger_type,
      offset_hours: Number(templateForm.offset_hours || 0),
      channel: templateForm.channel,
      subject: templateForm.subject || null,
      body: templateForm.body,
      is_active: Boolean(templateForm.is_active),
    };
    try {
      if (templateForm.id) {
        await updateMessageTemplate(templateForm.id, payload);
      } else {
        await createMessageTemplate(payload);
      }
      setTemplateForm({
        id: null,
        name: "",
        trigger_type: "checkin",
        offset_hours: "-24",
        channel: "email",
        subject: "",
        body: "",
        is_active: true,
      });
      setIsTemplateModalOpen(false);
      await loadAll();
    } catch (err) {
      setError(err.message || "Errore salvataggio template");
    }
  }

  async function handleUpdateJobStatus(jobId, status) {
    try {
      await updateMessageJobStatus(jobId, { status, error_message: null });
      await loadAll();
    } catch (err) {
      setError(err.message || "Errore update job");
    }
  }

  async function handleLoadChecklist(taskId = checklistTaskId) {
    if (!taskId) return;
    try {
      const data = await getTaskChecklist(Number(taskId));
      setChecklistItems(data || []);
    } catch (err) {
      setError(err.message || "Errore caricando checklist");
    }
  }

  async function handleAddChecklistItem(e) {
    e.preventDefault();
    if (!checklistTaskId || !checklistTitle.trim()) return;
    try {
      await createTaskChecklistItem(Number(checklistTaskId), {
        title: checklistTitle.trim(),
        notes: null,
        photo_url: null,
      });
      setChecklistTitle("");
      await handleLoadChecklist();
    } catch (err) {
      setError(err.message || "Errore aggiunta checklist");
    }
  }

  async function handleToggleChecklistItem(item) {
    try {
      await updateTaskChecklistItem(Number(checklistTaskId), item.id, {
        is_done: !item.is_done,
      });
      await handleLoadChecklist();
    } catch (err) {
      setError(err.message || "Errore update checklist item");
    }
  }

  function applyPreset(preset) {
    setTemplateForm((prev) => ({
      ...prev,
      ...preset.payload,
    }));
  }

  const card = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
  };

  const input = {
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "6px 8px",
    fontSize: 13,
  };

  const button = {
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    padding: "6px 10px",
    fontSize: 12,
    background: "#ffffff",
    cursor: "pointer",
    color: "#0f172a",
    fontWeight: 600,
  };

  const panelButton = (active) => ({
    ...button,
    background: active ? "#0f766e" : "#ffffff",
    color: active ? "#ffffff" : "#0f172a",
    borderColor: active ? "#0f766e" : "#cbd5e1",
  });

  const statCard = {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#ffffff",
    padding: 10,
    fontSize: 12,
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>Ops Automation</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
          Flusso guidato per template messaggi, coda invii e checklist housekeeping.
        </p>
      </div>

      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 12,
          fontSize: 13,
          color: "#334155",
          display: "grid",
          gap: 6,
        }}
      >
        <strong>Workflow consigliato</strong>
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Configura i template (quando + cosa inviare).</li>
          <li>Controlla la coda invii nei message jobs.</li>
          <li>Aggancia checklist alle task operative senza digitare ID a mano.</li>
        </ol>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={panelButton(activePanel === "templates")} onClick={() => setActivePanel("templates")}>Template</button>
        <button type="button" style={panelButton(activePanel === "jobs")} onClick={() => setActivePanel("jobs")}>Message Jobs</button>
        <button type="button" style={panelButton(activePanel === "checklist")} onClick={() => setActivePanel("checklist")}>Checklist</button>
        <PageInfoHelp title="Cos e Ops Automation" maxWidth={700}>
          <p>Ops Automation coordina comunicazioni e procedure operative post-prenotazione.</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Template: regole di messaggio basate su trigger temporali.</li>
            <li>Jobs: stato reale degli invii pianificati.</li>
            <li>Checklist: standard operativi per task housekeeping.</li>
          </ul>
        </PageInfoHelp>
      </div>

      {error ? <p style={{ color: "#b91c1c", fontSize: 12 }}>{error}</p> : null}
      {loading ? <p style={{ fontSize: 13 }}>Caricamento automazioni...</p> : null}

      {activePanel === "templates" ? (
        <section style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 8, marginBottom: 10 }}>
            <div style={statCard}><div>Totale</div><strong>{templateStats.total}</strong></div>
            <div style={statCard}><div>Attivi</div><strong>{templateStats.active}</strong></div>
            <div style={statCard}><div>Disattivi</div><strong>{templateStats.inactive}</strong></div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {TEMPLATE_PRESETS.map((p) => (
              <button key={p.key} type="button" style={button} onClick={() => { applyPreset(p); setIsTemplateModalOpen(true); }}>
                {p.label}
              </button>
            ))}
            <button type="button" style={button} onClick={() => setIsTemplateModalOpen(true)}>
              Nuovo template
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12 }}>
            {templates.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Nessun template configurato.</p>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTemplateForm({
                      id: t.id,
                      name: t.name,
                      trigger_type: t.trigger_type,
                      offset_hours: String(t.offset_hours ?? 0),
                      channel: t.channel || "email",
                      subject: t.subject || "",
                      body: t.body || "",
                      is_active: Boolean(t.is_active),
                    });
                    setIsTemplateModalOpen(true);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    marginBottom: 6,
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "8px 10px",
                    background: "#fff",
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>
                    {t.trigger_type} � {t.offset_hours}h � {t.is_active ? "attivo" : "disattivo"}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activePanel === "jobs" ? (
        <section style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 8, marginBottom: 10 }}>
            <div style={statCard}><div>Scheduled</div><strong>{jobStats.scheduled}</strong></div>
            <div style={statCard}><div>Sent</div><strong>{jobStats.sent}</strong></div>
            <div style={statCard}><div>Failed</div><strong>{jobStats.failed}</strong></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 8, marginBottom: 8 }}>
            <input
              style={input}
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              placeholder="Cerca per id booking/canale/stato"
            />
            <select style={input} value={jobStatusFilter} onChange={(e) => setJobStatusFilter(e.target.value)}>
              <option value="all">Tutti gli stati</option>
              <option value="scheduled">Scheduled</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto", fontSize: 12 }}>
            {visibleJobs.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Nessun job con questi filtri.</p>
            ) : (
              visibleJobs.map((j) => (
                <div
                  key={j.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "8px 10px",
                    marginBottom: 6,
                    background: "#fff",
                  }}
                >
                  <div>#{j.id} � booking #{j.booking_id} � {j.channel} � <strong>{j.status}</strong></div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" style={button} onClick={() => handleUpdateJobStatus(j.id, "scheduled")}>scheduled</button>
                    <button type="button" style={button} onClick={() => handleUpdateJobStatus(j.id, "sent")}>sent</button>
                    <button type="button" style={button} onClick={() => handleUpdateJobStatus(j.id, "failed")}>failed</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activePanel === "checklist" ? (
        <section style={card}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              style={{ ...input, minWidth: 260 }}
              value={taskQuery}
              onChange={(e) => setTaskQuery(e.target.value)}
              placeholder="Cerca task per data, unita o operatore"
            />
            <button type="button" style={button} onClick={loadCatalog}>
              {catalogLoading ? "Aggiorno..." : "Aggiorna task"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 }}>
            <select
              style={input}
              value={checklistTaskId}
              onChange={(e) => {
                setChecklistTaskId(e.target.value);
                if (e.target.value) {
                  handleLoadChecklist(e.target.value);
                } else {
                  setChecklistItems([]);
                }
              }}
            >
              <option value="">Seleziona task staff...</option>
              {filteredTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatTaskLabel(t, unitMap)}
                </option>
              ))}
            </select>
            <button type="button" style={button} onClick={() => handleLoadChecklist()} disabled={!checklistTaskId}>
              Carica checklist
            </button>
          </div>

          <form onSubmit={handleAddChecklistItem} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              style={input}
              value={checklistTitle}
              onChange={(e) => setChecklistTitle(e.target.value)}
              placeholder="Nuova voce checklist"
              disabled={!checklistTaskId}
            />
            <button type="submit" style={button} disabled={!checklistTaskId || !checklistTitle.trim()}>
              Aggiungi
            </button>
          </form>

          <div style={{ fontSize: 12 }}>
            {!checklistTaskId ? (
              <p style={{ color: "#6b7280" }}>Seleziona una task per vedere o modificare la checklist.</p>
            ) : checklistItems.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Nessuna voce checklist caricata.</p>
            ) : (
              checklistItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => handleToggleChecklistItem(it)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    marginBottom: 6,
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "8px 10px",
                    background: it.is_done ? "#ecfdf5" : "#fff",
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  {it.is_done ? "OK " : "TODO "}
                  {it.title}
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}

      <AppModal
        open={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title={templateForm.id ? "Modifica template" : "Nuovo template"}
        maxWidth={680}
      >
        <form onSubmit={handleSaveTemplate} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input
              style={input}
              value={templateForm.name}
              onChange={(e) => setTemplateForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="Nome template"
              required
            />
            <select
              style={input}
              value={templateForm.trigger_type}
              onChange={(e) => setTemplateForm((s) => ({ ...s, trigger_type: e.target.value }))}
            >
              <option value="checkin">checkin</option>
              <option value="checkout">checkout</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input
              style={input}
              type="number"
              value={templateForm.offset_hours}
              onChange={(e) => setTemplateForm((s) => ({ ...s, offset_hours: e.target.value }))}
              placeholder="Offset ore"
            />
            <input
              style={input}
              value={templateForm.subject}
              onChange={(e) => setTemplateForm((s) => ({ ...s, subject: e.target.value }))}
              placeholder="Subject"
            />
          </div>

          <textarea
            style={{ ...input, minHeight: 90, resize: "vertical" }}
            value={templateForm.body}
            onChange={(e) => setTemplateForm((s) => ({ ...s, body: e.target.value }))}
            placeholder="Body messaggio"
            required
          />

          <label style={{ fontSize: 12, color: "#334155" }}>
            <input
              type="checkbox"
              checked={templateForm.is_active}
              onChange={(e) => setTemplateForm((s) => ({ ...s, is_active: e.target.checked }))}
            />{" "}
            Template attivo
          </label>

          <button type="submit" style={button}>
            {templateForm.id ? "Aggiorna template" : "Crea template"}
          </button>
        </form>
      </AppModal>

      <AppModal
        open={isTemplateInfoOpen}
        onClose={() => setIsTemplateInfoOpen(false)}
        title="Come usare i template messaggi"
        maxWidth={660}
      >
        <div style={{ display: "grid", gap: 10, fontSize: 13, color: "#334155" }}>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>`trigger_type`: evento di riferimento (checkin/checkout).</li>
            <li>`offset_hours`: ore rispetto al trigger (negativo prima, positivo dopo).</li>
            <li>`subject` e `body`: contenuto effettivo da inviare.</li>
          </ul>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: 10 }}>
            Esempio: checkin con offset -24 invia il promemoria un giorno prima del check-in.
          </div>
        </div>
      </AppModal>
    </div>
  );
}

export default OpsAutomation;
