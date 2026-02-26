# Go-Live Mobile QA Checklist

## Target Device Matrix

- iPhone SE (375x667)
- iPhone 14 / 15 (390x844)
- iPhone 14/15 Pro Max (430x932)
- Pixel 7 / 8 (412x915)
- Samsung Galaxy S20+ (384x854)

## Core Navigation

- Login page fully visible, no clipped fields/buttons.
- Topbar does not overflow on small widths.
- Mobile drawer opens/closes correctly.
- Bottom navigation always visible and tappable.
- No horizontal page scroll on main pages.

## Page-by-Page Functional Checks

- Dashboard:
  - KPI cards render correctly.
  - Charts render (no width/height warnings).
- Calendario:
  - Month grid visible.
  - Booking cards readable/tappable.
  - Drag-drop on desktop remains functional.
- Prenotazioni:
  - Filters wrap properly.
  - Edit/create modal fields fully usable on mobile.
- Arrivi & Partenze:
  - Action buttons fit in card/table rows.
  - Message/document actions open correctly.
- Staff Planner:
  - Columns/cards stack correctly.
  - Task edit modal fully usable.
- Task Staff & Pulizie:
  - Board area scrolls without layout break.
  - Quick-create form remains usable on small screens.
- Ops Automation:
  - Templates/jobs/checklist panels usable without clipping.
  - Template modal readable with all fields visible.
- Anagrafica Staff:
  - New member form fully usable.
  - Table remains readable with horizontal scroll where needed.
- Manutenzioni:
  - Kanban columns stack on mobile.
  - Ticket modal usable without clipping.
- Business / Spese / Tariffe:
  - KPI + forms + tables remain readable and operable.
- Admin Control:
  - Audit table readable with horizontal scroll.
  - Tenant modal usable on mobile.

## Session/Auth Checks

- Expired token forces redirect to `/login?reason=session_expired`.
- After re-login, all write actions succeed (no repeated 401 loops).
- Logout clears session and returns to login.

## PWA Checks

- Android Chrome: install prompt works.
- iOS Safari: Add to Home Screen works.
- Opening from home screen loads app shell and routes correctly.

## Performance & Stability

- Initial load on 4G acceptable (<5s target on warm backend).
- No critical errors in browser console.
- `npm run build` and backend `pytest -q` pass before release.

