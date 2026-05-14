# Desktop-Shell Component Set — Design

**Date:** 2026-05-14
**Status:** Approved

## Goal

Build a set of React components that give the existing web app an
Electron-like desktop UX: a custom window frame, title bar with an inline
menu bar, activity bar, collapsible sidebar, resizable content panes, and a
status bar. **No real Electron** — this stays a pure browser app. The
components are pure React and styled with Tailwind in a neutral desktop theme.

## Scope Decisions

| Question | Decision |
|----------|----------|
| Target | Electron-*like* UX in the existing web app; no Electron runtime. |
| Components | Window frame + title bar, menu bar + context menu, activity bar + sidebar, resizable split panes + status bar. |
| Styling | Tailwind utility classes, neutral light desktop theme. |
| Layout | Option B — "Modern compact": menu bar merged into the title bar (one row); activity bar + sidebar + content; status bar at the bottom; no bottom panel. |
| Architecture | Composable primitives + a small `ShellContext` coordination layer. |

## Architecture

A new self-contained module at `src/components/desktop/`, kept separate from
the existing `src/components/`:

```
src/components/desktop/
├── index.ts            # barrel export
├── types.ts            # shared types (ActivityItem, MenuNode, etc.)
├── ShellContext.tsx    # context + useShell() hook — the coordination layer
├── DesktopShell.tsx    # outer frame; CSS-grid layout; provides ShellContext
├── TitleBar.tsx        # app title + menu slot + window controls (one row)
├── WindowControls.tsx  # minimize / maximize / close (decorative, callback props)
├── MenuBar.tsx         # File/Edit/View… menus, rendered inside TitleBar
├── Menu.tsx            # Menu / MenuItem / MenuSeparator dropdown primitives
├── ContextMenu.tsx     # right-click menu, reuses Menu primitives, cursor-positioned
├── ActivityBar.tsx     # vertical icon strip; selects active view
├── Sidebar.tsx         # collapsible panel; renders the active view's content
├── SplitPane.tsx       # generic resizable two-pane splitter (reusable standalone)
└── StatusBar.tsx       # bottom bar with left/right item slots
```

`DesktopShell` realizes Layout B as a CSS grid: a title row on top, a body row
(`ActivityBar | Sidebar | SplitPane divider | content`), and a status row at
the bottom.

### Design principle

Each component has one clear purpose and a well-defined prop interface.
`SplitPane`, `Menu`, `ContextMenu`, and `WindowControls` are usable standalone
with no shell dependency. `DesktopShell` is the composition root that wires the
coordinated pieces together — the same Context-as-dependency-injection pattern
used elsewhere: components depend on the `ShellContext` interface, not on each
other.

## Components

| Component | Responsibility | Key interface |
|-----------|---------------|---------------|
| `DesktopShell` | Grid frame + context provider | `children`, `activityItems`, `onWindowAction?` |
| `TitleBar` | Title + menu slot + window controls | `title`, `children` (menu slot) |
| `WindowControls` | Three decorative window buttons | `onMinimize?`, `onMaximize?`, `onClose?` |
| `MenuBar` | Top-level menus with dropdowns | `menus: MenuNode[]` |
| `Menu` / `MenuItem` / `MenuSeparator` | Dropdown primitives — click + keyboard nav, click-outside, Escape | `items` / `label`, `onSelect`, `shortcut?` |
| `ContextMenu` | Cursor-positioned right-click menu | `items: MenuNode[]`; attaches via `useContextMenu()` hook |
| `ActivityBar` | Vertical icon strip; drives the active view | reads/writes `activeActivityId` from context |
| `Sidebar` | Collapsible panel; renders the active view | `views: Record<string, ReactNode>` |
| `SplitPane` | Draggable divider with min/max sizes (pointer events) | `min`, `max`, `defaultSize`, `onResize?` |
| `StatusBar` | Bottom bar with left/right slots | `left`, `right` (ReactNode) |

### Shared types (`types.ts`)

- `ActivityItem` — `{ id: string; label: string; icon: ReactNode }`
- `MenuNode` — a discriminated union of menu item, submenu, and separator,
  with `label`, optional `shortcut`, optional `onSelect`, optional `children`.

## ShellContext (coordination layer)

`DesktopShell` provides one small context, consumed via the `useShell()` hook:

```ts
interface ShellState {
  activeActivityId: string
  setActiveActivity: (id: string) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  sidebarWidth: number
  setSidebarWidth: (px: number) => void
}
```

`ActivityBar` and `Sidebar` coordinate through this context instead of
prop-drilling. State lives in `DesktopShell`. **No persistence** — the state
is in-memory only; a localStorage wrapper can be added later if needed (YAGNI).

`useShell()` throws a clear error if called outside a `DesktopShell`, matching
the project's existing context-hook convention.

## Interaction Details

- **MenuBar / Menu**: click a top-level label to open its dropdown; arrow keys
  move between items; `Enter` activates; `Escape` and outside-click close.
  Only one dropdown open at a time.
- **ContextMenu**: opens at the pointer coordinates on right-click of the
  attached target; closes on `Escape`, outside-click, or item selection;
  repositions to stay within the viewport.
- **SplitPane**: the divider is dragged with pointer events; the resulting
  size is clamped to `[min, max]`; `onResize` fires with the new size. Used for
  the sidebar/content boundary and reusable for any two-pane split.
- **Sidebar**: collapses/expands via `toggleSidebar()` from context; when
  collapsed it renders nothing and the grid column goes to zero width.
- **WindowControls**: purely visual; clicks invoke the optional callbacks
  (e.g. for future Electron wiring) but perform no real window action.

## Demo Page

A new `src/pages/Desktop.tsx` assembles the full shell with sample menus,
three activity items, and placeholder views for each. It is added as a
`/desktop` route in `src/App.tsx` and linked from the existing nav. This page
is the living example of how to compose the kit.

## Testing

Vitest + Testing Library, following the boilerplate's existing test setup.
Coverage:

- `SplitPane` — pointer drag resizes within `[min, max]` and clamps at bounds.
- `Sidebar` — collapses and expands when `toggleSidebar()` is called.
- `MenuBar` — opens a dropdown on click and closes on `Escape` and
  outside-click.
- `ContextMenu` — appears at the cursor coordinates on right-click.
- `ActivityBar` — selecting an item updates `activeActivityId` in context.

## Success Criteria

- All components live under `src/components/desktop/` and are exported from
  `index.ts`.
- The `/desktop` route renders the assembled Layout-B shell.
- `SplitPane`, `Menu`, `ContextMenu`, and `WindowControls` render correctly
  when used standalone, outside `DesktopShell`.
- `npm run build`, `npm run lint`, and `npm run test` all pass.
- The five test scenarios above pass.
