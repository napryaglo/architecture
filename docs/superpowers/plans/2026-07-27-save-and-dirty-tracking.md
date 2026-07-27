# Global Dirty-Tracking + Save / Save All — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track which open documents have unsaved changes and provide global Save (active doc) / Save All (every dirty doc) on the toolbar, a `•` dirty indicator on tabs, and `Ctrl+S` / `Ctrl+Shift+S` — folding the old project-explorer save into this host-owned mechanism.

**Architecture:** The reusable core lands on the framework `DocumentsContentHostService` (it already owns `OpenDocuments`/`ActiveDocument`/`Save()`): a reactive `AnyDirty` aggregation plus `SaveActiveCommand`/`SaveAllCommand`. Surfacing (a command-bar cluster + a tab dot) lives in the framework shell/tab templates so any `EditorShell` app inherits it. Plexus wires the keyboard shortcuts, supplies the `@SaveAll` icon, and deletes its own explorer save.

**Tech Stack:** TypeScript, mural runtime (`Model` DPs, `RelayCommand`, `ObservableCollection`), mural `.mu` templates, Electron renderer (Plexus), node:test + tsx (mural), vitest (Plexus), Verdaccio local registry.

## Global Constraints

- Persistence flows through the existing `IDocument.Save()` contract (`Id`/`Title`/`IsDirty`/`Save()`). No document context is introduced — Save/Save All are host-level, surfaced whenever a document is active.
- The framework ships no icons except SVG-include shapes; app icons resolve via `DynamicResource` (empty when absent). `@Save`/`@SaveAll` are Plexus-supplied; `@IconDirtyDot` is framework-supplied.
- mural tests: `npx tsx --conditions=development --test <file>`. mural template build: `npm run build:templates` (compiles `.mu` → `build/**/*.mu.js`; run before running tests that load templates). Plexus tests: `npx vitest run <file>`. Plexus `.mu`: `npm run compile:mu`. Plexus typecheck: `npm run typecheck`.
- **Commits are HELD** until the user explicitly asks (standing rule). The "Commit" steps below stage the work; do NOT actually commit unless told — the user batches one squashed commit per repo at the end.
- After mural changes: bump `Mural/package.json` patch version, `npm publish` (Verdaccio), then `npm install @pragmatic-lab/mural@<new>` in Plexus before Plexus tasks.

---

## File Structure

**mural (framework):**
- `src/framework/shell/services/documents-content-host-service.ts` — add `AnyDirty`, dirty subscriptions, `SaveActiveCommand`/`SaveAllCommand`, `SaveAll()`.
- `src/framework/shell/tests/content-host-service.test.ts` — add dirty-aggregation + save-command tests (+ a `Model`-based test doc).
- `src/resources/shapes/dot.svg` — CREATE (filled circle).
- `src/resources/basic.resources.mu` — add `@IconDirtyDot`.
- `src/framework/shell/shell.template.mu` — add `•` to `@DocumentTabHeaderTemplate`; add Save/Save All cluster to `PART_CommandHost`.

**Plexus (app):**
- `src/renderer/src/icons/save-all.svg` — CREATE.
- `src/renderer/src/plexus-icons.mu` — add `@SaveAll` include.
- `src/renderer/src/services/documents/save-shortcuts.ts` — CREATE (`attachSaveShortcuts`).
- `src/renderer/src/services/documents/tests/save-shortcuts.test.ts` — CREATE.
- `src/renderer/src/main.js` — wire `attachSaveShortcuts`.
- `src/renderer/src/modules/project-explorer/services/project-explorer-service.ts` — delete `SaveActiveCommand` + `saveActive()`.
- `src/renderer/src/modules/project-explorer/project-explorer.resources.mu` — delete the Save `PanelButton`.

---

## Task 1: Framework — dirty aggregation + Save/Save All commands

**Files:**
- Modify: `Mural/src/framework/shell/services/documents-content-host-service.ts`
- Test: `Mural/src/framework/shell/tests/content-host-service.test.ts`

**Interfaces:**
- Consumes: `IDocument` (`Id`/`Title`/`IsDirty`/`Save()`), `ObservableCollection`, `RelayCommand`, `Model`, `resolveKey` from `../../../runtime/model-internals.js`.
- Produces (on `DocumentsContentHostService`):
  - `static readonly AnyDirtyKey` (read-only bool DP); `get AnyDirty(): boolean`.
  - `static readonly SaveActiveCommandKey: PropertyKey`; `get SaveActiveCommand(): ICommand`.
  - `static readonly SaveAllCommandKey: PropertyKey`; `get SaveAllCommand(): ICommand`.
  - `SaveAll(): Promise<void>` — awaits `Save()` on every dirty open doc.

- [ ] **Step 1: Write failing tests**

Add to `content-host-service.test.ts`. First add a `Model`-based dirty doc near the top (after the existing `FakeDoc`), because `FakeDoc` is a plain class with no property-changed notifications:

```ts
import { Model, MetaData, RelayCommand } from '../../../runtime/index.js';
import { resolveKey } from '../../../runtime/model-internals.js';

// A Model document whose IsDirty is a reactive DP (so the host's aggregation
// sees changes), recording Save() calls.
class DirtyDoc extends Model implements IDocument {
    static { Model.RegisterProperty(DirtyDoc, 'IsDirty', false, MetaData.None); }
    public saveCount = 0;
    constructor(public readonly Id: string, public readonly Title: string = Id) { super(); }
    public get IsDirty(): boolean { return this.get_property_value(resolveKey(this, undefined, 'IsDirty')); }
    public markDirty(): void { this.set_property_value(resolveKey(this, undefined, 'IsDirty'), true); }
    public Save(): void { this.saveCount++; this.set_property_value(resolveKey(this, undefined, 'IsDirty'), false); }
}
```

Then the tests:

```ts
describe('DocumentsContentHostService — dirty tracking + save commands', () => {
    test('AnyDirty aggregates open documents reactively', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new DirtyDoc('a'); const b = new DirtyDoc('b');
        host.Open(a); host.Open(b);
        assert.equal(host.AnyDirty, false, 'clean set → false');
        a.markDirty();
        assert.equal(host.AnyDirty, true, 'a dirty → true');
        a.Save();
        assert.equal(host.AnyDirty, false, 'a saved → false');
    });

    test('removing the only dirty doc recomputes AnyDirty', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new DirtyDoc('a'); host.Open(a); a.markDirty();
        assert.equal(host.AnyDirty, true);
        host.Close(a);
        assert.equal(host.AnyDirty, false, 'closing the dirty doc clears AnyDirty');
    });

    test('SaveActiveCommand: enabled iff active doc is dirty; saves the active doc', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new DirtyDoc('a'); host.Open(a);
        assert.equal(host.SaveActiveCommand.CanExecute(undefined), false, 'clean → disabled');
        a.markDirty();
        assert.equal(host.SaveActiveCommand.CanExecute(undefined), true, 'dirty → enabled');
        host.SaveActiveCommand.Execute(undefined);
        assert.equal(a.saveCount, 1);
        assert.equal(host.SaveActiveCommand.CanExecute(undefined), false, 'saved → disabled');
    });

    test('SaveAllCommand: enabled iff any dirty; saves only the dirty docs', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new DirtyDoc('a'); const b = new DirtyDoc('b'); const c = new DirtyDoc('c');
        host.Open(a); host.Open(b); host.Open(c);
        assert.equal(host.SaveAllCommand.CanExecute(undefined), false);
        a.markDirty(); c.markDirty();
        assert.equal(host.SaveAllCommand.CanExecute(undefined), true);
        host.SaveAllCommand.Execute(undefined);
        assert.equal(a.saveCount, 1); assert.equal(b.saveCount, 0); assert.equal(c.saveCount, 1);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/shell/tests/content-host-service.test.ts`
Expected: FAIL — `host.AnyDirty` / `host.SaveActiveCommand` / `host.SaveAllCommand` are undefined.

- [ ] **Step 3: Implement**

In `documents-content-host-service.ts`:

Add imports at the top (extend the existing runtime import; add the internals import and `Model`):

```ts
import { Model } from '../../../runtime/index.js';
import { resolveKey } from '../../../runtime/model-internals.js';
```

Add DPs after `TabMenuKey`:

```ts
    // True while at least one open document has unsaved changes. Read-only —
    // recomputed from the open set + each document's IsDirty. Drives SaveAll
    // enablement and any dirty affordance.
    private static readonly _AnyDirtyPriv = Model.RegisterReadOnlyProperty<boolean>(
        DocumentsContentHostService, 'AnyDirty', false, MetaData.None);
    public static readonly AnyDirtyKey = DocumentsContentHostService._AnyDirtyPriv;

    // Save the ACTIVE document. Enabled iff the active doc is dirty. A toolbar
    // button binds `$service(ContentHostService).SaveActiveCommand`.
    public static readonly SaveActiveCommandKey = Model.RegisterProperty<ICommand>(
        DocumentsContentHostService, 'SaveActiveCommand', undefined as unknown as ICommand, MetaData.None);

    // Save EVERY dirty open document. Enabled iff AnyDirty.
    public static readonly SaveAllCommandKey = Model.RegisterProperty<ICommand>(
        DocumentsContentHostService, 'SaveAllCommand', undefined as unknown as ICommand, MetaData.None);
```

Add a field for per-doc dirty subscriptions (near `extendedCommandsUnsub`):

```ts
    // Per-open-document IsDirty unsubscribe thunks, keyed by document, so the
    // aggregation reconciles as the open set changes.
    private readonly dirtySubs = new Map<IDocument, () => void>();
```

In the constructor, after `this.OpenDocuments.Subscribe(() => this.rebuildTabMenu());`, add:

```ts
        this.set_property_value(
            DocumentsContentHostService.SaveActiveCommandKey,
            new RelayCommand(
                () => { void this.Save(); },
                () => this.ActiveDocument?.IsDirty === true,
                { Text: 'Save', Description: 'Save the active document.' }));
        this.set_property_value(
            DocumentsContentHostService.SaveAllCommandKey,
            new RelayCommand(
                () => { void this.SaveAll(); },
                () => this.AnyDirty,
                { Text: 'Save All', Description: 'Save all documents with unsaved changes.' }));
        // Keep dirty subscriptions in sync with the open set, then seed.
        this.OpenDocuments.Subscribe(() => this.reconcileDirtySubscriptions());
        this.reconcileDirtySubscriptions();
```

Add getters (near the other getters):

```ts
    public get AnyDirty(): boolean { return this.get_property_value(DocumentsContentHostService.AnyDirtyKey); }
    public get SaveActiveCommand(): ICommand { return this.get_property_value(DocumentsContentHostService.SaveActiveCommandKey); }
    public get SaveAllCommand(): ICommand { return this.get_property_value(DocumentsContentHostService.SaveAllCommandKey); }
```

Add the reconcile/recompute/SaveAll methods (near `Save()`):

```ts
    // Subscribe to each open document's IsDirty (dropping subscriptions for docs
    // that left the set), then recompute AnyDirty. A document that isn't a Model
    // (no reactive IsDirty) contributes its static IsDirty with no live updates.
    private reconcileDirtySubscriptions(): void
    {
        const open = new Set(this.OpenDocuments);
        for (const [doc, unsub] of this.dirtySubs)
        {
            if (!open.has(doc)) { unsub(); this.dirtySubs.delete(doc); }
        }
        for (const doc of open)
        {
            if (this.dirtySubs.has(doc)) continue;
            if (doc instanceof Model)
            {
                const key = resolveKey(doc, undefined, 'IsDirty');
                const cb = (): void => this.recomputeDirty();
                doc.AddPropertyChangedListener(key, cb);
                this.dirtySubs.set(doc, () => doc.RemovePropertyChangedListener(key, cb));
            }
        }
        this.recomputeDirty();
    }

    // Recompute AnyDirty and requery the save commands' enablement.
    private recomputeDirty(): void
    {
        let any = false;
        for (const doc of this.OpenDocuments) { if (doc.IsDirty) { any = true; break; } }
        this.set_property_value_with_key(DocumentsContentHostService._AnyDirtyPriv, any);
        (this.SaveActiveCommand as RelayCommand | undefined)?.RaiseCanExecuteChanged();
        (this.SaveAllCommand as RelayCommand | undefined)?.RaiseCanExecuteChanged();
    }

    // Save every open document that has unsaved changes, in tab order.
    public async SaveAll(): Promise<void>
    {
        for (const doc of [...this.OpenDocuments])
        {
            if (doc.IsDirty) await doc.Save();
        }
    }
```

In `OnPropertyChanged`, inside the existing `if (descriptor.Name === 'ActiveDocument')` block (after the ExtendedCommands requery loop), add a SaveActive requery — the active doc changed, so its dirtiness may differ:

```ts
            (this.SaveActiveCommand as RelayCommand | undefined)?.RaiseCanExecuteChanged();
```

In `Dispose()`, before `super.Dispose()`, tear down dirty subs:

```ts
        for (const unsub of this.dirtySubs.values()) unsub();
        this.dirtySubs.clear();
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/shell/tests/content-host-service.test.ts`
Expected: PASS (all new tests + existing ones).

- [ ] **Step 5: Typecheck**

Run: `cd Mural && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 6: Stage (HOLD commit)**

```bash
git add src/framework/shell/services/documents-content-host-service.ts src/framework/shell/tests/content-host-service.test.ts
# Do NOT commit — held for the batch.
```

---

## Task 2: Framework — `@IconDirtyDot` + tab dirty indicator

**Files:**
- Create: `Mural/src/resources/shapes/dot.svg`
- Modify: `Mural/src/resources/basic.resources.mu`
- Modify: `Mural/src/framework/shell/shell.template.mu` (`@DocumentTabHeaderTemplate`)

**Interfaces:**
- Consumes: `IDocument.IsDirty` (via `$IsDirty` binding on the tab's document DataContext), `ToVisibility` (already imported in shell templates).
- Produces: `@IconDirtyDot` resource; a dirty `•` before the tab title.

- [ ] **Step 1: Create the dot glyph**

Create `Mural/src/resources/shapes/dot.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="6" fill="currentColor"/>
</svg>
```

- [ ] **Step 2: Register it**

In `Mural/src/resources/basic.resources.mu`, after `include "shapes/close.svg" as IconClose` (line ~60), add:

```
    // Small filled dot — the unsaved-changes indicator on a document tab
    // (Shape[Geometry=@IconDirtyDot]).
    include "shapes/dot.svg" as IconDirtyDot
```

- [ ] **Step 3: Add the dot to the tab header**

In `Mural/src/framework/shell/shell.template.mu`, in `DataTemplate x:key="DocumentTabHeaderTemplate"`, add a dirty dot as the FIRST child of the `StackPanel`, before the title `TextBlock`:

```
        StackPanel [ Orientation = Horizontal, VerticalAlignment = Center ] {
            Shape
                [ Geometry          = @IconDirtyDot,
                  Fill              = @OnSurfaceVariant,
                  Width             = 6,
                  Height            = 6,
                  VerticalAlignment = Center,
                  Margin            = (0,0,4,0),
                  Visibility        = $IsDirty << ToVisibility ]
            TextBlock [ Text = $Title, VerticalAlignment = Center, Margin = (4,0,0,0) ]
            ...existing close IconButton unchanged...
        }
```

(The template's `DataType` is nominally `RailAction`; `$IsDirty` is a loose DataContext path resolved at runtime against the document `Model`, exactly like `$Title`/`$Id` already are.)

- [ ] **Step 4: Build templates + verify compile**

Run: `cd Mural && npm run build:templates`
Expected: compiles with no "unknown symbol" error (`ToVisibility` and `@IconDirtyDot` both resolve; `@IconDirtyDot` is a DynamicResource key, `ToVisibility` is already used elsewhere in this file).

- [ ] **Step 5: Run the shell template/tests smoke**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/shell/tests/content-host-service.test.ts`
Expected: PASS (unchanged — this task is template-only; the run confirms nothing regressed in the shell service the templates bind).

- [ ] **Step 6: Stage (HOLD commit)**

```bash
git add src/resources/shapes/dot.svg src/resources/basic.resources.mu src/framework/shell/shell.template.mu
# Do NOT commit.
```

---

## Task 3: Framework — Save / Save All toolbar cluster

**Files:**
- Modify: `Mural/src/framework/shell/shell.template.mu` (`PART_CommandHost` in `@DefaultEditorShell`)

**Interfaces:**
- Consumes: `$service(ContentHostService).SaveActiveCommand` / `.SaveAllCommand` / `.ActiveDocument` (Task 1), `@Save`/`@SaveAll` (app icons, DynamicResource), `ToVisibility`, `IconButton`.
- Produces: a leading command-bar cluster with two icon buttons.

- [ ] **Step 1: Add the cluster**

In `@DefaultEditorShell`, inside `PART_CommandHost`'s inner `DockPanel [ LastChildFill = true ]`, add a `DockPanel.Dock = Left` cluster BEFORE the existing `ToolBar` (so it sits left of the module commands). It presents the host's save commands and collapses when no document is active:

```
                        DockPanel [ LastChildFill = true ] {
                            // Document save cluster — host-owned Save / Save All,
                            // shown whenever a document is active (VS-style). Icons
                            // are app-supplied (@Save/@SaveAll via DynamicResource);
                            // absent → empty glyph. Enablement is command-driven
                            // (Save: active dirty; Save All: any dirty).
                            StackPanel
                                [ DockPanel.Dock    = Left,
                                  Orientation       = Horizontal,
                                  VerticalAlignment = Center,
                                  Margin            = (0,0,8,0),
                                  Visibility        = $service(ContentHostService).ActiveDocument << ToVisibility ] {
                                IconButton [ Variant = Standard, Command = $service(ContentHostService).SaveActiveCommand ] {
                                    Shape [ Geometry = @Save, Fill = @OnSurfaceVariant, Width = 18, Height = 18 ]
                                }
                                IconButton [ Variant = Standard, Command = $service(ContentHostService).SaveAllCommand ] {
                                    Shape [ Geometry = @SaveAll, Fill = @OnSurfaceVariant, Width = 18, Height = 18 ]
                                }
                            }
                            ItemsControl
                                [ DockPanel.Dock   = Right,
                                  ItemsSource       = $service(ToolbarService).ToolbarControls,
                                  ItemsPanel        = @CommandControlsPanel,
                                  VerticalAlignment = Center ]
                            ToolBar [ ItemsSource = $service(ToolbarService).ToolbarItems ]
                        }
```

(A `DockPanel` consumes docked edges in child order; the save cluster is docked Left first, the controls Right, then the `ToolBar` fills. `ActiveDocument << ToVisibility`: an object is truthy → Visible, `undefined` → Collapsed.)

- [ ] **Step 2: Build templates + verify compile**

Run: `cd Mural && npm run build:templates`
Expected: compiles cleanly. `@Save`/`@SaveAll` are DynamicResource keys (runtime lookup) — no compile-time definition needed; `SaveActiveCommand`/`SaveAllCommand`/`ActiveDocument` are runtime binding paths on the resolved service instance.

- [ ] **Step 3: Stage (HOLD commit)**

```bash
git add src/framework/shell/shell.template.mu
# Do NOT commit.
```

---

## Task 4: Framework — publish to Verdaccio

**Files:**
- Modify: `Mural/package.json` (version bump)

- [ ] **Step 1: Full framework test + typecheck sanity**

Run: `cd Mural && npx tsc --noEmit -p tsconfig.json && npm run build:templates`
Expected: exit 0, templates compiled.

Run the touched suites:
`cd Mural && npx tsx --conditions=development --test src/framework/shell/tests/content-host-service.test.ts`
Expected: PASS.

- [ ] **Step 2: Bump + publish**

```bash
cd Mural
npm version patch --no-git-tag-version    # 0.1.47 → 0.1.48
npm publish                                # to Verdaccio (runs clean && build)
```

Expected: `+ @pragmatic-lab/mural@0.1.48`.

- [ ] **Step 3: Stage (HOLD commit)**

```bash
git add package.json
# Do NOT commit.
```

---

## Task 5: Plexus — `@SaveAll` icon + adopt new mural

**Files:**
- Create: `Plexus/src/renderer/src/icons/save-all.svg`
- Modify: `Plexus/src/renderer/src/plexus-icons.mu`
- Modify: `Plexus/package.json` (mural dependency) via `npm install`

**Interfaces:**
- Produces: `@SaveAll` app icon (consumed by the framework command-bar cluster from Task 3).

- [ ] **Step 1: Create the Save All glyph**

Create `Plexus/src/renderer/src/icons/save-all.svg` (two stacked save disks — a back disk offset up-left, a front save disk):

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path fill="currentColor" d="M20 6h-2v11H7v2c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V8l-2-2z"/>
    <path fill="currentColor" fill-rule="evenodd" d="M15 1H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V3l-2-2zM9.5 14C8.12 14 7 12.88 7 11.5S8.12 9 9.5 9 12 10.12 12 11.5 10.88 14 9.5 14zM13 6H4V3h9v3z"/>
</svg>
```

- [ ] **Step 2: Register it**

In `Plexus/src/renderer/src/plexus-icons.mu`, after `include "icons/save.svg" as Save` (line ~32), add:

```
    include "icons/save-all.svg"                 as SaveAll
```

- [ ] **Step 3: Install the new mural**

```bash
cd Plexus && npm install @pragmatic-lab/mural@0.1.48
```

Expected: `changed 1 package`; `require('./node_modules/@pragmatic-lab/mural/package.json').version` === `0.1.48`.

- [ ] **Step 4: Recompile `.mu` + typecheck**

Run: `cd Plexus && npm run compile:mu`
Expected: compiles all files (the merged `@SaveAll` resolves; the framework command-bar template referencing `@Save`/`@SaveAll` is in the mural dist, not recompiled here).

Run: `cd Plexus && npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Stage (HOLD commit)**

```bash
git add src/renderer/src/icons/save-all.svg src/renderer/src/plexus-icons.mu package.json package-lock.json
# Do NOT commit.
```

---

## Task 6: Plexus — `Ctrl+S` / `Ctrl+Shift+S` shortcuts

**Files:**
- Create: `Plexus/src/renderer/src/services/documents/save-shortcuts.ts`
- Create: `Plexus/src/renderer/src/services/documents/tests/save-shortcuts.test.ts`
- Modify: `Plexus/src/renderer/src/main.js`

**Interfaces:**
- Consumes: `DocumentsContentHostService` (`SaveActiveCommand`/`SaveAllCommand`, both `ICommand`), `ContentHostService.Key`.
- Produces: `attachSaveShortcuts(host: { SaveActiveCommand: ICommand; SaveAllCommand: ICommand }, target?: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void` — registers a capture-phase `keydown` listener; returns a detach thunk.

- [ ] **Step 1: Write the failing test**

Create `Plexus/src/renderer/src/services/documents/tests/save-shortcuts.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { attachSaveShortcuts } from '../save-shortcuts.js'

function fakeHost() {
    const calls = { save: 0, saveAll: 0 }
    return {
        calls,
        SaveActiveCommand: { CanExecute: () => true, Execute: () => { calls.save++ } },
        SaveAllCommand:    { CanExecute: () => true, Execute: () => { calls.saveAll++ } },
    }
}

// Minimal EventTarget capturing the capture-phase keydown listener.
function fakeWindow() {
    let handler: ((e: KeyboardEvent) => void) | undefined
    return {
        addEventListener: (t: string, h: (e: KeyboardEvent) => void, opts?: unknown) => {
            if (t === 'keydown' && (opts as { capture?: boolean })?.capture) handler = h
        },
        removeEventListener: () => { handler = undefined },
        fire: (init: Partial<KeyboardEvent>) => {
            let defaulted = false
            handler?.({ key: 'a', ctrlKey: false, metaKey: false, shiftKey: false,
                        preventDefault: () => { defaulted = true }, stopPropagation: () => {}, ...init } as KeyboardEvent)
            return defaulted
        },
    }
}

describe('attachSaveShortcuts', () => {
    test('Ctrl+S saves the active document and prevents default', () => {
        const host = fakeHost(); const win = fakeWindow()
        attachSaveShortcuts(host, win as unknown as Window)
        const prevented = win.fire({ key: 's', ctrlKey: true })
        expect(host.calls.save).toBe(1)
        expect(host.calls.saveAll).toBe(0)
        expect(prevented).toBe(true)
    })

    test('Ctrl+Shift+S saves all', () => {
        const host = fakeHost(); const win = fakeWindow()
        attachSaveShortcuts(host, win as unknown as Window)
        win.fire({ key: 's', ctrlKey: true, shiftKey: true })
        expect(host.calls.saveAll).toBe(1)
        expect(host.calls.save).toBe(0)
    })

    test('an unrelated chord does nothing and is not prevented', () => {
        const host = fakeHost(); const win = fakeWindow()
        attachSaveShortcuts(host, win as unknown as Window)
        const prevented = win.fire({ key: 'a', ctrlKey: true })
        expect(host.calls.save).toBe(0)
        expect(host.calls.saveAll).toBe(0)
        expect(prevented).toBe(false)
    })

    test('detach removes the listener', () => {
        const host = fakeHost(); const win = fakeWindow()
        const detach = attachSaveShortcuts(host, win as unknown as Window)
        detach()
        win.fire({ key: 's', ctrlKey: true })
        expect(host.calls.save).toBe(0)
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Plexus && npx vitest run src/renderer/src/services/documents/tests/save-shortcuts.test.ts`
Expected: FAIL — module `../save-shortcuts.js` not found.

- [ ] **Step 3: Implement**

Create `Plexus/src/renderer/src/services/documents/save-shortcuts.ts`:

```ts
import type { ICommand } from '@pragmatic-lab/mural/runtime'

// The bits of the document host the shortcuts drive.
interface SaveCommands {
    readonly SaveActiveCommand: ICommand
    readonly SaveAllCommand: ICommand
}

// Wire Ctrl+S (Save active) / Ctrl+Shift+S (Save All) at the window, CAPTURE
// phase. Capture is deliberate: it fires before Monaco's own handlers AND before
// the code-editor host's key-swallow boundary, so Ctrl+S works even while the
// editor is focused — the case that matters most. Cmd (metaKey) is accepted too
// for parity. Only these two chords are intercepted (everything else passes
// through untouched); a chord fires only when its command CanExecute, so nothing
// is swallowed when there is nothing to save. Returns a detach thunk.
export function attachSaveShortcuts(
    host: SaveCommands,
    target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
    const onKeyDown = (e: KeyboardEvent): void => {
        const mod = e.ctrlKey || e.metaKey
        if (!mod || e.key.toLowerCase() !== 's') return
        const command = e.shiftKey ? host.SaveAllCommand : host.SaveActiveCommand
        if (!command.CanExecute(undefined)) return
        e.preventDefault()
        e.stopPropagation()
        command.Execute(undefined)
    }
    target.addEventListener('keydown', onKeyDown, { capture: true })
    return () => target.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd Plexus && npx vitest run src/renderer/src/services/documents/tests/save-shortcuts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire from the bootstrap**

In `Plexus/src/renderer/src/main.js`, add an import near the top:

```js
import { attachSaveShortcuts } from './services/documents/save-shortcuts.js'
```

Then in the mount `try` block, after `const host = app.Services.get(ContentHostService.Key)` (and after `host.Open(...)`), add:

```js
    // Ctrl+S / Ctrl+Shift+S → Save / Save All on the document host.
    if (host !== undefined) attachSaveShortcuts(host)
```

- [ ] **Step 6: Typecheck**

Run: `cd Plexus && npm run typecheck`
Expected: exit 0. (`host` from `app.Services.get(ContentHostService.Key)` is typed as the host; `DocumentsContentHostService` satisfies `SaveCommands`.)

- [ ] **Step 7: Stage (HOLD commit)**

```bash
git add src/renderer/src/services/documents/save-shortcuts.ts src/renderer/src/services/documents/tests/save-shortcuts.test.ts src/renderer/src/main.js
# Do NOT commit.
```

---

## Task 7: Plexus — fold/remove the project-explorer save

**Files:**
- Modify: `Plexus/src/renderer/src/modules/project-explorer/services/project-explorer-service.ts`
- Modify: `Plexus/src/renderer/src/modules/project-explorer/project-explorer.resources.mu`
- Test: `Plexus/src/renderer/src/modules/project-explorer/services/tests/project-explorer-service.test.ts`

**Interfaces:**
- Consumes: the host `SaveActiveCommand` now provides "save the active document" globally.
- Produces: `ProjectExplorerService` no longer exposes `SaveActiveCommand`.

- [ ] **Step 1: Update the test to drop the explorer-save expectation**

In `project-explorer-service.test.ts`, delete the test `'the active document saves through the registered document editor'` (lines ~220-227) and any `saveActive` reference in the `Priv` interface (line ~90). Removing it is correct: saving is no longer an explorer responsibility.

- [ ] **Step 2: Run the suite to confirm the removed test is gone and the rest pass**

Run: `cd Plexus && npx vitest run src/renderer/src/modules/project-explorer/services/tests/project-explorer-service.test.ts`
Expected: PASS (the save test no longer present; everything else green).

- [ ] **Step 3: Delete the command from the service**

In `project-explorer-service.ts`, remove:
- the `SaveActiveCommandKey` static DP (lines ~107-108),
- its `set_property_value(...SaveActiveCommandKey, new RelayCommand(() => void this.saveActive()))` line in the ctor (line ~124),
- the `get SaveActiveCommand()` getter (line ~131),
- the `private async saveActive()` method (lines ~763-778).

Leave `docOwners`/`docPaths` in place (still used by close-cleanup and rename re-point). If, after removal, `resolveDocumentFactory` or an import becomes unused, remove that too (let `npm run typecheck` guide you).

- [ ] **Step 4: Remove the explorer Save button**

In `project-explorer.resources.mu`, delete the `PanelButton [ Command = $SaveActiveCommand ]` block (lines ~188-190) from the explorer side-pane header. If that leaves an empty `Commands` container, remove the now-empty wrapper too (keep the header's other controls intact).

- [ ] **Step 5: Recompile `.mu` + typecheck + full explorer suite**

Run: `cd Plexus && npm run compile:mu`
Expected: compiles (no reference to `$SaveActiveCommand` remains).

Run: `cd Plexus && npm run typecheck`
Expected: exit 0.

Run: `cd Plexus && npx vitest run src/renderer/src/modules/project-explorer/services/tests/project-explorer-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Stage (HOLD commit)**

```bash
git add src/renderer/src/modules/project-explorer/services/project-explorer-service.ts src/renderer/src/modules/project-explorer/project-explorer.resources.mu src/renderer/src/modules/project-explorer/services/tests/project-explorer-service.test.ts
# Do NOT commit.
```

---

## Task 8: Manual smoke (`npm run dev`)

Not automatable (Electron UI). After Tasks 1–7:

- [ ] Open a code (`.todl`) document; edit it → the tab shows a `•`, and the toolbar Save + Save All buttons enable.
- [ ] `Ctrl+S` → the file saves, `•` clears, Save disables. (Do it while the editor is focused — confirms the capture-phase handler beats Monaco + the key-swallow boundary.)
- [ ] Edit two documents; `Ctrl+Shift+S` (or the Save All button) → both save, both `•` clear.
- [ ] With no document open, the Save/Save All cluster is hidden. Open one → it appears.
- [ ] Edit a diagram document → Save persists it too (dirty clears).
- [ ] The project-explorer side pane no longer shows its own Save button.

---

## Self-Review

**Spec coverage:**
- Dirty tracking (`AnyDirty` + per-doc subscriptions) → Task 1. ✓
- Save / Save All commands (dirty-aware CanExecute, Save All saves only dirty) → Task 1. ✓
- Save() completeness (host awaits promise; void ok) → Task 1 `SaveAll` uses `await doc.Save()`; no concrete-doc change (per revised spec §3). ✓
- Toolbar surfacing (framework command-bar cluster, gated on ActiveDocument, app icons) → Task 3 + Task 5 (`@SaveAll`). ✓
- Tab dirty indicator (`•` before title via `$IsDirty << ToVisibility`, `@IconDirtyDot`) → Task 2. ✓
- Shortcuts (Ctrl+S / Ctrl+Shift+S, window capture) → Task 6. ✓
- Fold explorer save (delete `SaveActiveCommand` + button) → Task 7. ✓
- Testing (framework unit + Plexus shortcut + explorer regression + manual smoke) → Tasks 1/6/7/8. ✓
- Publish + adopt → Task 4/5. ✓

**Placeholder scan:** none — every code step has literal content.

**Type consistency:** `AnyDirty`/`SaveActiveCommand`/`SaveAllCommand`/`SaveAll()` names used identically in Tasks 1, 3, 6. `attachSaveShortcuts(host, target?)` signature matches its test and its `main.js` call site. `@IconDirtyDot`/`@Save`/`@SaveAll` keys consistent across Tasks 2/3/5. `ToVisibility` (truthy→Visible) applied to `ActiveDocument` (object|undefined) and `IsDirty` (bool) — both valid.
