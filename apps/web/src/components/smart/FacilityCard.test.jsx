import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FacilityCard from "./FacilityCard";
import ToastProvider from "../ui/ToastProvider";

function makeFacility(overrides = {}) {
  return {
    facility_key: "pool",
    display_name: "Piscina",
    machine: "filtration",
    health: "ok",
    state: "idle",
    mode: "Automatico",
    supervision_state: "Normale",
    alarm_active: false,
    devices_available: true,
    device_count: 7,
    metrics: [
      {
        capability_key: "metric.temperature",
        metric_type: "temperature",
        device_id: 1,
        device_name: "Temp acqua",
        value: "24.0",
        online: true,
      },
    ],
    interlocks: [
      {
        capability_key: "interlock.thermal_trip",
        name: "thermal_trip",
        device_id: 2,
        device_name: "Termica",
        value: "off",
        online: true,
      },
    ],
    open_alerts: [],
    actions: [
      {
        action: "safe_off",
        label: "Arresto sicuro",
        capability_key: "facility.safe_off",
        available: true,
        needs_confirmation: true,
      },
      {
        action: "alarm_reset",
        label: "Riarmo allarme",
        capability_key: "facility.alarm_reset",
        available: true,
        needs_confirmation: true,
      },
    ],
    ...overrides,
  };
}

function renderCard(props = {}) {
  return render(
    <ToastProvider>
      <FacilityCard facility={makeFacility()} canOperate onAction={vi.fn()} {...props} />
    </ToastProvider>,
  );
}

describe("FacilityCard", () => {
  it("shows the plant state, telemetry and interlocks", () => {
    renderCard();
    expect(screen.getByText("Piscina")).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(screen.getByText("Automatico")).toBeInTheDocument();
    expect(screen.getByText(/Temperatura/)).toBeInTheDocument();
    expect(screen.getByText(/thermal_trip/)).toBeInTheDocument();
  });

  it("exposes only safe-off and alarm rearm, never mode or manual start", () => {
    renderCard();
    expect(screen.getByRole("button", { name: /Arresto sicuro/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Riarmo allarme/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Avvia/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Modalit/i })).toBeNull();
  });

  it("asks for confirmation before dispatching an action", () => {
    const onAction = vi.fn();
    renderCard({ onAction });

    fireEvent.click(screen.getByRole("button", { name: /Arresto sicuro/ }));
    expect(onAction).not.toHaveBeenCalled();
    // The dialog must state that VillaCore keeps the physical interlocks.
    expect(screen.getByRole("dialog")).toHaveTextContent(/interblocchi fisici/i);

    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    expect(onAction).toHaveBeenCalledWith("pool", "safe_off");
  });

  it("does not offer an action the building does not implement", () => {
    // Metering and diagnostic zones (energy, PLC) have no state machine to stop
    // or rearm. A greyed-out button would imply an action that should exist.
    const facility = makeFacility({
      actions: [
        {
          action: "safe_off",
          label: "Arresto sicuro",
          capability_key: "facility.safe_off",
          available: false,
          needs_confirmation: true,
        },
        {
          action: "alarm_reset",
          label: "Riarmo allarme",
          capability_key: "facility.alarm_reset",
          available: false,
          needs_confirmation: true,
        },
      ],
    });
    renderCard({ facility });
    expect(screen.queryByRole("button", { name: /Arresto sicuro/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Riarmo allarme/ })).toBeNull();
    expect(screen.getByText(/Sola lettura/)).toBeInTheDocument();
  });

  it("disables actions for a read-only role", () => {
    renderCard({ canOperate: false });
    expect(screen.getByRole("button", { name: /Arresto sicuro/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Riarmo allarme/ })).toBeDisabled();
  });

  it("labels an estimated cost as an estimate", () => {
    renderCard({
      cost: {
        amount: 12.5,
        quantity: 50,
        unit_of_measure: "kWh",
        estimated: true,
        estimate_basis: "10 h x 750 W (nessun contatore)",
      },
    });
    expect(screen.getByText(/Costo del mese \(stima\)/)).toBeInTheDocument();
    expect(screen.getByText(/12.50 EUR/)).toBeInTheDocument();
  });

  it("surfaces open alerts on the card", () => {
    renderCard({
      facility: makeFacility({
        health: "alarm",
        alarm_active: true,
        open_alerts: [
          {
            id: 9,
            alert_type: "facility.safety_stop",
            severity: "critical",
            title: "Arresto di sicurezza impianto - Piscina",
            last_seen_at: "2026-07-31T10:00:00Z",
          },
        ],
      }),
    });
    expect(screen.getByText(/Arresto di sicurezza impianto/)).toBeInTheDocument();
    expect(screen.getByText("In allarme")).toBeInTheDocument();
  });
});
