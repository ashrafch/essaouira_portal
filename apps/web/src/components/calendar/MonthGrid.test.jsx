import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import MonthGrid from "./MonthGrid";

const date = new Date(2026, 8, 17);
const bookings = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1, guest_name: `Ospite molto lungo ${i + 1}`, unit_id: i + 1,
  _checkin: date, _checkout: new Date(2026, 8, 19), _nights: 2,
  status: "confirmed", source: "direct",
}));
function setup(overrides = {}) {
  const props = {
    weeks: [[date]], month: 8, today: date, bookingsByDay: { "2026-09-17": bookings },
    unitMap: { 1: { name: "Terrazza" } }, canEdit: true, fromCache: false,
    onDragStart: vi.fn(), onDragEnd: vi.fn(), onDragOver: vi.fn(), onDrop: vi.fn(),
    onOpenBooking: vi.fn(), onCreateBooking: vi.fn(), ...overrides,
  };
  return { ...render(<MonthGrid {...props} />), props };
}

describe("MonthGrid", () => {
  it("limits previews and opens every booking in the day detail", () => {
    const { container, props } = setup();
    expect(container.querySelectorAll(".occupancy-booking")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Altre 7 prenotazioni: 17 settembre 2026" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(within(dialog).getByRole("button", { name: /Ospite molto lungo 10/ }));
    expect(props.onOpenBooking).toHaveBeenCalledWith(10);
  });

  it("restores focus on Escape and supports empty-day creation", () => {
    const { props } = setup({ bookingsByDay: {} });
    const trigger = screen.getByRole("button", { name: "17 settembre 2026: 0 prenotazioni" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByText("Nessuna prenotazione in soggiorno.")).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Nuova prenotazione: 17 settembre 2026" }));
    expect(props.onCreateBooking).toHaveBeenCalledWith(date);
  });

  it.each([{ canEdit: false }, { fromCache: true }])("disables mutation affordances for %j", overrides => {
    const { container, props } = setup(overrides);
    expect(screen.queryByRole("button", { name: /Nuova prenotazione/ })).not.toBeInTheDocument();
    const booking = container.querySelector(".occupancy-booking");
    expect(booking).toHaveAttribute("draggable", "false");
    fireEvent.dragStart(booking);
    expect(props.onDragStart).not.toHaveBeenCalled();
    fireEvent.click(booking);
    expect(props.onOpenBooking).toHaveBeenCalledWith(1);
  });

  it("only drags check-in days and preserves drop handling", () => {
    const tomorrow = new Date(2026, 8, 18);
    const { container, props } = setup({ weeks: [[date, tomorrow]], bookingsByDay: { "2026-09-17": bookings, "2026-09-18": bookings } });
    const previews = container.querySelectorAll(".occupancy-booking");
    expect(previews[0]).toHaveAttribute("draggable", "true");
    expect(previews[3]).toHaveAttribute("draggable", "false");
    fireEvent.dragStart(previews[0]);
    expect(props.onDragStart).toHaveBeenCalledWith(expect.anything(), bookings[0]);
    fireEvent.drop(container.querySelector('[data-date="2026-09-18"]'));
    expect(props.onDrop).toHaveBeenCalledWith(expect.anything(), tomorrow);
  });

  it("does not show an overflow control for three bookings", () => {
    setup({ bookingsByDay: { "2026-09-17": bookings.slice(0, 3) } });
    expect(screen.queryByRole("button", { name: /Altre/ })).not.toBeInTheDocument();
  });
});
