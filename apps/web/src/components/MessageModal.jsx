import { useState } from "react";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "var(--color-overlay)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 60,
};

const modalStyle = {
  backgroundColor: "var(--color-surface)",
  borderRadius: 16,
  padding: 24,
  width: "100%",
  maxWidth: 480,
  boxShadow: "var(--shadow-lg)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const textareaStyle = {
  width: "100%",
  minHeight: 120,
  padding: 12,
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  fontSize: 14,
  fontFamily: "inherit",
  resize: "vertical",
  lineHeight: 1.5,
};

const selectStyle = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  fontSize: 14,
  marginBottom: 12,
};

const footerStyle = {
  display: "flex",
  justifyContent: "flex-end",
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
  backgroundColor: "var(--color-surface-soft)",
  color: "var(--color-text-muted)",
};

const btnSend = {
  ...btnBase,
  backgroundColor: "#25d366",
  color: "white",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const TEMPLATES = [
  {
    id: "welcome",
    label: "Benvenuto & Posizione",
    text: `Ciao {guest_name}!\nSiamo felici di accoglierti a Essaouira.\n\nEcco la posizione esatta della struttura:\nhttps://goo.gl/maps/ESEMPIO_POSIZIONE\n\nIl tuo appartamento è: {unit_name}.\nTi aspettiamo per il check-in dalle 15:00.\nA presto!`,
  },
  {
    id: "wifi",
    label: "Info WiFi",
    text: `Ciao {guest_name},\necco i dati per il WiFi:\n\nRete: Essaouira_Guest\nPassword: guest2025\n\nSe hai bisogno di altro, siamo a disposizione!`,
  },
  {
    id: "checkout",
    label: "Istruzioni Check-out",
    text: `Buongiorno {guest_name},\nsperiamo tu abbia passato un ottimo soggiorno.\n\nTi ricordiamo che il check-out è previsto entro le 10:00.\nPer favore lascia le chiavi sul tavolo o alla reception.\n\nGrazie e buon viaggio!`,
  },
  {
    id: "custom",
    label: "Messaggio Vuoto",
    text: "",
  },
];

function MessageModal({ isOpen, onClose, booking, unitName }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("welcome");
  const [customMessage, setCustomMessage] = useState("");

  function compileTemplate(text) {
    if (!text) return "";
    let compiled = text;
    compiled = compiled.replace(/{guest_name}/g, booking?.guest_name || "Ospite");
    compiled = compiled.replace(/{unit_name}/g, unitName || "il tuo appartamento");
    return compiled;
  }

  const templateMessage = (() => {
    const tmpl = TEMPLATES.find((t) => t.id === selectedTemplateId);
    return compileTemplate(tmpl?.text || "");
  })();

  const message = customMessage === "" ? templateMessage : customMessage;

  if (!isOpen || !booking) return null;

  function handleSend() {
    if (!booking.guest_phone) {
      alert("Nessun numero di telefono per questo ospite.");
      return;
    }

    const cleanPhone = booking.guest_phone.replace(/[^0-9+]/g, "");
    const encodedText = encodeURIComponent(message);
    const url = `https://wa.me/${cleanPhone}?text=${encodedText}`;

    window.open(url, "_blank");
    onClose();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invia messaggio WhatsApp"
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Invia Messaggio WhatsApp</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            A: <strong>{booking.guest_name}</strong> ({booking.guest_phone || "Nessun numero"})
          </p>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
            Scegli Template
          </label>
          <select
            style={selectStyle}
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value);
              setCustomMessage("");
            }}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
            Anteprima Messaggio (modificabile)
          </label>
          <textarea
            style={textareaStyle}
            value={message}
            onChange={(e) => setCustomMessage(e.target.value)}
          />
        </div>

        <div style={footerStyle}>
          <button style={btnCancel} onClick={onClose}>
            Annulla
          </button>
          <button style={btnSend} onClick={handleSend} disabled={!booking.guest_phone}>
            <span>WA</span> Invia su WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

export default MessageModal;
