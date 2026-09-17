import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Bookings from "./Bookings";
import { ToastProvider } from "../components/ui";
import * as api from "../services/api";

vi.mock("../services/api", () => ({ getBookings: vi.fn(), getUnits: vi.fn(), createBooking: vi.fn(), updateBooking: vi.fn(), deleteBooking: vi.fn() }));
vi.mock("../config/rbac", () => ({ canEditOperations: () => true }));
const booking = { id: 1, unit_id: 2, guest_name: "Sara", status: "confirmed", source: "direct", checkin_date: "2030-02-01", checkout_date: "2030-02-03", num_adults: 2, num_children: 0 };
beforeEach(() => {
  vi.clearAllMocks();
  api.getBookings.mockResolvedValue([booking]);
  api.getUnits.mockResolvedValue([{ id: 2, name: "Terrazza" }]);
  api.updateBooking.mockImplementation(async (id, data) => ({ ...booking, ...data, id }));
  api.createBooking.mockImplementation(async data => ({ ...data, id: 3 }));
});
function LocationProbe() { return <output data-testid="location">{useLocation().search}</output>; }
function mount(path) {
  render(<MemoryRouter initialEntries={[path]}><ToastProvider><Bookings /><LocationProbe /></ToastProvider></MemoryRouter>);
}
describe("booking navigation intent", () => {
  it("edits a linked booking and does not reopen after the saved collection changes", async () => {
    mount("/bookings?booking_id=1&view=arrivals&date=2030-02-01");
    await screen.findByRole("dialog");
    expect(screen.getByLabelText("Nome e Cognome")).toHaveValue("Sara");
    fireEvent.change(screen.getByLabelText("Note interne"), { target: { value: "Updated" } });
    fireEvent.submit(document.getElementById("booking-form"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateBooking).toHaveBeenCalledWith(1, expect.objectContaining({ notes: "Updated" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?view=arrivals&date=2030-02-01"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("starts a new stay from a dated link and clears its intent on close", async () => {
    mount("/bookings?new_booking=1&date=2030-02-10&unit_id=2");
    await screen.findByRole("dialog");
    expect(screen.getByLabelText("Check-in")).toHaveValue("2030-02-10");
    expect(screen.getByLabelText("Check-out")).toHaveValue("2030-02-11");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("new_booking"));
  });
  it("converts legacy calendar state without overwriting subsequent typing", async () => {
    mount({ pathname: "/bookings", state: { editBookingId: 1 } });
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("booking_id=1"));
    fireEvent.change(screen.getByLabelText("Nome e Cognome"), { target: { value: "Sara Rossi" } });
    expect(screen.getByLabelText("Nome e Cognome")).toHaveValue("Sara Rossi");
  });
});
