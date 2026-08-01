import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UnitWorkflowPanel from "./UnitWorkflowPanel";
import ToastProvider from "../ui/ToastProvider";

const { getSmartUnitCapabilities, runSmartUnitWorkflow } = vi.hoisted(() => ({
  getSmartUnitCapabilities: vi.fn(),
  runSmartUnitWorkflow: vi.fn(),
}));

vi.mock("../../services/api", () => ({ getSmartUnitCapabilities, runSmartUnitWorkflow }));
vi.mock("../../config/rbac", () => ({ getRole: () => "owner" }));

function capabilities(overrides = {}) {
  return {
    unit_id: 3,
    unit_name: "Unit A",
    capabilities: [
      {
        capability_key: "status.stay",
        device_id: 11,
        device_name: "Stato soggiorno A1",
        external_id: "input_select.a1_stay_status",
        category: "stay_status",
        zone_key: "a1",
        provider: "villacore",
        commands: ["device.select.set_option"],
        state: { online: true, value: "Libero" },
      },
    ],
    workflows: [
      {
        workflow: "checkin",
        label: "Check-in",
        capability_key: "workflow.checkin",
        command_type: "device.script.run",
        available: true,
        needs_confirmation: false,
      },
      {
        workflow: "checkout",
        label: "Check-out",
        capability_key: "workflow.checkout",
        command_type: "device.script.run",
        available: true,
        needs_confirmation: true,
      },
      {
        workflow: "lights_off",
        label: "Spegni luci",
        capability_key: "workflow.lights_off",
        command_type: "device.script.run",
        available: false,
        needs_confirmation: true,
      },
    ],
    ...overrides,
  };
}

function renderPanel(props = {}) {
  return render(
    <ToastProvider>
      <UnitWorkflowPanel unitId={3} {...props} />
    </ToastProvider>,
  );
}

describe("UnitWorkflowPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSmartUnitCapabilities.mockResolvedValue(capabilities());
  });

  it("renders one button per workflow and disables the ones the building lacks", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: /Check-in/ })).toBeEnabled());
    expect(screen.getByRole("button", { name: /Spegni luci/ })).toBeDisabled();
    expect(screen.getByText(/2 disponibili su 3/)).toBeInTheDocument();
  });

  it("dispatches a non-destructive workflow immediately", async () => {
    runSmartUnitWorkflow.mockResolvedValue({
      workflow: "checkin",
      label: "Check-in",
      accepted: true,
      status: "executed",
      correlation_id: "abc",
    });
    renderPanel({ bookingId: 42 });
    await waitFor(() => expect(screen.getByRole("button", { name: /Check-in/ })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /Check-in/ }));
    await waitFor(() =>
      expect(runSmartUnitWorkflow).toHaveBeenCalledWith(3, "checkin", { booking_id: 42 }),
    );
  });

  it("confirms before a destructive workflow", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: /Check-out/ })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /Check-out/ }));
    expect(runSmartUnitWorkflow).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(/riattivazione resta\s+manuale/i);

    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() =>
      expect(runSmartUnitWorkflow).toHaveBeenCalledWith(3, "checkout", {}),
    );
  });

  it("shows the building's refusal instead of claiming success", async () => {
    runSmartUnitWorkflow.mockResolvedValue({
      workflow: "checkin",
      label: "Check-in",
      accepted: false,
      status: "failed",
      error_message: "finestra aperta: clima non avviato",
      correlation_id: "abc",
    });
    renderPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: /Check-in/ })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /Check-in/ }));
    // Shown twice on purpose: as a toast for the action just taken, and inline
    // so the reason stays visible while the operator decides what to do.
    await waitFor(() =>
      expect(screen.getAllByText(/finestra aperta: clima non avviato/)).toHaveLength(2),
    );
  });

  it("explains when the building exposes no workflow at all", async () => {
    getSmartUnitCapabilities.mockResolvedValue(
      capabilities({
        workflows: [
          {
            workflow: "checkin",
            label: "Check-in",
            capability_key: "workflow.checkin",
            command_type: "device.script.run",
            available: false,
            needs_confirmation: false,
          },
        ],
      }),
    );
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/Nessun workflow disponibile/)).toBeInTheDocument(),
    );
  });

  it("shows live capability values", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Stato soggiorno/)).toBeInTheDocument());
    expect(screen.getByText("Libero")).toBeInTheDocument();
  });

  it("renders housekeeping as a choice of states, not a single button", async () => {
    getSmartUnitCapabilities.mockResolvedValue(
      capabilities({
        workflows: [
          {
            workflow: "housekeeping_set",
            label: "Stato pulizie",
            capability_key: "workflow.housekeeping_set",
            command_type: "device.script.run",
            available: true,
            needs_confirmation: false,
            options: ["Da fare", "In corso", "Fatto"],
          },
        ],
      }),
    );
    runSmartUnitWorkflow.mockResolvedValue({
      workflow: "housekeeping_set",
      label: "Pulizie: Da fare",
      accepted: true,
      status: "executed",
      correlation_id: "abc",
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Stato pulizie/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Da fare" }));
    await waitFor(() =>
      expect(runSmartUnitWorkflow).toHaveBeenCalledWith(3, "housekeeping_set", {
        variables: { status: "Da fare" },
      }),
    );
  });
});
