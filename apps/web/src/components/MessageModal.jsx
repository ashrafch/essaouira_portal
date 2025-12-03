import { useState, useEffect } from "react";

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
  maxWidth: 480,
  boxShadow: "0 20px 40px rgba(15,23,42,0.2)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const textareaStyle = {
  width: "100%",
  minHeight: 120,
  padding: 12,
  borderRadius: 8,
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
  backgroundColor: "#f3f4f6",
  color: "#374151",
};

const btnSend = {
  ...btnBase,
  backgroundColor: "#25d366", // WhatsApp green
  color: "white",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

// Definiamo i template predefiniti
const TEMPLATES = [
  {
    id: "welcome",
    label: "Benvenuto & Posizione",
    text: `Ciao {guest_name}! 👋\nSiamo felici di accoglierti a Essaouira.\n\nEcco la posizione esatta della struttura:\n📍 https://goo.gl/maps/ESEMPIO_POSIZIONE\n\nIl tuo appartamento è: {unit_name}.\nTi aspettiamo per il check-in dalle 15:00.\nA presto!`,
  },
  {
    id: "wifi",
    label: "Info WiFi",
    text: `Ciao {guest_name},\necco i dati per il WiFi 📶:\n\nRete: Essaouira_Guest\nPassword: guest2025\n\nSe hai bisogno di altro, siamo a disposizione!`,
  },
  {
    id: "checkout",
    label: "Istruzioni Check-out",
    text: `Buongiorno {guest_name},\nsperiamo tu abbia passato un ottimo soggiorno! ☀️\n\nTi ricordiamo che il check-out è previsto entro le 10:00.\nPer favore lascia le chiavi sul tavolo o alla reception.\n\nGrazie e buon viaggio!`,
  },
  {
    id: "custom",
    label: "Messaggio Vuoto",
    text: "",
  },
];

function MessageModal({ isOpen, onClose, booking, unitName }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("welcome");
  const [message, setMessage] = useState("");

  // Funzione che sostituisce i placeholder con i dati reali
  function compileTemplate(text) {
    if (!text) return "";
    let compiled = text;
    compiled = compiled.replace(/{guest_name}/g, booking?.guest_name || "Ospite");
    compiled = compiled.replace(/{unit_name}/g, unitName || "il tuo appartamento");
    return compiled;
  }

  // Quando cambia il booking o il template selezionato, aggiorna il testo
  useEffect(() => {
    if (isOpen && booking) {
      const tmpl = TEMPLATES.find((t) => t.id === selectedTemplateId);
      if (tmpl) {
        setMessage(compileTemplate(tmpl.text));
      }
    }
  }, [isOpen, booking, selectedTemplateId, unitName]);

  if (!isOpen || !booking) return null;

  function handleSend() {
    if (!booking.guest_phone) {
      alert("Nessun numero di telefono per questo ospite.");
      return;
    }
    
    // Pulisci il numero e crea il link
    const cleanPhone = booking.guest_phone.replace(/[^0-9+]/g, "");
    const encodedText = encodeURIComponent(message);
    const url = `https://wa.me/${cleanPhone}?text=${encodedText}`;
    
    window.open(url, "_blank");
    onClose();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Invia Messaggio WhatsApp</h2>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            A: <strong>{booking.guest_name}</strong> ({booking.guest_phone || "Nessun numero"})
          </p>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
            Scegli Template
          </label>
          <select
            style={selectStyle}
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
            Anteprima Messaggio (modificabile)
          </label>
          <textarea
            style={textareaStyle}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div style={footerStyle}>
          <button style={btnCancel} onClick={onClose}>
            Annulla
          </button>
          <button style={btnSend} onClick={handleSend}>
            <span>💬</span> Invia su WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

export default MessageModal;