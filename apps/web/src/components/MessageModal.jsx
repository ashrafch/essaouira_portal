import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMessageTemplates,
  renderMessageTemplate,
  sendMessageNow,
} from "../services/api";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15,23,42,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 60,
};

const modalStyle = {
  backgroundColor: "white",
  borderRadius: 16,
  padding: 24,
  width: "100%",
  maxWidth: 560,
  boxShadow: "0 20px 40px rgba(15,23,42,0.2)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const textareaStyle = {
  width: "100%",
  minHeight: 130,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
  fontFamily: "inherit",
  resize: "vertical",
  lineHeight: 1.5,
};

const selectStyle = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
};

const footerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginTop: 8,
};

const btnBase = {
  padding: "8px 16px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  border: "none",
};

const btnCancel = {
  ...btnBase,
  backgroundColor: "#f3f4f6",
  color: "#374151",
};

const btnSend = {
  ...btnBase,
  backgroundColor: "#25d366",
  color: "white",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

function MessageModal({ isOpen, onClose, booking, contextTrigger = null }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [compiledMessage, setCompiledMessage] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingRender, setLoadingRender] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const visibleTemplates = useMemo(() => {
    const active = templates.filter((t) => Boolean(t.is_active));
    if (!contextTrigger) return active;
    const byTrigger = active.filter((t) => t.trigger_type === contextTrigger);
    return byTrigger.length > 0 ? byTrigger : active;
  }, [templates, contextTrigger]);

  const message = customMessage === "" ? compiledMessage : customMessage;

  const loadTemplates = useCallback(async () => {
    if (!isOpen || !booking) return;
    setLoadingTemplates(true);
    setError("");
    try {
      const data = await getMessageTemplates();
      const rows = data || [];
      setTemplates(rows);
      const activeRows = rows.filter((t) => Boolean(t.is_active));
      const target = contextTrigger
        ? activeRows.find((t) => t.trigger_type === contextTrigger) || activeRows[0]
        : activeRows[0];
      setSelectedTemplateId(target ? String(target.id) : "");
    } catch (err) {
      setError(err.message || "Errore caricando template");
    } finally {
      setLoadingTemplates(false);
    }
  }, [booking, contextTrigger, isOpen]);

  useEffect(() => {
    if (isOpen && booking) {
      loadTemplates();
    }
  }, [isOpen, booking, loadTemplates]);

  useEffect(() => {
    async function loadRenderedBody() {
      if (!booking || !selectedTemplateId) {
        setCompiledMessage("");
        setCustomMessage("");
        return;
      }
      setLoadingRender(true);
      setError("");
      try {
        const rendered = await renderMessageTemplate({
          booking_id: booking.id,
          template_id: Number(selectedTemplateId),
          channel: "whatsapp",
        });
        setCompiledMessage(rendered.body || "");
        setCustomMessage("");
      } catch (err) {
        setError(err.message || "Errore rendering template");
      } finally {
        setLoadingRender(false);
      }
    }

    if (isOpen) {
      loadRenderedBody();
    }
  }, [selectedTemplateId, booking, isOpen]);

  async function handleSend() {
    if (!booking || !selectedTemplateId) return;
    setSending(true);
    setError("");
    try {
      const result = await sendMessageNow({
        booking_id: booking.id,
        template_id: Number(selectedTemplateId),
        channel: "whatsapp",
        body_override: message,
      });
      if (!result.whatsapp_url) {
        throw new Error("Numero WhatsApp mancante o non valido");
      }
      window.open(result.whatsapp_url, "_blank");
      onClose();
    } catch (err) {
      setError(err.message || "Errore invio messaggio");
    } finally {
      setSending(false);
    }
  }

  if (!isOpen || !booking) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Invia Messaggio WhatsApp</h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            A: <strong>{booking.guest_name}</strong> ({booking.guest_phone || "Nessun numero"})
          </p>
        </div>

        {error ? <p style={{ fontSize: 12, color: "#b91c1c", margin: 0 }}>{error}</p> : null}

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
            Template Ops Automation
          </label>
          <select
            style={selectStyle}
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            disabled={loadingTemplates || visibleTemplates.length === 0}
          >
            {visibleTemplates.length === 0 ? (
              <option value="">Nessun template disponibile</option>
            ) : (
              visibleTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.trigger_type})
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
            Messaggio (puoi modificarlo prima dell invio)
          </label>
          <textarea
            style={textareaStyle}
            value={message}
            onChange={(e) => setCustomMessage(e.target.value)}
            disabled={loadingRender || !selectedTemplateId}
          />
        </div>

        <div style={footerStyle}>
          <button style={btnCancel} onClick={onClose}>
            Annulla
          </button>
          <button
            style={btnSend}
            onClick={handleSend}
            disabled={sending || loadingTemplates || loadingRender || !selectedTemplateId}
          >
            {sending ? "Invio..." : "Invia su WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MessageModal;
