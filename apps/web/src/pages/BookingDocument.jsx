import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBookings, getUnits } from "../services/api";

// --- STILI SCHERMO ---
const screenContainerStyle = {
  backgroundColor: "#525252",
  minHeight: "100vh",
  padding: "40px 20px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const controlsStyle = {
  width: "100%",
  maxWidth: "210mm",
  marginBottom: "20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  backgroundColor: "white",
  padding: "10px 20px",
  borderRadius: "8px",
  boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
};

// --- STILI FOGLIO A4 ---
const a4PageStyle = {
  width: "210mm",
  minHeight: "297mm",
  padding: "20mm",
  backgroundColor: "white",
  color: "#111827",
  fontFamily: "'Times New Roman', serif",
  fontSize: "12pt",
  boxShadow: "0 0 20px rgba(0,0,0,0.5)", // Ombra solo a schermo
  position: "relative",
  boxSizing: "border-box",
  margin: "0 auto",
};

// --- BOTTONI ---
const btn = {
  padding: "8px 16px",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  backgroundColor: "white",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "14px",
  color: "#374151",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const btnPrimary = {
  ...btn,
  backgroundColor: "#0f766e",
  color: "white",
  border: "none",
};

// --- CSS DI STAMPA POTENZIATO ---
const printCss = `
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  /* Nascondi tutto di default */
  body, html, #root, .screen-layout {
    background-color: white !important;
    height: auto !important;
    overflow: visible !important;
  }

  /* Nascondi esplicitamente la barra di controllo */
  .no-print {
    display: none !important;
    opacity: 0 !important;
    height: 0 !important;
    overflow: hidden !important;
  }

  /* Gestione wrapper di stampa */
  .printable-area-wrapper {
    display: block !important;
    position: fixed; /* Stacca dal flusso normale */
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 9999; /* Sopra tutto */
    background-color: white;
    margin: 0;
    padding: 0;
  }

  /* Stile foglio in stampa */
  .a4-page {
    box-shadow: none !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: none !important;
    padding: 20mm !important;
    page-break-after: always;
  }
}
`;

function formatDate(d) {
  if (!d) return "________________";
  return new Date(d).toLocaleDateString("it-IT");
}

function BookingDocument() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [unit, setUnit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState("registration");
  
  const documentRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const [bks, uns] = await Promise.all([getBookings(), getUnits()]);
        const foundBooking = bks.find((b) => String(b.id) === bookingId);
        if (foundBooking) {
          setBooking(foundBooking);
          const foundUnit = uns.find((u) => u.id === foundBooking.unit_id);
          setUnit(foundUnit);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bookingId]);

  const handleDownloadPdf = async () => {
    const element = documentRef.current;
    if (!element) return;
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      
      const fileName = `${docType}_${booking.guest_name.replace(/\s+/g, "_")}.pdf`;
      pdf.save(fileName);
    } catch {
      alert("Errore durante la creazione del PDF.");
    }
  };

  if (loading) return <div style={{ padding: 20, color: "white" }}>Caricamento documento...</div>;
  if (!booking) return <div style={{ padding: 20, color: "white" }}>Prenotazione non trovata.</div>;

  const totalAmount = Number(booking.total_price || 0);
  const cleaning = Number(booking.cleaning_fee || 0);
  const tax = Number(booking.city_tax || 0);
  const baseAmount = totalAmount - cleaning - tax;

  return (
    <div className="screen-layout" style={screenContainerStyle}>
      <style>{printCss}</style>

      {/* BARRA DI CONTROLLO - Classe no-print fondamentale */}
      <div className="no-print" style={controlsStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button style={btn} onClick={() => navigate("/bookings")}>
            <span>⬅</span> Torna a Prenotazioni
          </button>
          
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "14px", color: "#6b7280" }}>Documento:</span>
            <select 
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #d1d5db", cursor: "pointer" }} 
              value={docType} 
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="registration">Scheda Alloggiato (Check-in)</option>
              <option value="receipt">Ricevuta (Pagamento)</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={() => window.print()}>
            🖨️ Stampa
          </button>
          <button style={btnPrimary} onClick={handleDownloadPdf}>
            ⬇️ Scarica PDF
          </button>
        </div>
      </div>

      {/* WRAPPER DI STAMPA */}
      <div className="printable-area-wrapper">
        <div ref={documentRef} className="a4-page" style={a4PageStyle}>
          
          {/* INTESTAZIONE */}
          <div style={{ textAlign: "center", marginBottom: "15mm", borderBottom: "2px solid #111827", paddingBottom: "5mm" }}>
            <h1 style={{ margin: 0, fontSize: "24pt", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold" }}>
              Villa Essaouira
            </h1>
            <p style={{ margin: "3mm 0 0 0", fontSize: "10pt", color: "#4b5563", fontFamily: "sans-serif" }}>
              Gestione Appartamenti Turistici<br />
              Essaouira, Marocco · Tel: +212 600 000 000
            </p>
          </div>

          {/* CONTENUTO SCHEDA */}
          {docType === "registration" && (
            <div>
              <h2 style={{ textAlign: "center", marginBottom: "15mm", fontSize: "16pt", textTransform: "uppercase", textDecoration: "underline" }}>
                Scheda di Registrazione Ospiti
              </h2>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10mm 15mm", marginBottom: "15mm", fontSize: "12pt" }}>
                <div>
                  <div style={{ fontSize: "9pt", textTransform: "uppercase", color: "#6b7280", marginBottom: "2px" }}>Ospite Principale</div>
                  <div style={{ fontSize: "13pt", fontWeight: "bold", borderBottom: "1px solid #000", paddingBottom: "2px" }}>
                    {booking.guest_name}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "9pt", textTransform: "uppercase", color: "#6b7280", marginBottom: "2px" }}>Appartamento</div>
                  <div style={{ fontSize: "13pt", fontWeight: "bold", borderBottom: "1px solid #000", paddingBottom: "2px" }}>
                    {unit ? unit.name : `Unit #${booking.unit_id}`}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "9pt", textTransform: "uppercase", color: "#6b7280", marginBottom: "2px" }}>Data Arrivo</div>
                  <div style={{ fontSize: "12pt", borderBottom: "1px solid #000", paddingBottom: "2px" }}>
                    {formatDate(booking.checkin_date)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "9pt", textTransform: "uppercase", color: "#6b7280", marginBottom: "2px" }}>Data Partenza</div>
                  <div style={{ fontSize: "12pt", borderBottom: "1px solid #000", paddingBottom: "2px" }}>
                    {formatDate(booking.checkout_date)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "9pt", textTransform: "uppercase", color: "#6b7280", marginBottom: "2px" }}>Pax Totali</div>
                  <div style={{ fontSize: "12pt", borderBottom: "1px solid #000", paddingBottom: "2px" }}>
                    {(booking.num_adults || 1) + (booking.num_children || 0)} <span style={{fontSize: "10pt"}}>({booking.num_adults} ad, {booking.num_children} ch)</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "9pt", textTransform: "uppercase", color: "#6b7280", marginBottom: "2px" }}>Telefono</div>
                  <div style={{ fontSize: "12pt", borderBottom: "1px solid #000", paddingBottom: "2px" }}>
                    {booking.guest_phone || "_________________"}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "15mm" }}>
                <strong style={{ fontSize: "12pt", display: "block", marginBottom: "5mm" }}>
                  Altri Ospiti (Nome, Cognome, Estremi Documento):
                </strong>
                <div style={{ borderBottom: "1px dashed #999", height: "8mm", marginBottom: "2mm" }}></div>
                <div style={{ borderBottom: "1px dashed #999", height: "8mm", marginBottom: "2mm" }}></div>
                <div style={{ borderBottom: "1px dashed #999", height: "8mm", marginBottom: "2mm" }}></div>
                <div style={{ borderBottom: "1px dashed #999", height: "8mm", marginBottom: "2mm" }}></div>
              </div>

              <p style={{ fontSize: "10pt", textAlign: "justify", lineHeight: "1.4", marginBottom: "20mm", color: "#374151" }}>
                Il sottoscritto autorizza il trattamento dei propri dati personali per le finalità legate al soggiorno e agli obblighi di legge di Pubblica Sicurezza.
              </p>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ textAlign: "center", width: "40%" }}>
                  <div style={{ borderBottom: "1px solid black", marginBottom: "4mm", height: "1px" }}></div>
                  <div style={{ fontSize: "10pt" }}>Firma Gestore</div>
                </div>
                <div style={{ textAlign: "center", width: "40%" }}>
                  <div style={{ borderBottom: "1px solid black", marginBottom: "4mm", height: "1px" }}></div>
                  <div style={{ fontSize: "10pt" }}>Firma Ospite</div>
                </div>
              </div>
            </div>
          )}

          {/* CONTENUTO: RICEVUTA */}
          {docType === "receipt" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "15mm" }}>
                <h2 style={{ margin: 0, fontSize: "20pt", fontWeight: "bold" }}>RICEVUTA PRO-FORMA</h2>
                <div style={{ fontSize: "11pt", textAlign: "right" }}>
                  <strong>Data:</strong> {new Date().toLocaleDateString("it-IT")}<br />
                  <strong>Rif. Booking:</strong> #{booking.id}
                </div>
              </div>

              <div style={{ marginBottom: "10mm", padding: "5mm", border: "1px solid #e2e8f0", borderRadius: "4px" }}>
                <strong style={{ fontSize: "9pt", textTransform: "uppercase", color: "#6b7280", display: "block", marginBottom: "2mm" }}>Intestato a:</strong>
                <div style={{ fontSize: "14pt", fontWeight: "bold" }}>{booking.guest_name}</div>
                <div style={{ fontSize: "11pt" }}>{booking.guest_email || ""}</div>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15mm", fontSize: "11pt" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #111827" }}>
                    <th style={{ textAlign: "left", padding: "3mm 0" }}>Descrizione</th>
                    <th style={{ textAlign: "right", padding: "3mm 0" }}>Importo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "4mm 0" }}>
                      <strong>Soggiorno presso {unit ? unit.name : "Appartamento"}</strong><br />
                      <span style={{ fontSize: "10pt", color: "#6b7280" }}>
                        Dal {formatDate(booking.checkin_date)} al {formatDate(booking.checkout_date)}
                        <br />
                        ({(Number(booking.total_price || 0) - Number(booking.cleaning_fee || 0) - Number(booking.city_tax || 0)).toFixed(2)} € tariffa base)
                      </span>
                    </td>
                    <td style={{ textAlign: "right", padding: "4mm 0", verticalAlign: "top" }}>
                      {booking.currency} {baseAmount.toFixed(2)}
                    </td>
                  </tr>
                  {cleaning > 0 && (
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "4mm 0" }}>Spese di pulizia finale</td>
                      <td style={{ textAlign: "right", padding: "4mm 0" }}>
                        {booking.currency} {cleaning.toFixed(2)}
                      </td>
                    </tr>
                  )}
                  {tax > 0 && (
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "4mm 0" }}>Tassa di soggiorno</td>
                      <td style={{ textAlign: "right", padding: "4mm 0" }}>
                        {booking.currency} {tax.toFixed(2)}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid #111827", fontSize: "14pt" }}>
                    <td style={{ padding: "5mm 0", fontWeight: "bold" }}>TOTALE</td>
                    <td style={{ textAlign: "right", padding: "5mm 0", fontWeight: "bold" }}>
                      {booking.currency} {totalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div style={{ textAlign: "right", marginTop: "15mm" }}>
                <div style={{ 
                  display: "inline-block", 
                  padding: "4mm 10mm", 
                  border: booking.is_paid ? "3px solid #16a34a" : "3px solid #dc2626",
                  color: booking.is_paid ? "#16a34a" : "#dc2626",
                  fontWeight: "bold",
                  fontSize: "16pt",
                  transform: "rotate(-5deg)",
                  borderRadius: "8px",
                  opacity: 0.8
                }}>
                  {booking.is_paid ? "PAGATO" : "DA PAGARE"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BookingDocument;

