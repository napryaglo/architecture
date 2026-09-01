# Right Panel Dock Region Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shell's right-side inspector-stack region with a general tabbed **panel dock** (`PanelDockService` + `TabControl`) that hosts agent chat and inspectors as tabs.

**Architecture:** A new general `PanelDockService` (an Add/Close/dedupe host with a `SelectedPanel`) modeled on `InspectorService`, rendered by `DataTemplate[PanelDockService]` as a `TabControl` in a new right-docked region of the `EditorShell` template. The existing inspector *content* (`Inspector`/`DiagramInspector`) is kept and hosted as dock panels; the inspector *host* + *stack presentation* (`InspectorService`/`InspectorStack`/`InspectorPanel`) are retired. Plexus migrates agent chat off the left rail into the dock and routes its inspectors to the dock.

**Tech Stack:** TypeScript, `node:test` (Mural, via `tsx`), Mural `.mu` compiler, Verdaccio, electron-vite (Plexus), Vitest (Plexus).

## Global Constraints

- **Replace, not coexist**: the dock is THE single right region; the inspector-stack region is retired.
- **Agent chat leaves the left rail**: it lives only as a dock tab; the other capabilities stay.
- **Keep inspector content** (`Inspector`/`IInspector`/`DiagramInspector` + their DataTemplates); retire only `InspectorService`/`InspectorStack`/`InspectorPanel`.
- **Pop-out deferred** — v1 chrome = tabs + per-tab close + dock collapse (empty) + resize splitter.
- Every test file lives in a `tests/` subfolder next to its source (Mural + Plexus convention).
- Enums over string-literal unions; do not introduce string-literal union types.
- Mural tests: `npx tsx --conditions=development --test <file>` from `Mural/`.
- Commit after each task. Author `Eugene Napryaglo <evgen.napryaglo@gmail.com>`; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- **Create** `Mural/src/framework/shell/services/dock-panel.ts` — `IDockPanel { Id, Title }`.
- **Create** `Mural/src/framework/shell/services/panel-dock-service.ts` — `PanelDockService`.
- **Create** `Mural/src/framework/tests/panel-dock-host.test.ts` — dock host + region-render tests (replaces `inspector-host.test.ts`).
- **Modify** `Mural/src/framework/shell/editor-shell.ts` — register `PanelDockService` (was `InspectorService`).
- **Modify** `Mural/src/framework/shell/shell.template.mu` — new dock region + `DataTemplate[PanelDockService]` + `@DockTabHeader`; remove inspector region + `InspectorStack`/`InspectorPanel` templates.
- **Modify** `Mural/src/framework/index.ts` — export `PanelDockService`/`IDockPanel`; drop `InspectorService`/`InspectorPanel`/`InspectorStack`.
- **Delete** `Mural/src/framework/shell/services/inspector-service.ts`, `Mural/src/framework/shell/inspector/inspector-stack.ts`, `Mural/src/framework/shell/inspector/inspector-panel.ts`, `Mural/src/framework/tests/inspector-host.test.ts`.
- **Modify** `Mural/src/framework/tests/inspector-diagram-view.test.ts`, `Mural/src/framework/tests/inspector-context-menu.test.ts` — retarget to `PanelDockService`.
- **Modify** `Mural/package.json` — 0.1.44.
- **Modify (Plexus)** `agent-chat.module.mu`, `services/agent-service.ts`, `main.js`, `modules/diagram/behaviors/auto-open-inspector-behavior.ts`, `modules/diagram/diagram.resources.mu`, `package.json`.

Keep `Mural/src/framework/shell/services/inspector.ts` (the `Inspector` base + `IInspector`) — `DiagramInspector` extends it and it satisfies `IDockPanel`.

---

## Task 1: `IDockPanel` + `PanelDockService` (Mural)

**Files:**
- Create: `Mural/src/framework/shell/services/dock-panel.ts`
- Create: `Mural/src/framework/shell/services/panel-dock-service.ts`
- Test: `Mural/src/framework/tests/panel-dock-host.test.ts` (host-logic tests only in this task; region-render test lands in Task 2)

**Interfaces:**
- Produces: `IDockPanel { readonly Id: string; readonly Title: string }`; `PanelDockService extends ServiceBase` with `Key`, `Panels: ObservableCollection<IDockPanel>`, `SelectedPanel: IDockPanel | undefined`, `HasPanels: boolean`, `AddPanelCommand`/`ClosePanelCommand: ICommand`, and methods `Add(p): IDockPanel`, `Remove(p)`, `CloseById(id)`, `Clear()`.

- [ ] **Step 1: Write the failing host tests**

Create `Mural/src/framework/tests/panel-dock-host.test.ts`:

```ts
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { PanelDockService } from '../shell/services/panel-dock-service.js';
import type { IDockPanel } from '../shell/services/dock-panel.js';

// Minimal dock panel: an Id + Title is all IDockPanel requires.
class Panel implements IDockPanel {
    constructor(public readonly Id: string, public readonly Title: string) {}
}

describe('PanelDockService — tabbed dock host', () => {
    beforeEach(() => { initTestApp(); });

    function svc(): PanelDockService {
        return new PanelDockService(undefined as never);
    }

    test('Add appends, selects the added panel, and flips HasPanels', () => {
        const s = svc();
        assert.equal(s.HasPanels, false);
        const a = s.Add(new Panel('a', 'Alpha'));
        assert.equal(s.Panels.Count, 1);
        assert.equal(s.SelectedPanel, a);
        assert.equal(s.HasPanels, true);
    });

    test('Add dedupes by Id — re-adds re-select the existing panel, no duplicate', () => {
        const s = svc();
        const a = s.Add(new Panel('a', 'Alpha'));
        s.Add(new Panel('b', 'Beta'));
        const again = s.Add(new Panel('a', 'Alpha again'));
        assert.equal(again, a, 'returns the existing instance');
        assert.equal(s.Panels.Count, 2, 'no duplicate');
        assert.equal(s.SelectedPanel, a, 're-add re-selects the existing panel');
    });

    test('CloseById removes; closing the selected panel selects an adjacent one', () => {
        const s = svc();
        s.Add(new Panel('a', 'Alpha'));
        const b = s.Add(new Panel('b', 'Beta'));   // selected (last added)
        s.CloseById('b');
        assert.equal(s.Panels.Count, 1);
        assert.equal(s.SelectedPanel?.Id, 'a', 'selection falls back to the survivor');
        assert.notEqual(s.SelectedPanel, b);
    });

    test('closing the last panel clears selection and HasPanels', () => {
        const s = svc();
        s.Add(new Panel('a', 'Alpha'));
        s.CloseById('a');
        assert.equal(s.Panels.Count, 0);
        assert.equal(s.SelectedPanel, undefined);
        assert.equal(s.HasPanels, false);
    });

    test('ClosePanelCommand closes by Id parameter', () => {
        const s = svc();
        s.Add(new Panel('a', 'Alpha'));
        s.ClosePanelCommand.Execute('a');
        assert.equal(s.Panels.Count, 0);
    });

    test('Clear empties the dock', () => {
        const s = svc();
        s.Add(new Panel('a', 'Alpha'));
        s.Add(new Panel('b', 'Beta'));
        s.Clear();
        assert.equal(s.Panels.Count, 0);
        assert.equal(s.HasPanels, false);
        assert.equal(s.SelectedPanel, undefined);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --conditions=development --test src/framework/tests/panel-dock-host.test.ts`
Expected: FAIL — `panel-dock-service.js` / `dock-panel.js` do not exist.

- [ ] **Step 3a: Create the item contract**

Create `Mural/src/framework/shell/services/dock-panel.ts`:

```ts
// One panel hosted by the PanelDockService — the shell's right-side tabbed dock.
// The dock renders each panel body-first through a DataTemplate matched to its
// runtime type (the same implicit-by-type dispatch a TabControl content area
// uses); the tab header shows the Title. The `Inspector` base already satisfies
// this (Id + Title), so every inspector is a dock panel; a Plexus AgentService
// implements it to appear as the Chat tab.
//
//   * Id    — stable identity. The host dedupes by it: Add()-ing a panel whose
//             Id already hosts re-selects the existing tab instead of stacking a
//             duplicate.
//   * Title — the tab header text.
export interface IDockPanel
{
    readonly Id: string;
    readonly Title: string;
}
```

- [ ] **Step 3b: Create the service**

Create `Mural/src/framework/shell/services/panel-dock-service.ts` (modeled on `inspector-service.ts`):

```ts
import {
    type ICommand,
    type IServiceProvider,
    MetaData,
    Model,
    ObservableCollection,
    RelayCommand,
    ServiceBase,
    ServiceKey,
} from '../../../runtime/index.js';
import type { IDockPanel } from './dock-panel.js';

// Backs the shell's right-side tabbed dock: a HOST for multiple panels
// (agent chat, inspectors, …) shown as tabs. Anything in the app resolves this
// service and Add()s a panel; the region binds `Content = $service(PanelDockService)`
// and renders the Panels as a TabControl whose header strip lists the panels and
// whose body shows SelectedPanel through its own DataTemplate. Empty ⇒ the region
// collapses.
//
// Parallels InspectorService (the retired stack host) and
// DocumentsContentHostService (the editor group): a stable per-instance
// collection a view binds, plus Add/Close lifecycle. The difference from the old
// inspector stack is presentation (tabs, one SelectedPanel) instead of a
// simultaneous stack.
export class PanelDockService extends ServiceBase
{
    public static readonly Key = new ServiceKey<PanelDockService>('PanelDockService');

    // The hosted panel set — a stable per-instance collection the region's
    // TabControl binds (`ItemsSource = $Panels`); the reference never changes.
    public static readonly PanelsKey = Model.RegisterProperty<ObservableCollection<IDockPanel>>(
        PanelDockService, 'Panels',
        undefined as unknown as ObservableCollection<IDockPanel>, MetaData.None);

    // The active tab — TwoWay-bound to TabControl.SelectedItem so clicking a tab
    // updates it and Add()/Close() re-select programmatically.
    public static readonly SelectedPanelKey = Model.RegisterProperty<IDockPanel | undefined>(
        PanelDockService, 'SelectedPanel', undefined, MetaData.None | MetaData.BindsTwoWayByDefault);

    // True while at least one panel is hosted — the region binds its Visibility
    // (and its resize Splitter's) to this so an empty dock collapses out of layout.
    private static readonly _HasPanelsPriv = Model.RegisterReadOnlyProperty<boolean>(
        PanelDockService, 'HasPanels', false, MetaData.None);
    public static readonly HasPanelsKey = PanelDockService._HasPanelsPriv;

    // Command a menu binds to open a panel (`Command = $service(PanelDockService)
    // .AddPanelCommand, CommandParameter = $Panel`). Non-IDockPanel params no-op.
    public static readonly AddPanelCommandKey = Model.RegisterProperty<ICommand>(
        PanelDockService, 'AddPanelCommand', undefined as unknown as ICommand, MetaData.None);

    // Command a tab's close affordance binds (`CommandParameter = $Id`).
    public static readonly ClosePanelCommandKey = Model.RegisterProperty<ICommand>(
        PanelDockService, 'ClosePanelCommand', undefined as unknown as ICommand, MetaData.None);

    constructor(provider: IServiceProvider)
    {
        super(provider);
        const panels = new ObservableCollection<IDockPanel>();
        this.set_property_value(PanelDockService.PanelsKey, panels);
        panels.Subscribe(() => this.refreshHasPanels());
        this.set_property_value(
            PanelDockService.AddPanelCommandKey,
            new RelayCommand((p) => { if (isDockPanel(p)) this.Add(p); }, undefined,
                { Text: 'Add Panel', Description: 'Show a panel in the dock.' }));
        this.set_property_value(
            PanelDockService.ClosePanelCommandKey,
            new RelayCommand((id) => this.CloseById(id as string), undefined,
                { Text: 'Close', Description: 'Close this dock panel.' }));
    }

    public get Panels(): ObservableCollection<IDockPanel> { return this.get_property_value(PanelDockService.PanelsKey); }
    public get SelectedPanel(): IDockPanel | undefined { return this.get_property_value(PanelDockService.SelectedPanelKey); }
    public set SelectedPanel(v: IDockPanel | undefined) { this.set_property_value(PanelDockService.SelectedPanelKey, v); }
    public get HasPanels(): boolean { return this.get_property_value(PanelDockService.HasPanelsKey); }
    public get AddPanelCommand(): ICommand { return this.get_property_value(PanelDockService.AddPanelCommandKey); }
    public get ClosePanelCommand(): ICommand { return this.get_property_value(PanelDockService.ClosePanelCommandKey); }

    private refreshHasPanels(): void
    {
        this.set_property_value_with_key(PanelDockService._HasPanelsPriv, this.Panels.Count > 0);
    }

    // Add a panel, deduping by Id. Existing Id → re-select the existing instance
    // and return it. Otherwise append. Either way SelectedPanel ends on the
    // added-or-existing panel so opening a panel surfaces its tab.
    public Add(panel: IDockPanel): IDockPanel
    {
        const existing = this.find(panel.Id);
        if (existing !== undefined) { this.SelectedPanel = existing; return existing; }
        this.Panels.Add(panel);
        this.SelectedPanel = panel;
        return panel;
    }

    // Remove a hosted panel. When it was the selection, fall back to an adjacent
    // survivor (or undefined when none remain).
    public Remove(panel: IDockPanel): void
    {
        const index = this.Panels.IndexOf(panel);
        if (index < 0) return;
        const wasSelected = this.SelectedPanel === panel;
        this.Panels.RemoveAt(index);
        if (wasSelected)
        {
            const next = this.Panels.Count === 0
                ? undefined
                : this.Panels.Get(Math.min(index, this.Panels.Count - 1));
            this.SelectedPanel = next;
        }
    }

    public CloseById(id: string): void
    {
        if (typeof id !== 'string') return;
        const panel = this.find(id);
        if (panel !== undefined) this.Remove(panel);
    }

    public Clear(): void
    {
        this.Panels.Clear();
        this.SelectedPanel = undefined;
    }

    private find(id: string): IDockPanel | undefined
    {
        for (let i = 0; i < this.Panels.Count; i++)
        {
            const p = this.Panels.Get(i);
            if (p?.Id === id) return p;
        }
        return undefined;
    }
}

function isDockPanel(value: unknown): value is IDockPanel
{
    return value !== null
        && typeof value === 'object'
        && typeof (value as IDockPanel).Id === 'string'
        && typeof (value as IDockPanel).Title === 'string';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --conditions=development --test src/framework/tests/panel-dock-host.test.ts`
Expected: PASS — all six host tests.

- [ ] **Step 5: Commit**

```bash
git add src/framework/shell/services/dock-panel.ts src/framework/shell/services/panel-dock-service.ts src/framework/tests/panel-dock-host.test.ts
git commit -m "feat(shell): PanelDockService — tabbed right-dock host"
```

---

## Task 2: Shell region swap + retire inspector stack (Mural)

**Files:**
- Modify: `Mural/src/framework/shell/editor-shell.ts`
- Modify: `Mural/src/framework/shell/shell.template.mu`
- Modify: `Mural/src/framework/index.ts`
- Delete: `Mural/src/framework/shell/services/inspector-service.ts`, `Mural/src/framework/shell/inspector/inspector-stack.ts`, `Mural/src/framework/shell/inspector/inspector-panel.ts`, `Mural/src/framework/tests/inspector-host.test.ts`
- Test: `Mural/src/framework/tests/panel-dock-host.test.ts` (append a region-render test)

**Interfaces:**
- Consumes: `PanelDockService` (Task 1); `EditorShell`; `TabControl` (`ItemsSource`, `SelectedItem`, `ItemTemplate`).
- Produces: the shell's right region renders `DataTemplate[PanelDockService]` as a `TabControl`; `@DockTabHeader` keyed tab-header template; `PanelDockService` registered scoped by `EditorShell`.

- [ ] **Step 1: Write the failing region-render test**

First, at the TOP of `Mural/src/framework/tests/panel-dock-host.test.ts`, extend the imports (ES imports must stay at the top of the file — do NOT place them before the appended block below). The file currently imports `initTestApp`, `PanelDockService`, and `type IDockPanel`; add:

```ts
import { Application, MetaData, Model, Rect, Size, type Visual } from '../../runtime/index.js';
import { DataTemplate } from '../../basic/templates/data-template.js';
import { Border } from '../../basic/border.js';
import { EditorShell } from '../shell/editor-shell.js';
import { TabControl } from '../tabs/tabs.js';
```

(If the file's Task-1 imports already pull some of these names from the same module, merge rather than duplicate the specifier.)

Then APPEND this block (helpers + describe) at the END of the file:

```ts
function collect<T>(root: Visual, ctor: new (...a: never[]) => T, out: T[] = []): T[] {
    if (root instanceof ctor) out.push(root);
    for (const c of root.visualChildren) collect(c, ctor, out);
    return out;
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// A concrete dock panel rendered by a marker DataTemplate.
class ViewPanel extends Model implements IDockPanel {
    public static readonly IdKey = Model.RegisterProperty<string>(ViewPanel, 'Id', '', MetaData.None);
    public static readonly TitleKey = Model.RegisterProperty<string>(ViewPanel, 'Title', '', MetaData.None);
    public readonly marker = new Border();
    constructor(id: string, title: string) {
        super();
        this.set_property_value(ViewPanel.IdKey, id);
        this.set_property_value(ViewPanel.TitleKey, title);
    }
    public get Id(): string { return this.get_property_value(ViewPanel.IdKey); }
    public get Title(): string { return this.get_property_value(ViewPanel.TitleKey); }
}

describe('PanelDockService — shell region renders a TabControl', () => {
    beforeEach(() => {
        initTestApp();
        Application.current.Resources.Set(ViewPanel, new DataTemplate((s) => (s as ViewPanel).marker, ViewPanel));
    });

    async function mount(): Promise<{ root: Visual; dock: PanelDockService }> {
        const shell = new EditorShell();
        const root = shell.visualChildren[0]!;
        const dock = shell.Services.get(PanelDockService.Key) as PanelDockService;
        await settle();
        return { root, dock };
    }

    test('EditorShell registers PanelDockService', async () => {
        const { dock } = await mount();
        assert.ok(dock instanceof PanelDockService);
    });

    test('adding panels materializes a TabControl bound to Panels/SelectedPanel', async () => {
        const { root, dock } = await mount();
        const a = dock.Add(new ViewPanel('a', 'Alpha'));
        dock.Add(new ViewPanel('b', 'Beta'));
        await settle();
        root.Measure(new Size(1200, 800));
        root.Arrange(new Rect(0, 0, 1200, 800));

        const tabs = collect(root, TabControl);
        assert.equal(tabs.length, 1, 'one TabControl in the dock region');
        assert.equal(tabs[0]!.ItemsSource, dock.Panels, 'bound to Panels');
        assert.equal(tabs[0]!.SelectedItem, dock.SelectedPanel, 'SelectedItem tracks SelectedPanel');
        // Add() selected the last-added panel; re-selecting a is reflected.
        dock.SelectedPanel = a;
        await settle();
        assert.equal(tabs[0]!.SelectedItem, a);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --conditions=development --test src/framework/tests/panel-dock-host.test.ts`
Expected: FAIL — `shell.Services.get(PanelDockService.Key)` is undefined (EditorShell still registers InspectorService) and no `TabControl` is found.

- [ ] **Step 3a: Register the dock in EditorShell**

In `Mural/src/framework/shell/editor-shell.ts`, replace the `InspectorService` import and its registration block. Change the import line
`import { InspectorService } from './services/inspector-service.js';`
to
`import { PanelDockService } from './services/panel-dock-service.js';`

Replace the registration block (the `if (!this.Services.has(InspectorService.Key)) { … }` that provides the Inspector region) with:

```ts
        // Provide the right-dock region's service by default: a PanelDockService
        // (the tabbed panel host). The region presents it, rendered by
        // `DataTemplate[PanelDockService]` as a TabControl; it starts empty
        // (region collapsed) until something Add()s a panel. Same opt-out guard.
        if (!this.Services.has(PanelDockService.Key))
        {
            this.Services.registerScoped(PanelDockService.Key, (p) => new PanelDockService(p));
        }
```

- [ ] **Step 3b: Swap the region + template**

In `Mural/src/framework/shell/shell.template.mu`:

Replace the `PART_InspectorHost` `ContentPresenter` + its following `Splitter` (the block whose presenter binds `$service(InspectorService)`) with:

```
                    // Right dock region — presents the PanelDockService, rendered
                    // by DataTemplate[PanelDockService] as a TabControl (agent chat,
                    // inspectors, … as tabs). Empty ⇒ region + its Splitter collapse
                    // out of layout (Visibility off HasPanels). Definite Width lives
                    // HERE (the docked element the adjacent Splitter resizes).
                    ContentPresenter x:name="PART_RightDockHost"
                        [ DockPanel.Dock = Right,
                          Width          = 320,
                          Visibility     = $service(PanelDockService).HasPanels << ToVisibility,
                          Content        = $service(PanelDockService) ]
                    Splitter
                        [ DockPanel.Dock   = Right,
                          Width            = 6,
                          Orientation      = Vertical,
                          ReverseDirection = true,
                          Visibility       = $service(PanelDockService).HasPanels << ToVisibility ]
```

Replace `DataTemplate [DataType = InspectorService] { InspectorStack [ ItemsSource = $Inspectors ] }` with:

```
    // Right dock — the PanelDockService rendered as a TabControl. The header strip
    // lists the hosted panels; the body shows SelectedPanel through ITS own
    // DataTemplate (type dispatch, like the documents TabControl). ItemTemplate is
    // the TAB HEADER (title + close).
    DataTemplate [DataType = PanelDockService] {
        TabControl
            [ ItemsSource  = $Panels,
              SelectedItem = $SelectedPanel,
              ItemTemplate = @DockTabHeader ]
    }

    // One dock tab header: title + a close affordance. Reaches the host via
    // `$service` and passes the panel's Id. Keyed + applied as the TabControl's
    // ItemTemplate, so its DataType is nominal (mirrors @DocumentTabHeaderTemplate,
    // which carries RailAction as the structurally-compatible Title/Id placeholder).
    DataTemplate x:key="DockTabHeader" [DataType = RailAction] {
        StackPanel [ Orientation = Horizontal, VerticalAlignment = Center ] {
            TextBlock [ Text = $Title, VerticalAlignment = Center, Margin = (4,0,0,0) ]
            IconButton
                [ Template          = @CompactHeaderIconButton,
                  Command           = $service(PanelDockService).ClosePanelCommand,
                  CommandParameter  = $Id,
                  VerticalAlignment = Center,
                  Margin            = (2,0,0,0) ] {
                Shape [ Geometry = @IconClose, Fill = @OnSurfaceVariant, Width = 8, Height = 8 ]
            }
        }
    }
```

Delete these now-unused blocks in the same file: the `InspectorStackPanel` `ItemsPanelTemplate`, the `DefaultInspectorStack` `Template` + its `Style [TargetType = InspectorStack]`, and the `DefaultInspectorPanel` `Template` + its `Style [TargetType = InspectorPanel]`. **Keep** `@CompactHeaderIconButton`, the `PanelButton` style, and `@DocumentTabHeaderTemplate` (still used).

- [ ] **Step 3c: Delete the retired source + fix the barrel**

Delete files:

```bash
git rm src/framework/shell/services/inspector-service.ts \
       src/framework/shell/inspector/inspector-stack.ts \
       src/framework/shell/inspector/inspector-panel.ts \
       src/framework/tests/inspector-host.test.ts
```

In `Mural/src/framework/index.ts`: remove the `InspectorService` export line, the `InspectorPanel` export line, and the `InspectorStack` export line. Keep `export { Inspector, type IInspector } from './shell/services/inspector.js';`. Add:

```ts
export { PanelDockService } from './shell/services/panel-dock-service.js';
export { type IDockPanel } from './shell/services/dock-panel.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --conditions=development --test src/framework/tests/panel-dock-host.test.ts`
Expected: PASS — host + region-render tests.

Then typecheck: `npm run typecheck`
Expected: exit 0 (no dangling `InspectorService`/`InspectorStack`/`InspectorPanel` references remain in framework source; Task 3 fixes the two diagram inspector tests).

If typecheck reports the two diagram inspector tests, that is expected — they are retargeted in Task 3. Confirm no OTHER files reference the deleted symbols:
Run: `git grep -n "InspectorService\|InspectorStack\|InspectorPanel" src/`
Expected: only `src/framework/tests/inspector-diagram-view.test.ts` and `src/framework/tests/inspector-context-menu.test.ts` (fixed next task), plus docs/comments.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shell): right-dock TabControl region replaces the inspector stack"
```

---

## Task 3: Retarget the diagram inspector tests (Mural)

**Files:**
- Modify: `Mural/src/framework/tests/inspector-diagram-view.test.ts`
- Modify: `Mural/src/framework/tests/inspector-context-menu.test.ts`

**Interfaces:**
- Consumes: `PanelDockService` (Task 1), `DiagramInspector` (unchanged), the shell region (Task 2).

- [ ] **Step 1: Retarget `inspector-diagram-view.test.ts`**

This test mounts an `EditorShell`, resolves the inspector host, `Add()`s a `DiagramInspector`, and asserts the `ShapeFormatControl` receives the selection fill through the `$View` hop. Change the host from `InspectorService` to `PanelDockService`:

- Replace the import `import { InspectorService } from '../shell/services/inspector-service.js';` with `import { PanelDockService } from '../shell/services/panel-dock-service.js';`.
- In `mount()`, replace `shell.Services.get(InspectorService.Key) as InspectorService` with `shell.Services.get(PanelDockService.Key) as PanelDockService`, and change the returned type name accordingly.
- Replace the `svc.Add(inspector)` call target name (`svc`→`dock`) and any `svc.Inspectors`/`InspectorPanel` assertions: assert the `ShapeFormatControl` is found under `root` (via the existing `collect(root, ShapeFormatControl)`) and carries the red fill after selection — the `$View` behavior is unchanged; only the host + tab presentation differ. Remove any `InspectorPanel`/collapse assertions.

Run: `npx tsx --conditions=development --test src/framework/tests/inspector-diagram-view.test.ts`
Expected: PASS.

- [ ] **Step 2: Retarget `inspector-context-menu.test.ts`**

This test right-clicks to open a `ContextMenu` whose `MenuItem` command adds a `DiagramInspector` via `AddInspectorCommand`. Change to the dock:

- Replace the `InspectorService` import with `PanelDockService`.
- Where the menu item binds the add command, use `PanelDockService`'s `AddPanelCommand` (the service binding target) with the same `$Inspector` parameter.
- Replace `InspectorService.Key`/`.Inspectors` with `PanelDockService.Key`/`.Panels`; assert the panel count grew and the added `DiagramInspector` is the `SelectedPanel`.

Run: `npx tsx --conditions=development --test src/framework/tests/inspector-context-menu.test.ts`
Expected: PASS.

- [ ] **Step 3: Full Mural typecheck + shell suite**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npx tsx --conditions=development --test src/framework/tests/panel-dock-host.test.ts src/framework/tests/inspector-diagram-view.test.ts src/framework/tests/inspector-context-menu.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/framework/tests/inspector-diagram-view.test.ts src/framework/tests/inspector-context-menu.test.ts
git commit -m "test(shell): retarget diagram inspector tests to PanelDockService"
```

---

## Task 4: Release Mural 0.1.44

**Files:**
- Modify: `Mural/package.json`

- [ ] **Step 1: Bump the version**

In `Mural/package.json`, change `"version": "0.1.43"` to `"version": "0.1.44"`.

- [ ] **Step 2: Publish (build runs via prepublishOnly)**

From `Mural/`:

```bash
npm publish
```
Expected: `+ @pragmatic-tech-ai/mural@0.1.44` to `http://localhost:4873/`. `prepublishOnly` runs `clean && build` (tsc) — a clean build is the typecheck gate.

- [ ] **Step 3: Commit**

```bash
git add package.json && git commit -m "chore(release): mural 0.1.44 (PanelDockService)"
```

---

## Task 5: Plexus migration — agent chat + inspector into the dock

**Files:**
- Modify: `Plexus/package.json`
- Modify: `Plexus/src/renderer/src/modules/agent-chat/agent-chat.module.mu`
- Modify: `Plexus/src/renderer/src/modules/agent-chat/services/agent-service.ts`
- Modify: `Plexus/src/renderer/src/main.js`
- Modify: `Plexus/src/renderer/src/modules/diagram/behaviors/auto-open-inspector-behavior.ts`
- Modify: `Plexus/src/renderer/src/modules/diagram/diagram.resources.mu`

**Interfaces:**
- Consumes: `PanelDockService`, `IDockPanel` from `@pragmatic-tech-ai/mural/framework` (0.1.44).

- [ ] **Step 1: Install Mural 0.1.44**

In `Plexus/package.json`, set `@pragmatic-tech-ai/mural` to `"^0.1.44"`. From `Plexus/`:

```bash
npm install @pragmatic-tech-ai/mural@0.1.44
```
Confirm: `Get-Content node_modules/@pragmatic-tech-ai/mural/package.json` shows `0.1.44`.

- [ ] **Step 2: Agent chat leaves the left rail**

In `Plexus/src/renderer/src/modules/agent-chat/agent-chat.module.mu`, delete the `Capability [ … ]` line, keeping the `.services: { AgentService }` block. The module now only registers the service.

- [ ] **Step 3: Give `AgentService` an Id + Title (make it an `IDockPanel`)**

In `Plexus/src/renderer/src/modules/agent-chat/services/agent-service.ts`, add the `IDockPanel` import and constant `Id`/`Title` DPs. Add to the imports:

```ts
import type { IDockPanel } from '@pragmatic-tech-ai/mural/framework'
```

Change the class declaration to implement it and add the DPs + getters (constant values set in the ctor):

```ts
export class AgentService extends ServiceBase implements IDockPanel
{
    public static readonly Key = new ServiceKey<AgentService>('AgentService')

    public static readonly IdKey = Model.RegisterProperty<string>(
        AgentService, 'Id', 'agent', MetaData.None)
    public static readonly TitleKey = Model.RegisterProperty<string>(
        AgentService, 'Title', 'Chat', MetaData.None)
    // …existing DPs…
```

Add the getters next to the other accessors:

```ts
    public get Id(): string { return this.get_property_value(AgentService.IdKey) }
    public get Title(): string { return this.get_property_value(AgentService.TitleKey) }
```

- [ ] **Step 4: Add the Chat tab at startup + route the inspector to the dock (main.js)**

In `Plexus/src/renderer/src/main.js`:

Change the framework import to pull `PanelDockService` instead of `InspectorService`:

```js
import { ContentHostService, PanelDockService } from '@pragmatic-tech-ai/mural/framework'
```

Add the `AgentService` import (top of file, with the other module-service imports):

```js
import AgentService from './modules/agent-chat/services/agent-service.js'
```

Replace the inspector-wiring block (`const inspectors = app.Services.get(InspectorService.Key) … attachAutoOpenInspector(workspace.Document, inspectors)`) with dock wiring that also seeds the Chat tab:

```js
    // Right dock: seed the always-present Chat tab, and auto-open the Format
    // Shape inspector as a tab the first time a shape is selected.
    const dock = app.Services.get(PanelDockService.Key)
    const agent = app.Services.get(AgentService.Key)
    if (dock !== undefined && agent !== undefined) dock.Add(agent)
    if (workspace !== undefined && dock !== undefined)
    {
        attachAutoOpenInspector(workspace.Document, dock)
    }
```

- [ ] **Step 5: Point the auto-open behavior at the dock**

In `Plexus/src/renderer/src/modules/diagram/behaviors/auto-open-inspector-behavior.ts`:

- Change the import `import { Diagram, DiagramDocument, type InspectorService } from '@pragmatic-tech-ai/mural/framework'` to `… type PanelDockService …`.
- Change the parameter `inspectors: InspectorService` to `dock: PanelDockService`.
- Change the body call `inspectors.Add(doc.Inspector)` to `dock.Add(doc.Inspector)`.

(`doc.Inspector` is a `DiagramInspector`, which satisfies `IDockPanel` via the `Inspector` base — no other change.)

- [ ] **Step 6: Rebind the Format Shape + Layout menu items**

In `Plexus/src/renderer/src/modules/diagram/diagram.resources.mu`, in the `DiagramContextMenu`, change both inspector-add menu items:

```
        MenuItem
            [ Header           = "Format Shape",
              Command          = $service(PanelDockService).AddPanelCommand,
              CommandParameter = $Inspector ]
        MenuSeparator
        MenuItem
            [ Header           = "Layout…",
              Command          = $service(PanelDockService).AddPanelCommand,
              CommandParameter = $service(LayoutPipelineService).Inspector ]
```

Update the block comment above the menu (lines ~173–180) to say the dock/PanelDockService rather than the InspectorService/Inspector region.

- [ ] **Step 7: Compile + typecheck**

From `Plexus/`:

```bash
npm run compile:mu
```
Expected: exit 0 — no unknown symbol for `PanelDockService`/`AddPanelCommand`; `agent-chat.*.mu.js` + `diagram.resources.mu.js` regenerate.

```bash
npm run typecheck
```
Expected: exit 0 (if a `typecheck` script exists; otherwise `npx tsc --noEmit -p tsconfig.node.json` or the renderer tsconfig). No dangling `InspectorService` references.

Confirm no stragglers:
`git grep -n "InspectorService" src/`
Expected: no matches.

- [ ] **Step 8: Manual smoke (not committed)**

From `Plexus/`: `npm run dev`. Confirm: the right dock shows a **Chat** tab by default; Agent is gone from the left activity rail; right-clicking the canvas → **Format Shape** (or selecting a shape) adds a Format-Shape tab and selects it; tabs switch; per-tab close works; closing the last tab collapses the dock; the resize splitter works.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/renderer/src/modules/agent-chat/agent-chat.module.mu src/renderer/src/modules/agent-chat/services/agent-service.ts src/renderer/src/main.js src/renderer/src/modules/diagram/behaviors/auto-open-inspector-behavior.ts src/renderer/src/modules/diagram/diagram.resources.mu
git commit -m "feat(shell): move agent chat + inspectors into the right panel dock"
```

---

## Final verification

- [ ] Mural shell suite green:

```bash
cd Mural && npx tsx --conditions=development --test src/framework/tests/panel-dock-host.test.ts src/framework/tests/inspector-diagram-view.test.ts src/framework/tests/inspector-context-menu.test.ts
```
Expected: all PASS.

- [ ] Mural typecheck: `cd Mural && npm run typecheck` → exit 0.
- [ ] Plexus compiles: `cd Plexus && npm run compile:mu` → exit 0.
- [ ] `git grep -n "InspectorService\|InspectorStack\|InspectorPanel" Mural/src Plexus/src` → only comments/docs, no live code.
