import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ZoneMappingTable from "./ZoneMappingTable";

const UNITS = [
  { id: 1, name: "Unit A" },
  { id: 2, name: "Unit B" },
  { id: 7, name: "Villa" },
];

const ZONES = [
  {
    zone: "a1",
    kind: "unit",
    display_name: "Appartamento A1",
    device_count: 23,
    bound_device_count: 0,
    unit_id: null,
    suggested_unit_id: null,
  },
  {
    zone: "villa",
    kind: "unit",
    display_name: "Villa",
    device_count: 33,
    bound_device_count: 0,
    unit_id: null,
    suggested_unit_id: 7,
  },
  {
    zone: "pool",
    kind: "facility",
    display_name: "Piscina",
    device_count: 25,
    bound_device_count: 0,
    unit_id: null,
    suggested_unit_id: null,
  },
];

describe("ZoneMappingTable", () => {
  it("offers a unit selector only for unit-kind zones", () => {
    render(<ZoneMappingTable zones={ZONES} units={UNITS} value={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Unità per la zona a1")).toBeInTheDocument();
    expect(screen.getByLabelText("Unità per la zona villa")).toBeInTheDocument();
    // A shared plant is not a rentable unit and must not be bindable.
    expect(screen.queryByLabelText("Unità per la zona pool")).toBeNull();
  });

  it("lists shared plants separately so they are not mistaken for units", () => {
    render(<ZoneMappingTable zones={ZONES} units={UNITS} value={{}} onChange={vi.fn()} />);
    expect(screen.getByText(/Rilevate anche queste zone/i)).toBeInTheDocument();
    expect(screen.getByText(/Piscina · 25 dispositivi/)).toBeInTheDocument();
  });

  it("reports the zone device count so a wrong binding is visible", () => {
    render(<ZoneMappingTable zones={ZONES} units={UNITS} value={{}} onChange={vi.fn()} />);
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("33")).toBeInTheDocument();
  });

  it("emits the chosen unit for the zone", () => {
    const onChange = vi.fn();
    render(<ZoneMappingTable zones={ZONES} units={UNITS} value={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Unità per la zona a1"), { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledWith("a1", "1");
  });

  it("warns when two zones would land on the same unit", () => {
    render(
      <ZoneMappingTable
        zones={ZONES}
        units={UNITS}
        value={{ a1: "1", villa: "1" }}
        onChange={vi.fn()}
      />,
    );
    // Silently merging two apartments into one unit is the failure this guards.
    expect(screen.getAllByText(/già usata da un'altra zona/i)).toHaveLength(2);
  });

  it("explains what to do when nothing was discovered", () => {
    render(<ZoneMappingTable zones={[]} units={UNITS} value={{}} onChange={vi.fn()} />);
    expect(screen.getByText(/Nessuna zona rilevata/)).toBeInTheDocument();
  });
});
