import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Modal from "./Modal";

/**
 * Mirrors how pages actually use Modal: `onClose` is an inline arrow, so its
 * identity changes on every render, and typing re-renders the parent.
 */
function FormHarness({ onClose = () => {} }) {
  const [value, setValue] = useState("");
  return (
    <Modal open onClose={() => onClose(value)} title="Nuova prenotazione">
      <input
        aria-label="Nome"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </Modal>
  );
}

function type(input, text) {
  for (const char of text) {
    fireEvent.change(input, { target: { value: input.value + char } });
  }
}

describe("Modal", () => {
  it("keeps focus in the field while typing re-renders the parent", () => {
    render(<FormHarness />);
    const input = screen.getByLabelText("Nome");
    input.focus();

    type(input, "Mario");

    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue("Mario");
  });

  it("closes on Escape with the latest onClose after re-renders", () => {
    const onClose = vi.fn();
    render(<FormHarness onClose={onClose} />);
    const input = screen.getByLabelText("Nome");

    type(input, "Mario");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("Mario");
  });

  it("focuses the dialog on open and restores the trigger on close", () => {
    function ToggleHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Apri
          </button>
          <Modal open={open} onClose={() => setOpen(false)} title="Nuova prenotazione">
            <input aria-label="Nome" />
          </Modal>
        </>
      );
    }

    render(<ToggleHarness />);
    const trigger = screen.getByRole("button", { name: "Apri" });
    trigger.focus(); // jsdom's click does not move focus the way a real one does
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
