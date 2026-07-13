# `src/components/ui` — Component library

Shared, token-driven building blocks for the Essaouira Portal "Smart
Property OS" shell. Import everything from the barrel:

```js
import { Button, Card, Modal, PageHeader, StatCard, Tabs, ToastProvider, useToast } from "../components/ui";
```

All components read colors/spacing/radii/shadows from the CSS tokens in
`src/index.css` (see `apps/web/DESIGN_TOKENS.md`). Never hardcode a hex
color when building on top of these — use a token.

This is the target library for the page-migration wave: new pages (and
refactors of existing ones) should prefer these over ad-hoc inline styles
or the older single-purpose components below.

## New / upgraded in this pass

### `Button`

```jsx
<Button variant="primary" size="md" onClick={...}>Salva</Button>
<Button variant="danger" icon={<Trash2 size={14} />}>Elimina</Button>
<Button variant="secondary" loading>Caricamento…</Button>
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"primary" \| "secondary" \| "ghost" \| "danger" \| "subtle"` | `"primary"` | Visual style |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | |
| `icon` | node | `null` | Leading icon/element (hidden while `loading`) |
| `loading` | bool | `false` | Shows a spinner, disables the button, sets `aria-busy` |
| `disabled` | bool | `false` | |
| ...rest | | | Passed through to the native `<button>` (`onClick`, `type`, `aria-*`...) |

### `Card`

General-purpose surface with padding/elevation variants. `AppCard` (below)
still covers the common "hover-lift KPI/panel" case — reach for `Card`
when you need a flatter well, a compact row, or a custom element (`as`).

```jsx
<Card padding="lg" elevation="md">...</Card>
<Card as="section" padding="sm" elevation="flat">...</Card>
```

| Prop | Type | Default |
|---|---|---|
| `padding` | `"none" \| "sm" \| "md" \| "lg"` | `"md"` |
| `elevation` | `"flat" \| "sm" \| "md" \| "lg"` | `"sm"` |
| `as` | element/tag | `"div"` |

### `Modal` (the future single modal system)

Accessible dialog: `role="dialog"`, `aria-modal`, ESC to close, optional
focus trap (on by default), backdrop = `var(--color-overlay)`, sizes.

The existing top-level `src/components/Modal.jsx` and `MessageModal.jsx`
are **untouched** — pages still import those directly. This is additive;
a later wave migrates page-by-page to `ui/Modal`.

```jsx
<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="Conferma"
  description="Questa azione non può essere annullata."
  size="sm"
  footer={
    <>
      <Button variant="secondary" onClick={() => setOpen(false)}>Annulla</Button>
      <Button variant="danger" onClick={onConfirm}>Elimina</Button>
    </>
  }
>
  ...body...
</Modal>
```

| Prop | Type | Default |
|---|---|---|
| `open` | bool | — |
| `onClose` | fn | — |
| `title` / `description` | node | — (header omitted entirely if no `title`) |
| `footer` | node | `null` |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` |
| `closeOnBackdrop` | bool | `true` |
| `trapFocus` | bool | `true` |

### `ToastProvider` + `useToast`

Lightweight, dependency-free toast system. Stacks bottom-right,
auto-dismisses, each toast is `role="status"` (implicit `aria-live="polite"`).

`<ToastProvider>` already wraps the whole app in `src/App.jsx` (see "App.jsx
change" below) — most code only needs `useToast()`.

```jsx
import { useToast } from "../components/ui";

function SaveButton() {
  const toast = useToast();
  async function handleSave() {
    try {
      await save();
      toast.success("Salvato con successo");
    } catch (err) {
      toast.error(err.message || "Errore durante il salvataggio", { title: "Salvataggio fallito" });
    }
  }
  return <Button onClick={handleSave}>Salva</Button>;
}
```

API returned by `useToast()`: `notify(message, options)`, `dismiss(id)`,
`success(message, options)`, `error(message, options)`,
`warning(message, options)`, `info(message, options)`.

`options`: `{ title?, duration? (ms, default 4500; 0 = sticky), id? }`.

`useToast()` throws if called outside a `<ToastProvider>`.

### `Tabs`

Accessible tabs (`role="tablist"/"tab"/"tabpanel"`) with arrow-key
navigation (Left/Right, Up/Down, Home/End) and roving `tabindex`.

```jsx
<Tabs
  items={[
    { value: "overview", label: "Overview", icon: Eye, content: <OverviewPanel /> },
    { value: "devices", label: "Dispositivi", icon: Cpu, content: <DevicesPanel /> },
  ]}
  defaultValue="overview"
/>
```

| Prop | Type | Notes |
|---|---|---|
| `items` | `Array<{ value, label, content, icon?, disabled? }>` | required |
| `defaultValue` | string | uncontrolled initial tab |
| `value` / `onValueChange` | string / fn | controlled mode |

### `PageHeader`

Title + subtitle + right-actions slot + optional breadcrumb. Prefer this
over ad-hoc headers in new pages; `SectionHeader` (below) keeps working
for existing call sites.

```jsx
<PageHeader
  title="Manutenzioni"
  subtitle="Ticket apertura/chiusura per tutte le unità"
  breadcrumb={[{ label: "Facility", href: "/maintenance" }, { label: "Manutenzioni" }]}
  actions={<Button variant="primary">Nuovo ticket</Button>}
/>
```

### `StatCard` (upgraded, backward compatible)

Original API (`label`, `value`, `hint`, `icon`, `tone`) is unchanged. New,
optional props:

| Prop | Type | Notes |
|---|---|---|
| `trend` | number | Percent change, e.g. `12.5` or `-3.2` — renders a colored up/down arrow (success/danger tokens) |
| `trendLabel` | string | Small caption after the trend, e.g. `"vs settimana scorsa"` |
| `series` | number[] | Renders a tiny inline SVG sparkline (no chart library) next to the label |

```jsx
<StatCard label="Occupazione" value="78%" tone="info" trend={4.2} trendLabel="vs mese scorso" series={[61, 64, 60, 70, 74, 78]} />
```

## Existing components (unchanged API)

- `AppCard` — hover-lift surface card, fixed 16px padding. Use for KPI/panel grids.
- `SectionHeader` — `{ title, subtitle, right }`. Still supported; `PageHeader` is the richer alternative for new pages.
- `StatusBadge` — `{ status }`, maps `online/healthy/warning/critical/offline/*` to icon + tokenized colors.
- `SeverityBadge` — `{ severity: "info"|"warning"|"critical" }`.
- `HealthIndicator` — `{ connectivity, health, battery }`, composes `StatusBadge`.
- `FreshnessBadge` — `{ status: "fresh"|"stale"|other }`.
- `LastUpdatedIndicator` — `{ value, label }`, self-updating "Xm fa" caption.
- `LiveStatusDot` — `{ active, title }`, small pulse dot.
- `EmptyState` — `{ title, description }`.
- `LoadingSkeleton` — `{ rows, height }`, shimmering placeholder rows.
- `ActionToolbar` — `{ children, style }`, the `.ui-toolbar` wrapper.

## Design tokens used by this library

New tokens added in this pass (see `src/index.css`, both `:root` and
`[data-theme="dark"]`):

- `--color-accent` / `--color-accent-strong` / `--color-accent-soft` / `--color-on-accent` —
  warm sand/terracotta secondary accent (coastal Moroccan hospitality). Use
  **sparingly**: highlights, active brand marks, at most one KPI per view.
  Never let it compete with the teal `--color-primary`.
- `--color-on-danger` — text color for solid danger buttons/surfaces (mirrors
  the `--color-on-primary` pattern: white in light theme, dark ink in dark
  theme, since `--color-danger` flips from dark-on-light to light-on-dark).
- `--transition-fast` (150ms) — the standard color/border/background transition
  duration for theme switching.
- `.tabular-nums` utility class — apply `font-variant-numeric: tabular-nums`
  to any custom numeric/counter display (tables, `.ui-kpi-value`, and `table`
  already get this by default).
- `.table-sticky` / `.table-zebra` — opt-in table utility classes (add the
  className to any `<table>`; no markup rewrite needed): sticky header row,
  zebra striping with primary-tinted row hover.

`--font-sans` now resolves to `"Manrope Variable"` (loaded via
`@fontsource-variable/manrope`, imported once in `src/main.jsx`), falling
back through the previous stack.

## New global CSS utility classes (in `src/index.css` / `ui.css`)

| Class | Purpose |
|---|---|
| `.tabular-nums` | Force tabular figures on a numeric string |
| `.table-sticky` | Sticky `<thead>` on a scrolling table |
| `.table-zebra` | Zebra rows + primary-tinted hover |

## `App.jsx` change

`src/App.jsx` now wraps the route tree in `<ToastProvider>` — a single
import + one wrapping element, nothing else changed:

```jsx
import { ToastProvider } from "./components/ui";
...
function App() {
  return (
    <ToastProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes>...</Routes>
      </Suspense>
    </ToastProvider>
  );
}
```

## Notes for the page-migration wave

- `ui/Modal` is the target modal system. Do not delete
  `src/components/Modal.jsx` / `src/components/MessageModal.jsx` until all
  call sites have moved over.
- `PageHeader` is the target page-header component; `SectionHeader` remains
  supported for now.
- `Button` is the target button primitive; the bare global `<button>`
  styling in `src/index.css` remains the fallback for pages not yet migrated.
