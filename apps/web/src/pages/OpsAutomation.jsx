import { useEffect, useState } from "react";
import AppModal from "../components/AppModal";
import {
  createMessageTemplate,
  createTaskChecklistItem,
  getMessageJobs,
  getMessageTemplates,
  getTaskChecklist,
  updateMessageJobStatus,
  updateMessageTemplate,
  updateTaskChecklistItem,
} from "../services/api";

function OpsAutomation() {
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

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

  useEffect(() => {
    loadAll();
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

  async function handleLoadChecklist() {
    if (!checklistTaskId) return;
    try {
      const data = await getTaskChecklist(Number(checklistTaskId));
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
    color: "#0f766e",
    fontWeight: 600,
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>Ops Automation</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
          Gestione template messaggi, coda invii e checklist housekeeping.
        </p>
      </div>

      {error ? <p style={{ color: "#b91c1c", fontSize: 12 }}>{error}</p> : null}
      {loading ? <p style={{ fontSize: 13 }}>Caricamento automazioni...</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 14 }}>Template messaggi</h2>
          <button
            type="button"
            style={button}
            onClick={() => setIsTemplateModalOpen(true)}
          >
            {templateForm.id ? "Modifica template" : "Nuovo template"}
          </button>
          <AppModal
            open={isTemplateModalOpen}
            onClose={() => setIsTemplateModalOpen(false)}
            title={templateForm.id ? "Modifica template" : "Nuovo template"}
            maxWidth={620}
          >
          <form onSubmit={handleSaveTemplate} style={{ display: "grid", gap: 8 }}>
            <input
              style={input}
              value={templateForm.name}
              onChange={(e) => setTemplateForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="Nome template"
              required
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <select
                style={input}
                value={templateForm.trigger_type}
                onChange={(e) =>
                  setTemplateForm((s) => ({ ...s, trigger_type: e.target.value }))
                }
              >
                <option value="checkin">checkin</option>
                <option value="checkout">checkout</option>
              </select>
              <input
                style={input}
                type="number"
                value={templateForm.offset_hours}
                onChange={(e) =>
                  setTemplateForm((s) => ({ ...s, offset_hours: e.target.value }))
                }
                placeholder="Offset ore"
              />
            </div>
            <input
              style={input}
              value={templateForm.subject}
              onChange={(e) => setTemplateForm((s) => ({ ...s, subject: e.target.value }))}
              placeholder="Subject (email)"
            />
            <textarea
              style={{ ...input, minHeight: 80, resize: "vertical" }}
              value={templateForm.body}
              onChange={(e) => setTemplateForm((s) => ({ ...s, body: e.target.value }))}
              placeholder="Body template"
              required
            />
            <button type="submit" style={button}>
              {templateForm.id ? "Aggiorna template" : "Crea template"}
            </button>
          </form>
          </AppModal>

          <div style={{ marginTop: 10, fontSize: 12 }}>
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  {
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
                  }
                }
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  marginBottom: 6,
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                {t.name} · {t.trigger_type} · {t.offset_hours}h
              </button>
            ))}
          </div>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 14 }}>Message jobs</h2>
          <div style={{ maxHeight: 320, overflowY: "auto", fontSize: 12 }}>
            {jobs.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Nessun job in coda.</p>
            ) : (
              jobs.map((j) => (
                <div
                  key={j.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "6px 8px",
                    marginBottom: 6,
                  }}
                >
                  <div>
                    #{j.id} · booking #{j.booking_id} · {j.channel} · {j.status}
                  </div>
                  <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      style={button}
                      onClick={() => handleUpdateJobStatus(j.id, "scheduled")}
                    >
                      scheduled
                    </button>
                    <button
                      type="button"
                      style={button}
                      onClick={() => handleUpdateJobStatus(j.id, "sent")}
                    >
                      sent
                    </button>
                    <button
                      type="button"
                      style={button}
                      onClick={() => handleUpdateJobStatus(j.id, "failed")}
                    >
                      failed
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section style={card}>
        <h2 style={{ marginTop: 0, fontSize: 14 }}>Checklist housekeeping per task</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            style={input}
            value={checklistTaskId}
            onChange={(e) => setChecklistTaskId(e.target.value)}
            placeholder="Task ID"
          />
          <button type="button" style={button} onClick={handleLoadChecklist}>
            Carica checklist
          </button>
        </div>
        <form onSubmit={handleAddChecklistItem} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            style={input}
            value={checklistTitle}
            onChange={(e) => setChecklistTitle(e.target.value)}
            placeholder="Nuova voce checklist"
          />
          <button type="submit" style={button}>
            Aggiungi
          </button>
        </form>
        <div style={{ fontSize: 12 }}>
          {checklistItems.length === 0 ? (
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
                  padding: "6px 8px",
                  background: it.is_done ? "#ecfdf5" : "#fff",
                  cursor: "pointer",
                }}
              >
                {it.is_done ? "✓ " : "○ "}
                {it.title}
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default OpsAutomation;

