# Right Panel Dock Region Design

**Goal:** Replace the shell's right-side inspector-stack region with a general
**tabbed panel dock** — a right-docked `TabControl` region that hosts multiple
contributions as tabs (agent chat, inspectors, and future panels), attached to
the right edge of the workspace.

**Status:** ✅ Finished (Design approved 2026-07-27)

## Background

Mural's `EditorShell` is fully services-driven: its `@DefaultEditorShell`
template lays out region hosts, each bound to a service via `$service(Token)`,
and an empty region collapses. The current right region is the **Inspector
region** — `InspectorService` hosts an `ObservableCollection<IInspector>`
(each `{ Id, Title, IsExpanded }`), rendered by `DataTemplate[InspectorService]`
as an `InspectorStack` of collapsible `InspectorPanel`s
([shell.template.mu](../../../src/framework/shell/shell.template.mu),
[inspector-service.ts](../../../src/framework/shell/services/inspector-service.ts)).

Plexus's agent chat currently lives elsewhere — as a **left activity-rail
capability** (`AgentChatModule` contributes a `Capability`; the left side-pane
renders `AgentService`).

We want one right-side **tabbed dock** that hosts both: agent chat as a
persistent tab and inspectors as on-demand tabs (the CHAT / … tab-strip shape).
The inspector region is already 90% a dock — a titled, Add/Close/dedupe
collection host — so the clean move is to generalize it into a tab-presented
dock and route both agent chat and inspectors through it.

## Decisions (locked during brainstorming)

- **Replace, not coexist.** The tabbed dock becomes THE single right region.
  The old inspector-stack region is retired; inspectors become dock tabs.
- **Agent chat leaves the left rail.** It lives only as a dock tab. The left
  rail keeps the other capabilities (Diagram, Project Explorer, Meta-models,
  Libraries, Problems).
- **Generalize (approach A).** Introduce a general `PanelDockService` +
  `IDockPanel`; the existing `Inspector` base already satisfies `IDockPanel`,
  and `AgentService` implements it. Keep the inspector *content*
  (`Inspector` / `DiagramInspector` + their DataTemplates); retire only the
  *host* + *stack presentation*.
- **Pop-out deferred.** v1 chrome = tabs + per-tab close + dock collapse (empty)
  + resize splitter. The screenshot's pop-out `[ ]` maps onto the existing
  multi-window tear-off backlog and is out of scope here.

## Component 1 — `IDockPanel` + `PanelDockService` (Mural)

**New item contract** (`src/framework/shell/services/dock-panel.ts` — mirrors
how `IInspector` lives in its own `inspector.ts`):

```ts
export interface IDockPanel
{
    readonly Id: string;    // stable identity; the host dedupes by it
    readonly Title: string; // tab header text
}
```

The existing `Inspector` base ([inspector.ts](../../../src/framework/shell/services/inspector.ts))
already exposes `Id` + `Title` DPs, so every inspector is an `IDockPanel` with
no change.

**New host** `PanelDockService extends ServiceBase`
(`src/framework/shell/services/panel-dock-service.ts`) — modeled on
`InspectorService`:

- `Key = new ServiceKey<PanelDockService>('PanelDockService')`.
- `Panels: ObservableCollection<IDockPanel>` (stable per-instance collection;
  the DP only hands it back).
- `SelectedPanel: IDockPanel` DP — TwoWay-bound to `TabControl.SelectedItem`
  (the active tab). `MetaData.BindsTwoWayByDefault`.
- `HasPanels: boolean` read-only DP — mirrors `Panels.Count > 0` on every
  collection mutation; the region binds its `Visibility` to it.
- `AddPanelCommand` / `ClosePanelCommand` (RelayCommands) — mirror
  `Add/CloseInspectorCommand`; `ClosePanelCommand` takes an `Id`.
- Methods:
  - `Add(panel: IDockPanel): IDockPanel` — dedupe by `Id`; if present, re-select
    the existing one; else append. **Always set `SelectedPanel` to the
    added-or-existing panel** so opening Format Shape surfaces its tab.
  - `Remove(panel)`, `CloseById(id)`, `Clear()`.
  - When the selected panel is removed, select an adjacent remaining panel (or
    clear selection when none remain).

**Retire** `InspectorService`, `InspectorStack`, `InspectorPanel` (host + stack
presentation). **Keep** `Inspector` / `IInspector` + `DiagramInspector`
(content — they render as dock panels).

## Component 2 — Shell region + template (Mural)

**`EditorShell` ctor** ([editor-shell.ts](../../../src/framework/shell/editor-shell.ts)):
replace the `InspectorService` default registration with `PanelDockService`
(same "register scoped only if nothing up-chain supplies one" opt-out guard).

**`shell.template.mu`**:

- New `DataTemplate[PanelDockService]`:
  ```
  TabControl [ ItemsSource = $Panels, SelectedItem = $SelectedPanel, ItemTemplate = @DockTabHeader ]
  ```
  The `TabControl` body renders the selected panel via its own type DataTemplate
  (same dispatch `DocumentsContentHostService`'s TabControl uses for documents).
- `@DockTabHeader` (keyed, DataType nominal like `@DocumentTabHeaderTemplate`):
  `$Title` + a compact close `IconButton` (`ClosePanelCommand`, param `$Id`),
  reusing `@CompactHeaderIconButton` + `@IconClose`.
- Replace the `PART_InspectorHost` region block with:
  ```
  ContentPresenter x:name="PART_RightDockHost"
      [ DockPanel.Dock = Right,
        Width          = 320,
        Visibility     = $service(PanelDockService).HasPanels << ToVisibility,
        Content        = $service(PanelDockService) ]
  Splitter
      [ DockPanel.Dock = Right, Width = 6, Orientation = Vertical, ReverseDirection = true,
        Visibility     = $service(PanelDockService).HasPanels << ToVisibility ]
  ```
- Remove the `InspectorStack`/`InspectorPanel` templates + styles and the
  `DataTemplate[InspectorService]`.

**`framework/index.ts`**: export `PanelDockService` + `IDockPanel`; drop the
retired `InspectorService` / `InspectorStack` / `InspectorPanel` exports.

**`framework/diagram/diagram.template.mu`**: any Format-Shape wiring that binds
`$service(InspectorService).AddInspectorCommand` → `PanelDockService.AddPanelCommand`.

## Component 3 — Plexus migration

- **Agent chat → dock tab, off the left rail:**
  - `modules/agent-chat/agent-chat.module.mu`: drop the `Capability` line; keep
    `.services: { AgentService }`.
  - `AgentService` gains constant `Id` (`"agent"`) + `Title` (`"Chat"`) DPs so it
    satisfies `IDockPanel` and the tab-header `$Title` binding resolves.
  - `main.js` bootstrap: resolve `PanelDockService` + `AgentService`, call
    `dock.Add(agentService)` at startup — Chat is the always-present,
    default-selected tab. Its existing `DataTemplate[AgentService]` renders the
    body unchanged.
- **Inspector → dock:**
  - `modules/diagram/diagram.resources.mu`: Format-Shape + Layout menu items
    rebind `$service(InspectorService).AddInspectorCommand` →
    `$service(PanelDockService).AddPanelCommand`.
  - `main.js:79` + `modules/diagram/behaviors/auto-open-inspector-behavior.ts`:
    swap `InspectorService` → `PanelDockService` (type + `.Add(doc.Inspector)`).
  - `app.mu`: no `EditorShell` change (the shell self-registers the dock);
    remove any now-dead InspectorService references if present.

## Component 4 — Release

Republish `@pragmatic-lab/mural` (0.1.44) to the local Verdaccio registry and
bump/install it in Plexus (same flow as the AutoScrollToEnd feature).

## Testing

**Mural** — `PanelDockService` unit tests (new file under
`src/framework/tests/`):
- `Add` appends a panel, sets `SelectedPanel` to it, and flips `HasPanels` true.
- `Add` with a duplicate `Id` re-selects the existing panel and does not append.
- `CloseById` removes the panel; removing the selected panel selects an adjacent
  one (or clears selection when it was the last).
- `Clear` empties `Panels` and `HasPanels` goes false.
- Region render: `DataTemplate[PanelDockService]` materializes a `TabControl`
  whose `ItemsSource` is `Panels` and `SelectedItem` tracks `SelectedPanel`.

The three retired inspector tests (`inspector-host`, `inspector-diagram-view`,
`inspector-context-menu`) are replaced/rewritten against `PanelDockService`
(the add/dedupe/select host behavior and the diagram inspector rendering as a
dock tab).

**Plexus** — no new unit test for the markup/bootstrap rewiring; verified by
`npm run compile:mu` passing and a manual `npm run dev` smoke:
- Dock shows **Chat** as the default tab; Agent is gone from the left rail.
- Selecting a shape / invoking Format Shape adds an inspector tab and selects it.
- Tabs switch; per-tab close works; closing the last panel collapses the region;
  the resize splitter works.

## Out of scope

- Pop-out / tear-off of a dock tab into a standalone window (multi-window
  backlog).
- Drag-to-reorder tabs, drag a tab between the dock and the document area.
- Persisting the dock's open tabs / selected tab / width across sessions.
- Left-docking or bottom-docking the panel dock (right edge only).
