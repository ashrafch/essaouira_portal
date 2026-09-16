import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "./appRoutes";
import { getNavigationItems, isNavigationActive } from "./navigation";
import { readWorkflowContext } from "./workflowContext";
import { canAccessPath } from "../config/rbac";
import { loadSections } from "../services/loadSections";
import { canUseSmartQuickAction } from "../components/smart/actionPermissions";

describe("navigation and workflow context", () => {
  it.each(["owner", "manager", "operator", "viewer"])("keeps %s navigation aligned with route guards", (role) => {
    const items = getNavigationItems(role);
    expect(items.map(item => item.routeKey)).toEqual(APP_ROUTES.filter(route =>
      !route.standalone && !route.path.includes(":") && route.allowedRoles.includes(role)
    ).map(route => route.key));
    for (const item of items) {
      expect(item.label).toBeTruthy();
      expect(canAccessPath(item.path, role)).toBe(true);
    }
  });
  it.each(["//example.org", "https://example.org", "/unknown", "/\\example.org", undefined])("rejects unsafe or unknown paths: %s", (path) => {
    expect(canAccessPath(path, "owner")).toBe(false);
  });
  it("accepts authorized context links without widening route access", () => {
    expect(canAccessPath("/staff?unit_id=4", "operator")).toBe(true);
    expect(canAccessPath("/staff?unit_id=4", "viewer")).toBe(false);
    expect(canAccessPath("/units/4/timeline", "viewer")).toBe(true);
    expect(isNavigationActive("/bookings/4/document", "/bookings")).toBe(true);
    expect(isNavigationActive("/bookings", "/")).toBe(false);
  });
  it("reads shareable links and gives explicit navigation state precedence", () => {
    expect(readWorkflowContext({ search: "?unit_id=4&booking_id=8&date=2028-02-29&task_type=checkin", state: { unitId: 5 } }))
      .toEqual({ unitId: "5", bookingId: "8", date: "2028-02-29", taskType: "checkin" });
  });
  it("discards impossible dates and invalid identifiers", () => {
    expect(readWorkflowContext({ search: "?unit_id=-2&booking_id=NaN&date=2027-02-29" }))
      .toEqual({ unitId: "", bookingId: "", date: "", taskType: "" });
  });
});

describe("independent sections and safe actions", () => {
  it("preserves successful results when both synchronous and async reads fail", async () => {
    expect(await loadSections({
      bookings: () => [1], units: async () => [2],
      alerts: () => { throw new Error("offline"); },
      health: async () => { throw new Error("unavailable"); },
    })).toEqual({ data: { bookings: [1], units: [2], alerts: null, health: null }, failed: ["alerts", "health"] });
  });
  it("does not let viewers execute actions and requires an explicit target", () => {
    const scene = { enabled: true, action_type: "run_scene", scene_id: 7 };
    expect(canUseSmartQuickAction(scene, "viewer")).toBe(false);
    expect(canUseSmartQuickAction(scene, "manager")).toBe(true);
    expect(canUseSmartQuickAction({ ...scene, scene_id: null }, "owner")).toBe(false);
    expect(canUseSmartQuickAction({ enabled: true, action_type: "acknowledge_alert", alert_id: 1 }, "viewer")).toBe(false);
    expect(canUseSmartQuickAction({ enabled: true, route: "/smart-link" }, "operator")).toBe(false);
    expect(canUseSmartQuickAction({ enabled: false, route: "/" }, "owner")).toBe(false);
  });
});
