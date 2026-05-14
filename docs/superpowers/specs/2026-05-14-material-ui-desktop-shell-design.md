# Material UI Desktop Shell — Design

**Date:** 2026-05-14
**Status:** Approved

## Goal

Rebuild the desktop-shell component kit on Material UI primitives. The kit
currently consists of custom components styled with Tailwind v4; this replaces
them with idiomatic MUI components where MUI has an equivalent, keeps custom
components only where it does not, and themes everything with a dense,
desktop-tuned MUI theme.

## Scope Decisions

| Question        | Decision                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Adoption level  | Full rebuild on MUI components — `AppBar`, `Drawer`, `Menu`, etc.                                        |
| Tailwind        | Keep both — MUI is the default for these components; Tailwind utilities remain available ad hoc.         |
| Theme           | Custom dense, desktop-tuned theme (tighter spacing and controls than MUI's touch-friendly defaults).     |
| Sidebar         | Approach C — MUI `Drawer` (persistent) with a custom resize handle bolted on, preserving drag-to-resize. |

## Dependencies

Add: `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`.

## Theme

A new `src/components/desktop/theme.ts` exports a dense theme built with
`createTheme`:

- `MuiToolbar` default `variant: 'dense'`.
- Tighter `MuiMenuItem`, `MuiButton`, and `MuiIconButton` padding / smaller
  default sizes.
- A 4px spacing base.
- A neutral light palette.

`App.tsx` wraps `<Desktop />` in
`<ThemeProvider theme={theme}><CssBaseline />…</ThemeProvider>`.

## Component Mapping & File Layout

```
src/components/desktop/
├── index.ts            # barrel export
├── types.ts            # unchanged — ActivityItem.icon stays ReactNode (now a MUI icon)
├── theme.ts            # NEW — dense createTheme()
├── ShellContext.tsx    # unchanged — context + useShell() hook
├── DesktopShell.tsx    # layout root (Box flex); provides ShellContext
├── TitleBar.tsx        # AppBar + dense Toolbar; holds the menu slot
├── MenuBar.tsx         # row of Buttons, each opening a MUI Menu
├── ContextMenu.tsx     # MUI Menu with anchorReference="anchorPosition"
├── useContextMenu.ts   # unchanged — tracks anchor coordinates
├── ActivityBar.tsx     # Box + IconButton + Tooltip
├── Sidebar.tsx         # MUI Drawer (persistent) + embedded ResizeHandle
├── ResizeHandle.tsx    # NEW — custom 1-D pointer-drag handle
└── StatusBar.tsx       # themed Paper
```

| Current component       | Becomes                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `TitleBar`              | `AppBar` + dense `Toolbar`                                           |
| `Menu` (custom dropdown) | **Deleted** — MUI `Menu` / `MenuItem` / `Divider` (keyboard nav, Escape, click-outside, submenu flyouts are built in) |
| `MenuBar`               | Thin composition: a row of `Button`s, each opening a MUI `Menu` (MUI has no menu-bar primitive) |
| `ContextMenu`           | MUI `Menu` with `anchorReference="anchorPosition"`; `useContextMenu` hook unchanged |
| `ActivityBar`           | `Box` + `IconButton` + `Tooltip` (no MUI equivalent)                 |
| `Sidebar`               | MUI `Drawer` (`variant="persistent"`) + embedded `ResizeHandle`      |
| `SplitPane`             | **Deleted** — replaced by `ResizeHandle` driving the Drawer width    |
| `StatusBar`             | themed `Paper` (no MUI equivalent)                                   |
| icons (emoji in demo)   | `@mui/icons-material` icons                                          |

## Drawer + ResizeHandle Mechanics

`Sidebar` renders MUI `Drawer` with `variant="persistent"` and
`open={!sidebarCollapsed}`. A persistent Drawer's paper is `position: fixed` by
default and overlays content; override the paper to `position: relative` via
`sx` so the Drawer participates in the flex row beside the `ActivityBar` and
the main content. The paper width is driven by `sidebarWidth` from
`ShellContext`; collapsing animates the width to zero via the Drawer's
transition.

`ResizeHandle` is a thin (4px) draggable bar rendered at the Drawer's right
edge. Its drag logic mirrors the old `SplitPane`: `pointerdown` on the handle,
`pointermove` / `pointerup` listeners on `window`, the resulting width clamped
to `[min, max]` and pushed through `setSidebarWidth`. It is a separate
component so the drag logic stays isolated and independently testable.

## DesktopShell Layout

`DesktopShell` is a `Box` flex column: `TitleBar` on top, a flex-row body
(`ActivityBar` | `Sidebar` Drawer | main content), and `StatusBar` at the
bottom. It holds the shell state and provides `ShellContext`, exactly as
before — only the rendered primitives change.

## Tailwind Coexistence

Both styling systems stay loaded: `@import 'tailwindcss'` in `src/index.css`
and MUI's runtime (Emotion) styles. MUI `CssBaseline` and Tailwind preflight
both reset base styles; they largely agree, and MUI components are
self-contained, so any conflict is cosmetic at worst. MUI is the default for
the desktop-shell components; Tailwind utilities remain available for ad hoc
use.

## Testing

`src/test/desktop.test.tsx` adapts to the new primitives:

- `ResizeHandle` — pointer drag updates the width within `[min, max]`.
- `Sidebar` — collapse/expand toggles the Drawer's `open` state.
- `MenuBar` — clicking a button opens a MUI `Menu`; queried with `findByRole`
  since MUI portals and animates the menu.
- `ContextMenu` — right-click opens a MUI `Menu` at the anchor coordinates.
- `ActivityBar` — selecting an item updates `activeActivityId` in context.

Tests render components inside a test-only theme that disables transitions, so
menus settle synchronously. The `PointerEvent` polyfill in `src/test/setup.ts`
stays — `ResizeHandle` needs it.

## Success Criteria

- The desktop-shell components are rebuilt on MUI primitives per the mapping
  above; `Menu.tsx` and `SplitPane.tsx` are removed.
- The dense theme is applied via `ThemeProvider` in `App.tsx`.
- The sidebar is a persistent `Drawer` that still drag-resizes via
  `ResizeHandle`.
- `npm run build`, `npm run lint`, and `npm run test` all pass.
- The five test scenarios above pass.
