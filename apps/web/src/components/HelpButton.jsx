import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Info } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { resolveHelp, GENERAL } from "../config/helpTopics";

/**
 * Contextual help. An "i" button in the top bar opens a short tutorial for the
 * current page (falls back to the general portal guide). Present on every page.
 */
export default function HelpButton() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const topic = resolveHelp(pathname);
  const isGeneral = topic === GENERAL;

  return (
    <>
      <button
        type="button"
        className="chrome-icon-btn"
        onClick={() => setOpen(true)}
        aria-label="Aiuto e guida della pagina"
        title="Come si usa questa pagina"
      >
        <Info size={16} aria-hidden="true" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={topic.title}
        description={topic.intro}
        footer={
          <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
            Ho capito
          </Button>
        }
      >
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 14,
            color: "var(--color-text)",
            lineHeight: 1.45,
          }}
        >
          {topic.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>

        {!isGeneral ? (
          <p
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--color-border)",
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            Suggerimento: premi <strong>Ctrl/⌘ + K</strong> per la ricerca rapida
            dei comandi; l'icona “i” mostra sempre la guida della pagina corrente.
          </p>
        ) : null}
      </Modal>
    </>
  );
}
