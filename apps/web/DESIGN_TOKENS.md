# Essaouira Portal — Design Tokens

Single source of truth: `src/index.css`. Light theme is defined on `:root`,
dark theme on `[data-theme="dark"]`. The theme attribute is applied to `<html>`
before first paint by an inline script in `index.html`, persisted in
`localStorage` under `essaouira_portal_theme`, toggled from the Topbar
(`src/hooks/useTheme.js`).

**Rule for all new/updated code: never hardcode a hex color. Use a token.**
Tokens are plain CSS custom properties — use them in CSS (`color: var(--color-text)`)
and in inline JSX styles (`style={{ color: "var(--color-text)" }}`).

## Token vocabulary

### Surfaces & borders

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--color-bg` | `#f4f7fb` | `#0b1220` | Page/app background |
| `--color-surface` | `#ffffff` | `#101a2c` | Cards, panels, modals, inputs |
| `--color-surface-raised` | `#ffffff` | `#16223a` | Popovers, hovering layers above a surface |
| `--color-surface-soft` | `#f8fafc` | `#0d1626` | Subtle wells, table headers, toolbars, hover rows |
| `--color-border` | `#e2e8f0` | `#24334d` | Default borders, dividers |
| `--color-border-strong` | `#cbd5e1` | `#35486b` | Input borders, emphasized dividers |

### Text

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--color-text` | `#0f172a` | `#e6edf7` | Primary text, headings |
| `--color-text-muted` | `#64748b` | `#9fb0c7` | Secondary text, labels, captions |
| `--color-text-subtle` | `#94a3b8` | `#64748b` | Placeholders, disabled hints, faint icons |
| `--color-text-on-light` | `#334155` | `#334155` | Ink on surfaces that stay white in BOTH themes (e.g. printable A4 documents). Rare. |

### Brand

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--color-primary` | `#0f766e` | `#14b8a6` | Primary buttons, links, active nav, focus |
| `--color-primary-strong` | `#0b5c57` | `#2dd4bf` | Hover/active state of primary elements |
| `--color-primary-soft` | `#ccfbf1` | `#10332f` | Tinted backgrounds: selected items, active section chips |
| `--color-on-primary` | `#ffffff` | `#04231f` | Text/icons on top of `--color-primary` |
| `--color-accent` | `#c2683f` | `#e08a5a` | Warm sand/terracotta secondary accent — coastal Moroccan hospitality. Use **sparingly**: highlights, active brand marks (e.g. the sidebar brand-mark dot), at most one KPI per view. Never let it compete with `--color-primary`. |
| `--color-accent-strong` | `#9a4e2f` | `#f0a878` | Hover/active state of accent elements |
| `--color-accent-soft` | `#f7e2d3` | `#3a2415` | Tinted backgrounds for accent highlights |
| `--color-on-accent` | `#ffffff` | `#241207` | Text/icons on top of `--color-accent` |

### Status

Each status has three levels: the base color (icons, borders, solid accents),
`-strong` (text sitting on the `-soft` background), `-soft` (tinted badge/banner background).

| Token | Light | Dark |
|---|---|---|
| `--color-success` / `-strong` / `-soft` | `#16a34a` / `#166534` / `#dcfce7` | `#4ade80` / `#86efac` / `#10301d` |
| `--color-warning` / `-strong` / `-soft` | `#d97706` / `#92400e` / `#fef3c7` | `#fbbf24` / `#fcd34d` / `#362a0b` |
| `--color-danger` / `-strong` / `-soft` | `#dc2626` / `#991b1b` / `#fee2e2` | `#f87171` / `#fca5a5` / `#3b1519` |
| `--color-info` / `-strong` / `-soft` | `#2563eb` / `#1e40af` / `#dbeafe` | `#60a5fa` / `#93c5fd` / `#132743` |

Badge recipe: `background: var(--color-success-soft); color: var(--color-success-strong); border: 1px solid var(--color-success);`

### Effects, radii, shadows, type, spacing

| Token | Value (light) | Notes |
|---|---|---|
| `--color-overlay` | `rgba(2,6,23,.42)` | Modal/drawer backdrops |
| `--color-focus-ring` | `rgba(15,118,110,.28)` | `box-shadow: 0 0 0 3px var(--color-focus-ring)` |
| `--color-shimmer` | `rgba(255,255,255,.6)` | Skeleton shimmer highlight |
| `--radius-sm` / `-md` / `-lg` / `-full` | `8px` / `12px` / `16px` / `999px` | Buttons+inputs / toolbars / cards / pills |
| `--shadow-sm` / `-md` / `-lg` | see index.css | Cards / hover+popovers / modals |
| `--font-sans` | Manrope stack | Body font |
| `--space-1..8` | `4 8 12 16 20 24 32 48` px | Spacing scale |

Legacy aliases (`--ui-bg`, `--ui-surface`, `--ui-surface-soft`, `--ui-border`,
`--ui-foreground`, `--ui-muted-foreground`, `--ui-primary`, `--ui-primary-strong`,
`--ui-shadow-sm`, `--ui-shadow-md`) still resolve to the new tokens. Do not use
them in new code; migrate to `--color-*` when touching a file.

## Hex → token mapping (for the page sweep)

Counts from a grep of `src/pages` + `src/components` (July 2026). Replace the
hex with the token unless the "keep" note applies.

### Neutrals / text

| Hex | Count | Token |
|---|---|---|
| `#6b7280`, `#64748b` | 142+45 | `var(--color-text-muted)` |
| `#9ca3af`, `#94a3b8` | 23+2 | `var(--color-text-subtle)` |
| `#374151`, `#334155`, `#4b5563`, `#475569` | 33+7+17+6 | `var(--color-text)` if primary content, `var(--color-text-muted)` if secondary. In printable documents (BookingDocument): `var(--color-text-on-light)` |
| `#111827`, `#0f172a`, `#000` | 28+3+6 | `var(--color-text)` (in BookingDocument keep `#000`/dark ink — printed page is always white) |
| `#ccc`, `#999` | 11+4 | `var(--color-border-strong)` |

### Surfaces / borders

| Hex | Count | Token |
|---|---|---|
| `#fff`, `#ffffff`, `white`, `#fdfdfd` | 16+12+1 | `var(--color-surface)` (keep literal white in BookingDocument print area) |
| `#f9fafb`, `#f8fafc`, `#f3f4f6` | 15+5+33 | `var(--color-surface-soft)` |
| `#e5e7eb`, `#e2e8f0`, `#eef2f7`, `#edf2f7` | 68+9+3 | `var(--color-border)` |
| `#d1d5db`, `#cbd5e1`, `#cbd5f5` | 45+5+2 | `var(--color-border-strong)` |
| `#525252` | 1 | screen backdrop of BookingDocument — keep or `var(--color-bg)` |

### Teal / brand

| Hex | Count | Token |
|---|---|---|
| `#0f766e` | 42 | `var(--color-primary)` |
| `#0b5c57`, `#115e59` | — | `var(--color-primary-strong)` |
| `#ccfbf1`, `#e6fffa`, `#f0fdfa` | — | `var(--color-primary-soft)` |

### Status — green (success)

| Hex | Count | Token |
|---|---|---|
| `#16a34a`, `#22c55e`, `#10b981`, `#059669`, `#047857`, `#15803d` | 13+2+4+2+5+1 | `var(--color-success)` |
| `#166534`, `#065f46`, `#064e3b`, `#14532d` | 14+6+1 | `var(--color-success-strong)` |
| `#dcfce7`, `#ecfdf5`, `#d1fae5`, `#f0fdf4`, `#bbf7d0` | 11+14+2+1+3 | `var(--color-success-soft)` |
| `#86efac`, `#a7f3d0`, `#6ee7b7`, `#4ade80`, `#34d399` | 4+3+1+1+1 | `var(--color-success)` when used as border on a soft bg |
| `#25d366` | 1 | WhatsApp brand green — keep as-is |

### Status — amber/orange (warning)

| Hex | Count | Token |
|---|---|---|
| `#f59e0b`, `#d97706`, `#f97316`, `#fb923c`, `#facc15`, `#fbbf24` | 4+1+4+1+1+2 | `var(--color-warning)` |
| `#92400e`, `#b45309`, `#a16207`, `#9a3412`, `#7c2d12` | 6+1+1+1+1 | `var(--color-warning-strong)` |
| `#fffbeb`, `#fef3c7`, `#fef9c3`, `#fed7aa` | 7+2+3+1 | `var(--color-warning-soft)` |
| `#fcd34d`, `#fde68a` | 3+2 | `var(--color-warning)` as border on soft bg |

### Status — red (danger)

| Hex | Count | Token |
|---|---|---|
| `#b91c1c`, `#dc2626`, `#ef4444` | 35+13+4 | `var(--color-danger)` (error text: `var(--color-danger)`; text on `-soft` bg: `var(--color-danger-strong)`) |
| `#991b1b`, `#7f1d1d` | 4+1 | `var(--color-danger-strong)` |
| `#fef2f2`, `#fee2e2` | 8+8 | `var(--color-danger-soft)` |
| `#fecaca`, `#fca5a5`, `#f87171` | 10+3+1 | `var(--color-danger)` as border on soft bg |

### Status — blue / indigo (info)

| Hex | Count | Token |
|---|---|---|
| `#2563eb`, `#1d4ed8`, `#0ea5e9`, `#0369a1`, `#60a5fa` | 4+9+3+2+1 | `var(--color-info)` |
| `#1e40af`, `#4338ca`, `#3730a3` | 2+2+2 | `var(--color-info-strong)` |
| `#eff6ff`, `#dbeafe`, `#e0f2fe`, `#ecfeff`, `#e0edff`, `#eef2ff`, `#e0e7ff` | 5+3+3+3+1+1+1 | `var(--color-info-soft)` |
| `#bfdbfe`, `#93c5fd`, `#a5f3fc`, `#c7d2fe` | 7+1+2+2 | `var(--color-info)` as border on soft bg |
| `#6366f1`, `#7c3aed`, `#8b5cf6`, `#a855f7` | 2+1+2+1 | Chart/accent purple — keep in charts (see below); elsewhere `var(--color-info)` |

### Charts (recharts)

Chart series colors (`#0088fe`, `#00c49f`, `#ffbb28`, `#ff8042`, `#8b5cf6`,
`#22c55e`, etc.) **may keep a fixed palette** — data-viz colors need to stay
distinguishable and are acceptable in both themes. Prefer passing the same
palette everywhere. Grid lines / axis text inside charts should use
`var(--color-border)` and `var(--color-text-muted)` where recharts accepts CSS
values (`stroke="var(--color-border)"` works).

### Hover / interaction guidance

- Primary button hover: `var(--color-primary-strong)` (already the global default in `index.css` — inline hover hacks can simply be deleted).
- Neutral/outline button: bg `var(--color-surface)`, border `var(--color-border-strong)`, text `var(--color-text-muted)`; hover → bg `var(--color-surface-soft)`, text `var(--color-text)`. Ready-made class: `chrome-icon-btn` (`src/components/chrome.css`).
- Row/list hover: `var(--color-surface-soft)`.
- Selected item: `var(--color-primary-soft)` background.
- Focus: never remove outlines; global `:focus-visible` handles it. For custom controls use `box-shadow: 0 0 0 3px var(--color-focus-ring)`.

### Special cases

- **BookingDocument.jsx** renders a printable A4 sheet that must stay white in
  both themes: keep white backgrounds and use fixed dark ink
  (`var(--color-text-on-light)` or literal dark values) inside `.a4-page` only.
  The surrounding screen chrome (toolbar, buttons) should use normal tokens.
- `rgba(...)` shadows → use `var(--shadow-sm|md|lg)`.
- Overlay `rgba(15,23,42,0.4x)` → `var(--color-overlay)`.
