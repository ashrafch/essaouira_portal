# End User Portal Manual

## Goal

This manual is for the person using the portal day to day.

It explains what each area is for and how to navigate the product without needing technical knowledge.

## 1. Main areas of the portal

### PMS / operations
- Dashboard
  - overall operational summary
- Calendar
  - booking calendar
- Bookings
  - reservation list and guest activity
- Arrivals & Departures
  - day-by-day operational flow
- Staff Planner
  - staff workload and tasks
- Maintenance
  - technical and facility tickets
- Business
  - costs, revenue, finance views

### Smart Building
- Smart Dashboard
  - global smart overview and health
- Smart Operations
  - units and issues that need attention
- Smart Overview
  - portfolio-level smart summary
- Devices
  - smart device inventory
- Smart Alerts
  - all active or resolved smart alerts
- Smart Automation
  - scenes, rules, and executions
- Check-in Assistant
  - booking-oriented arrival readiness
- Checkout Assistant
  - booking-oriented departure validation

## 2. Typical daily workflow

### Morning
1. open Dashboard
2. check Arrivals & Departures
3. open Staff Planner
4. check Maintenance
5. open Smart Operations for urgent smart issues

### Before guest arrival
1. open Check-in Assistant
2. review readiness score and blocking reasons
3. verify essential devices
4. review open alerts
5. open related staff tasks if needed
6. if available, trigger welcome scene

### After guest departure
1. open Checkout Assistant
2. review lingering issues
3. verify no relevant device remains active
4. open housekeeping or maintenance if needed
5. if available, trigger eco / checkout scene

## 3. Meaning of common smart statuses

### Device connectivity
- `online`
  - device seen recently and reachable
- `stale`
  - device data is not fresh
- `offline`
  - device is considered unreachable or too old

### Health
- `healthy`
  - no attention needed
- `warning`
  - attention needed but not blocking
- `critical`
  - issue should be handled quickly

### Readiness
- `READY`
  - unit is acceptable for intended transition
- `NEEDS_ATTENTION`
  - unit can continue only after operator check
- `BLOCKED`
  - blocking issue exists
- `UNKNOWN`
  - not enough data available

## 4. Quick rules for operators

- use Smart Operations when you want to know what needs action now
- use Smart Dashboard when you want a broad product view
- use Smart Unit Detail when a single unit needs investigation
- use Check-in Assistant only for arrival validation
- use Checkout Assistant only for departure/eco transition validation

## 5. Good practice

- do not ignore leak or critical alerts
- if a unit is `BLOCKED`, open unit detail and maintenance immediately
- if a device remains offline repeatedly, escalate to technical review
- if automation fails, verify whether the scene/rule still applies to that unit

## 6. Important limitation

The smart layer supports real integrations and simulation, but it does not replace:
- booking management rules
- staff workflow ownership
- maintenance ownership

Those remain in PMS/Ops parts of the portal.
