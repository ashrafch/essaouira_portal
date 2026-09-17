import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";
import * as api from "../services/api";
import { getRole } from "../config/rbac";

vi.mock("../services/api", () => ({ getStaffTasks: vi.fn(), getBookings: vi.fn(), getUnits: vi.fn(), getTodayAlerts: vi.fn(), getDashboardSummary: vi.fn() }));
vi.mock("../components/dashboard/MonthOverview", () => ({ default: () => <div>Monthly view</div> }));
vi.mock("../config/rbac", async importOriginal => ({ ...await importOriginal(), getRole: vi.fn(() => "owner") }));
const arrival = { id: 1, unit_id: 2, guest_name: "Sara Rossi", status: "confirmed", checkin_date: "2030-02-01", checkout_date: "2030-02-03", num_adults: 2 };
beforeEach(() => {
  vi.clearAllMocks();
  getRole.mockReturnValue("owner");
  api.getDashboardSummary.mockResolvedValue({ date: "2030-02-01", arrivals_today: 2, departures_today: 1, staff_tasks_open: 99 });
  api.getBookings.mockResolvedValue([arrival, { ...arrival, id: 2, guest_name: "Luca Bianchi", checkin_date: "2030-01-30", checkout_date: "2030-02-01" }, { ...arrival, id: 3, status: "pending" }]);
  api.getUnits.mockResolvedValue([{ id: 2, name: "Terrazza" }]);
  api.getStaffTasks.mockResolvedValue([]);
  api.getTodayAlerts.mockResolvedValue([]);
});
function mount(path = "/") { render(<MemoryRouter initialEntries={[path]}><Dashboard /></MemoryRouter>); }
describe("operational dashboard", () => {
  it("uses the server date and links the exact booking and dated filters", async () => {
    mount();
    expect(await screen.findByText("Sara Rossi")).toBeInTheDocument();
    expect(api.getStaffTasks).toHaveBeenCalledWith({ date: "2030-02-01" });
    expect(screen.getByRole("link", { name: /^Arrivi/ })).toHaveAttribute("href", "/bookings?view=arrivals&date=2030-02-01");
    expect(screen.getByRole("link", { name: /^Arrivi/ })).toHaveTextContent("Arrivi1");
    expect(screen.getByRole("link", { name: /^Attivita aperte oggi/ })).toHaveTextContent("oggi0");
    expect(screen.getByRole("link", { name: /Sara Rossi/ })).toHaveAttribute("href", "/bookings?booking_id=1");
    expect(screen.getByText(/Terrazza/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Partenze" }));
    expect(screen.getByText("Luca Bianchi")).toBeInTheDocument();
    expect(screen.queryByText("Sara Rossi")).not.toBeInTheDocument();
  });
  it("preserves agenda search while refreshing", async () => {
    mount();
    await screen.findByText("Sara Rossi");
    fireEvent.change(screen.getByLabelText("Cerca in agenda"), { target: { value: "nobody" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna dashboard" }));
    await waitFor(() => expect(api.getBookings).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Cerca in agenda")).toHaveValue("nobody");
    expect(screen.getByText("Nessun ospite corrisponde alla ricerca.")).toBeInTheDocument();
  });
  it("keeps successful sections and distinguishes unavailable data from empty data", async () => {
    api.getDashboardSummary.mockRejectedValue(new Error("offline"));
    api.getBookings.mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(/riepilogo, prenotazioni/);
    expect(screen.getByText("Agenda non disponibile.")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /^Arrivi/ })).getByText("N/D")).toBeInTheDocument();
    expect(screen.getByText("Nessuna attivita programmata oggi.")).toBeInTheDocument();
  });
  it("supports keyboard switching and browser-addressable performance view", async () => {
    mount();
    await screen.findByText("Sara Rossi");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Oggi" }), { key: "ArrowRight" });
    expect(screen.getByText("Monthly view")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Andamento" })).toHaveFocus();
  });
  it("does not expose create or staff controls to a viewer", async () => {
    getRole.mockReturnValue("viewer");
    mount();
    await screen.findByText("Sara Rossi");
    expect(screen.queryByRole("button", { name: "Nuova prenotazione" })).not.toBeInTheDocument();
    expect(api.getStaffTasks).not.toHaveBeenCalled();
  });
  it("does not expose the business view to an operator", async () => {
    getRole.mockReturnValue("operator");
    mount("/?view=performance");
    await screen.findByText("Sara Rossi");
    expect(screen.queryByText("Monthly view")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Andamento" })).not.toBeInTheDocument();
  });
});
