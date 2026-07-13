# Drag & Drop — design

**Date:** 2026-06-04
**Status:** Approved for implementation planning
**Backlog deferral:** see `current-backlog.md` § 8 for v2 follow-ups

## 1. Motivation

Every drag interaction in mural today is hand-rolled on top of the routed-event pointer pipeline (`PointerDown` → `args.CapturePointer()` → `PointerMove` → `PointerUp`). The pattern works for slider thumbs and scroll-bar thumbs because they're intra-Visual gestures, but the diagram demo's three gestures — toolbox-tile → canvas, node-body → move, port → port-wire — fake cross-Visual drag with imperative state machines that bypass the framework. The toolbox-tile case is particularly awkward because the tile lives in a separate `ItemsControl` from the canvas; the current code pre-creates the actual node Visual on `PointerDown` and moves it during the drag.

This spec defines a first-class drag/drop subsystem that:

- handles cross-Visual drags (source and target are different Visual subtrees in the same `Application`),
- exposes a WPF-parity surface (`AllowDrop` DP, `DragEnter`/`Over`/`Leave`/`Drop` routed events, `DataObject` formats map, `DragDropEffects` enum, imperative `DragDrop.DoDragDrop`),
- adds declarative sugar (`IsDraggable=true` + `OnDragStart` markup props) over the imperative primitive,
- supports three preview modes (framework-rendered translucent clone of the source, no preview, or `DataTemplate` against the `DataObject`),
- retires the imperative gesture state machines in `DiagramVM` as its proof point.

## 2. Scope

### In scope (v1)

- Cross-Visual drags within one `Application`.
- WPF-style `DataObject` payload — a formats map (string format key → arbitrary value), receivers query supported formats.
- Imperative source primitive (`DragDrop.DoDragDrop`) AND declarative sugar (`IsDraggable` / `OnDragStart`) — sugar invokes the primitive after a configurable movement threshold (default 4 px).
- Full `DragDropEffects` (`None | Copy | Move | Link | All`). Source declares allowed; receivers set chosen via `args.Effect`; framework reads it for cursor feedback and the Drop decision.
- Four receiver-side routed events: `DragEnter`, `DragOver`, `DragLeave`, `Drop`. Tunnel + bubble through the existing dispatcher.
- An `IsDragOver` DP that mirrors `IsMouseOver` — flips true between Enter and Leave, drives `when($IsDragOver)` Style triggers.
- Three preview modes (per Q5): framework default ghost (translucent SVG clone), `null` (author-rendered), or `DataTemplate` resolved against the `DataObject`.
- A new `DragOverlay` layer on each `HtmlTarget` for previews + cursor styling.
- `DragSession` returned from `DoDragDrop`; `PromiseLike<DragDropEffects>` for `await`, plus `OnMove((x, y) => void)` for mode-B authors.
- Cancellation paths: ESC, window blur, OS `pointercancel`, programmatic `session.Cancel()`. All resolve to `None`, fire `DragLeave` on current receiver, no `Drop`.
- Headless test coverage for the full event family and session lifecycle.

### Explicitly out of scope (deferred to backlog § 8)

- OS-level file drops from outside the app (§ 8.1).
- Multi-pointer concurrent drags (§ 8.2).
- WPF's `GiveFeedback` / `QueryContinueDrag` source-side hooks (§ 8.3).
- Auto-scroll near `ScrollViewer` edges during drag (§ 8.4).
- `ItemsControl` drag-to-reorder helper + insertion-line adorner (§ 8.5).

## 3. Decisions (from brainstorming)

Recorded so reviewers can trace the design back to choices:

| Decision | Choice | Rationale |
|---|---|---|
| Gesture set (Q1) | **B**: cross-Visual within one Application | smallest cut that retires the awkward toolbox→canvas imperative code; intra-Visual-only would re-architect later |
| Payload shape (Q2) | **B**: WPF `DataObject` formats map | one source can publish multiple formats; receivers query what they understand; future cross-source / OS-file interop already fits the same shape |
| Initiation (Q3) | **C**: both imperative primitive + declarative sugar | 90% of authoring is one declarative line; bespoke sources (port wire) use the imperative primitive |
| Receiver feedback (Q4) | **A**: full `DragDropEffects` + `IsDragOver` DP | move-vs-copy semantics matter; the `IsDragOver` hook lets Style triggers re-skin drop zones without handler code |
| Preview modes (Q5) | **all three**: framework default ghost, `null`, `DataTemplate` | three concrete diagram cases naturally map to the three modes; one resolution rule (`opts.preview === undefined | null | DataTemplate`) covers all of them |
| Source during drag (Q6) | **A**: source sees nothing; `OnMove` callback on `DragSession` | smallest event-family growth (4 receiver events, 0 source events); mode-B authors get a callback hook |

## 4. Architecture overview

Two participating roles connected by a session:

```
┌────────────────────────┐         ┌────────────────────────┐
│  Source Visual         │         │  Receiver Visual       │
│  AllowDrop=false       │         │  AllowDrop=true        │
│  IsDraggable=true OR   │         │                        │
│  imperative call       │         │  Handles DragEnter,    │
│                        │         │  DragOver, DragLeave,  │
│  OnDragStart →         │         │  Drop                  │
│    DataObject          │         │                        │
│    DragDropEffects     │         │  Style triggers on     │
└────────┬───────────────┘         │  IsDragOver            │
         │                         └────────┬───────────────┘
         │ DragDrop.DoDragDrop(...)         │
         │                                  │ DragEnter/Over/
         ▼                                  │ Leave/Drop +
┌────────────────────────────────────┐      │ IsDragOver writes
│  DragSession                       ◄──────┘
│  ────────────                      │
│  • holds DataObject, allowedEffects│   ┌─────────────────────────┐
│  • PromiseLike<DragDropEffects>    │   │  InputManager           │
│  • OnMove((x,y) => void)           ├──▶│  • _dragSession field   │
│  • Cancel()                        │   │  • intercepts pointer   │
└────────────────┬───────────────────┘   │    events while active  │
                 │                       │  • hit-tests receivers  │
                 ▼                       │  • fires routed events  │
┌────────────────────────────────────┐   │  • drives overlay       │
│  DragOverlay (per HtmlTarget)      ◄───┤                         │
│  • <g class="mural-drag-overlay">  │   │                         │
│  • A: SVG clone of source          │   └─────────────────────────┘
│  • B: nothing                      │
│  • C: DataTemplate.Apply(data)     │
└────────────────────────────────────┘
```

### Lifecycle, in order

1. **Initiation.**
   - **Imperative:** an author's `PointerDown`/`PointerMove` handler calls `args.BeginDragDrop(data, allowedEffects, opts?)` (or the static `DragDrop.DoDragDrop(source, data, effects, opts?)`).
   - **Declarative:** the framework's internal `PointerDown` latch (attached automatically when `IsDraggable=true`) tracks position; on each subsequent `PointerMove`, if movement exceeded `DragDrop.DragThreshold` (default 4 px), it calls `OnDragStart(source)`, receives `{ data, effects }`, and invokes the imperative primitive. If `OnDragStart` returns `null`, no drag — pointer events fall through normally.
2. **Session entry.** `DragSession` is constructed; `InputManager._dragSession` is set; the host's `pointermove`/`pointerup`/`pointercancel` are intercepted before the routed-event walker runs.
3. **Preview attach.** Per `opts.preview`:
   - **A (`undefined`):** snapshot the source's rendered SVG subtree, deep-clone the nodes, wrap in `<g class="mural-drag-ghost" opacity="0.6">`, attach to `DragOverlay`.
   - **B (`null`):** nothing.
   - **C (`DataTemplate`):** `template.Apply(data)`; the produced Visual has `DataContext = data`; the SVG it renders is attached to `DragOverlay`.
4. **Cursor sampling (per move).**
   1. Hit-test the deepest Visual under `(HostX, HostY)` that has `AllowDrop=true`.
   2. If receiver changed:
      - Old receiver: fire `DragLeave` (bubble + tunnel through the dispatcher), set its `IsDragOver = false`.
      - New receiver (if any): fire `DragEnter`, set `IsDragOver = true`.
   3. Fire `DragOver` on the current receiver. Receiver may set `args.Effect` to a subset of `args.AllowedEffects` (default `None`).
   4. Update `host.style.cursor` based on the receiver's `Effect`:
      - `None` → `not-allowed` (or `default` when no receiver)
      - `Copy` → `copy`
      - `Move` → `move`
      - `Link` → `alias`
   5. Re-position the preview overlay at the cursor (modes A and C).
   6. Fire `OnMove(hostX, hostY)` to subscribers (mode B).
5. **Pointer up.**
   - If a current receiver and its last `args.Effect !== None`: fire `Drop` on it; resolve session with that effect.
   - Otherwise: resolve session with `None`. No `Drop` fires.
6. **End-of-session cleanup.**
   1. Detach preview from `DragOverlay`; restore `host.style.cursor`.
   2. Detach all `OnMove` subscribers.
   3. Set last receiver's `IsDragOver = false` (defensive — `DragLeave` should have done it on cursor exit, but if we end ON a receiver, this still fires).
   4. Clear `_dragSession`; raw pointer events route normally again.
   5. Resolve the `PromiseLike` with the final `DragDropEffects`.

### Cancellation

All cancellation paths converge on step 6 above with `DragDropEffects.None`, after firing `DragLeave` on the current receiver:

- ESC key during the drag (a global key listener installed on the host while a session is active).
- Window blur (the host's `blur` event).
- OS `pointercancel`.
- Programmatic `session.Cancel()`.

The `PromiseLike` resolves with `None`. There is no separate "canceled" status — `effect === None` means either "dropped on nothing" or "explicitly canceled"; the source rarely cares which.

## 5. Public API

### Runtime additions

`src/runtime/drag-drop.ts` — new module:

```ts
export enum DragDropEffects {
    None = 0,
    Copy = 1,
    Move = 2,
    Link = 4,
    All  = Copy | Move | Link,
}

export class DataObject {
    constructor();
    Set(format: string, data: unknown): this;
    Get<T = unknown>(format: string): T | undefined;
    Has(format: string): boolean;
    Formats(): readonly string[];
}

export type DragPreviewKind =
    | undefined        // mode A: framework default translucent clone
    | null             // mode B: no preview
    | DataTemplate;    // mode C: instantiated against the DataObject

export interface DragDropOptions {
    preview?: DragPreviewKind;
}

export class DragSession implements PromiseLike<DragDropEffects> {
    readonly Source: Visual;
    readonly Data:   DataObject;
    readonly AllowedEffects: DragDropEffects;
    /** Subscribe to per-cursor-sample updates while the session runs.
     *  Returns an unsubscribe function; the session also disposes all
     *  subscribers on completion. */
    OnMove(cb: (hostX: number, hostY: number) => void): () => void;
    Cancel(): void;
    then<R1, R2>(
        onfulfilled?: (e: DragDropEffects) => R1 | PromiseLike<R1>,
        onrejected?:  (r: unknown) => R2 | PromiseLike<R2>,
    ): PromiseLike<R1 | R2>;
}

export class DragDrop {
    static DragThreshold: number;  // pixels; default 4
    static DoDragDrop(
        source: Visual,
        data: DataObject,
        allowedEffects: DragDropEffects,
        opts?: DragDropOptions,
    ): DragSession;
}
```

`src/runtime/routed-event.ts` — extensions:

```ts
// Extended:
export type RoutedEventKind =
    | 'PointerEnter' | 'PointerLeave' | 'PointerMove' | 'PointerDown' | 'PointerUp' | 'PointerWheel'
    | 'KeyDown' | 'KeyUp' | 'TextInput' | 'GotFocus' | 'LostFocus'
    | 'DragEnter' | 'DragLeave' | 'DragOver' | 'Drop';

// New:
export class DragEventArgs extends RoutedEventArgs {
    readonly HostX:          number;
    readonly HostY:          number;
    readonly Modifiers:      ModifierKeys;
    readonly Data:           DataObject;
    readonly AllowedEffects: DragDropEffects;
    Effect: DragDropEffects;  // receiver writes during DragOver
}
```

`src/runtime/visual.ts` — new DPs:

```ts
public static readonly AllowDropKey = Model.RegisterProperty<boolean>(
    Visual, 'AllowDrop', false, MetaData.None);
public static readonly IsDragOverKey = Model.RegisterProperty<boolean>(
    Visual, 'IsDragOver', false, MetaData.None);
public static readonly IsDraggableKey = Model.RegisterProperty<boolean>(
    Visual, 'IsDraggable', false, MetaData.None);
public static readonly OnDragStartKey = Model.RegisterProperty<
    ((source: Visual) =>
        { data: DataObject; effects: DragDropEffects; preview?: DragPreviewKind }
        | null
    ) | undefined
>(Visual, 'OnDragStart', undefined, MetaData.None);
```

`src/runtime/routed-event.ts` — extension to `PointerEventArgs`:

```ts
public BeginDragDrop(
    data: DataObject,
    allowedEffects: DragDropEffects,
    opts?: DragDropOptions,
): DragSession;   // sugar for DragDrop.DoDragDrop(this.Source, data, effects, opts)
```

### Authoring shapes

**Declarative source (the toolbox tile and the diagram node):**

```mu
Border [IsDraggable=true, OnDragStart=$buildDragData, …]
```

```js
// On the bound VM:
buildDragData(source) {
    return {
        data:    new DataObject().Set('@pragmatic-lab/mural/node-kind', this.Kind),
        effects: DragDropEffects.Copy,
    };
}
```

**Declarative receiver (the diagram canvas):**

```mu
ItemsControl x:name="canvas" [AllowDrop=true, …]
```

```js
canvas.AddRoutedEventListener('DragOver', (a) => {
    a.Effect = a.Data.Has('@pragmatic-lab/mural/node-kind')
        ? DragDropEffects.Copy
        : DragDropEffects.None;
});
canvas.AddRoutedEventListener('Drop', (a) => {
    const kind = a.Data.Get('@pragmatic-lab/mural/node-kind');
    const p = canvasLocal(a);
    this.addNode(kind, p.x - NODE_W/2, p.y - NODE_H/2);
});
```

**Imperative source with mode-B preview (the port wire):**

```js
port.AddRoutedEventListener('PointerDown', (args) => {
    const session = args.BeginDragDrop(
        new DataObject().Set('@pragmatic-lab/mural/port', { nodeId: node.Id, side: i }),
        DragDropEffects.Link,
        { preview: null },
    );
    const ghost = new Line(); /* style */ canvas.AddChild(ghost);
    ghost.X1 = positions[i].x; ghost.Y1 = positions[i].y;
    session.OnMove((x, y) => {
        const p = canvasLocalFromHost(x, y);
        ghost.X2 = p.x; ghost.Y2 = p.y;
    });
    session.then(() => canvas.RemoveChild(ghost));
});
```

**Style-driven drop highlight:**

```mu
Style x:key="DropZone" [targettype=Border] {
    Background = #ffffff;
    when( IsDragOver ){ Background = #fef3c7; BorderBrush = #f59e0b; }
}
```

## 6. Internal mechanics

### `InputManager` changes

A new private field `_dragSession: DragSession | null`. When non-null:

- The host's `pointermove` listener short-circuits the normal routed-event dispatch and routes the event to `DragSession#drive(hostX, hostY)`, which runs the cursor-sampling step.
- The host's `pointerup` listener routes to `DragSession#dropOrCancel(hostX, hostY)`, which completes the session.
- The host's `pointercancel` listener routes to `DragSession#cancel('pointercancel')`.
- A `keydown` listener filters for `Escape` and routes to `DragSession#cancel('escape')`.
- A `blur` listener routes to `DragSession#cancel('blur')`.

All four listeners are installed when the session enters and removed in cleanup. The existing pointer-capture mechanism is suspended for the duration; the session is the de-facto capture.

### Receiver hit-testing

The renderer (`SvgRenderer`) already stamps every outer `<g class="mural-visual">` with a `VISUAL_BACKREF` symbol pointing at the owning `Visual`. The drag session reuses the same hit-test path the routed pointer dispatcher already uses — either the original `pointermove` event's `composedPath()` while the session is driven from a real DOM event, or `document.elementsFromPoint(hostX, hostY)` as a fallback for synthesized samples — and for each element on the chain climbs to the nearest `g.mural-visual`, recovers the `Visual` via the backref, and inspects `AllowDrop`. The first `AllowDrop=true` Visual wins. The only difference from the existing pointer hit-test is the `AllowDrop` gate; the lookup machinery is shared.

### `DragOverlay` mechanics (modes A and C)

A new `<g class="mural-drag-overlay">` element appended once per `HtmlTarget` lifetime, painted after the main scene. Has `pointer-events="none"` so it never blocks receiver hit-testing.

- **Mode A** snapshot: `outerSvg.cloneNode(true)` on the source's outer `<g>`. The clone is appended to `mural-drag-overlay`, given `opacity="0.6"`, and translated each move via `transform="translate(hostX - sourceX, hostY - sourceY)"`.
- **Mode C** apply: `template.Apply(data)` returns a Visual; we run `Measure`/`Arrange` on it in isolation (Size `Infinity`, then Arrange to its `DesiredSize`); the produced SVG is appended to the overlay; transform is `translate(hostX, hostY)`.

Removed on session end with `overlay.removeChild(node)`.

### Cursor styling

`InputManager` holds `_originalCursor: string | null`. On session entry, captures `host.style.cursor`. On every cursor sample, writes the per-effect cursor. On cleanup, restores the original value.

### Event dispatch

`DragEnter` / `DragLeave` / `DragOver` / `Drop` go through the existing routed-event walker — `tunnel` pass top-down, then `bubble` pass bottom-up. The dispatcher tables in `routed-event.ts` grow four new slots; `DragEventArgs` is the constructor for all four.

### Declarative threshold latch

When `IsDraggable=true`, `Visual` adds an internal `PointerDown` handler that:

1. Stores `(downX, downY, pointerId)` on the Visual.
2. Adds a one-shot `PointerMove` handler that fires only while pressed:
   - If `Math.hypot(moveX - downX, moveY - downY) >= DragDrop.DragThreshold`:
     - Calls `OnDragStart(this)`. If returns `null`, detaches the move handler (no drag); pointer events flow normally.
     - If returns `{ data, effects, preview? }`: invokes `DragDrop.DoDragDrop(this, data, effects, { preview })`. Detaches.
3. On `PointerUp`, detaches the move handler (no drag was reached).

The framework provides no built-in equivalent of WPF's `Thumb` event — authors who want pre-threshold callbacks reach for the imperative API.

## 7. Diagram-demo migration

The three gestures retire:

**Toolbox tile → canvas.** Toolbox tile template gets `[IsDraggable=true, OnDragStart=$tileDragData]`. `ToolboxShapeVM` adds the `tileDragData` method. Canvas gets `AllowDrop=true`. `DiagramVM.OnViewMounted` adds two routed-event listeners (`DragOver`, `Drop`) on the canvas. The imperative `create` branch of the `gesture` state machine in `DiagramVM` is removed (~30 lines).

**Node body → move within canvas.** Each node container gets `[IsDraggable=true, OnDragStart=$nodeMoveDragData]` via the node DataTemplate. The canvas's `Drop` handler dispatches on the format key: `mural/node-kind` (toolbox) vs `mural/node-move` (existing node). For move, it reads the source NodeVM identity from the DataObject and mutates `node.X/Y`. The `move` branch of the gesture state machine is removed (~25 lines).

**Port → port (port wire).** Each port keeps an imperative `PointerDown` handler that calls `args.BeginDragDrop(data, Link, { preview: null })`. The handler hooks `session.OnMove` for the ghost line update, and `session.then` for cleanup. Other nodes' containers get a `Drop` handler that reads the `mural/port` format and creates the `EdgeVM`. The `connect` branch of the gesture state machine is removed (~40 lines).

**Net effect on `DiagramVM`:** the centralized `gesture: { kind, … } | null` state is removed; `selectedNode` selection still rides on the canvas's `PointerDown`; the canvas's `PointerMove`/`PointerUp` handlers shrink to ~10 lines covering only the selection-clearing case.

## 8. Testing strategy

`src/runtime/tests/drag-drop.test.ts` — new test file. Mirrors the pattern in `input.test.ts`: a JSDOM host, synthetic pointer events scripted into `InputManager`, assertions on receiver-side routed events and session resolution.

Coverage targets:

- `DataObject` formats map: set / get / has / formats enumeration.
- Declarative source: 4px threshold honored; `OnDragStart` returning `null` does not start a session.
- Imperative source: `DoDragDrop` enters session immediately; the synchronous return is a usable `DragSession`.
- Receiver events fire in order: `DragEnter` once per receiver entry; `DragOver` per move; `DragLeave` on exit; `Drop` on up while a receiver had `Effect !== None`.
- `IsDragOver` DP writes paired with Enter/Leave.
- Source visiting two receivers in sequence fires `DragLeave` on the first before `DragEnter` on the second; never both `IsDragOver=true` at once.
- Effects: receiver writing `Effect = None` in `DragOver` causes pointer-up to NOT fire `Drop`; session resolves `None`.
- Cancellation: ESC during drag fires `DragLeave` (if over a receiver) and resolves `None`; window blur does the same; `session.Cancel()` does the same.
- `OnMove` callbacks fire each move sample with current `(hostX, hostY)`; unsubscribed callbacks stop firing.
- Preview modes: mode A appends a clone to the overlay; mode B leaves overlay empty; mode C runs the supplied `DataTemplate` and appends the produced SVG.
- Cursor styling: `host.style.cursor` switches to `copy` / `move` / `link` / `not-allowed` based on receiver `Effect`; restored on session end.
- Multi-test isolation: each test creates a fresh JSDOM host and verifies the dispatcher tables don't leak between sessions.

The diagram smoke test (`tooling/vscode/` already has the pattern) is extended to:

1. Materialize the new declarative source/receiver wiring.
2. Synthesize a drag from a toolbox tile to the canvas.
3. Assert a new `NodeVM` appears in `DiagramVM.Nodes`.

Approximately 25 new unit tests; expect total suite to remain green at ~1145.

## 9. Module placement

| File | Change |
|---|---|
| `src/runtime/drag-drop.ts` | NEW. `DragDrop`, `DragSession`, `DataObject`, `DragDropEffects`, `DragPreviewKind`, `DragDropOptions`. |
| `src/runtime/routed-event.ts` | Extend `RoutedEventKind` with `DragEnter`/`DragLeave`/`DragOver`/`Drop`. Add `DragEventArgs`. Add `PointerEventArgs.BeginDragDrop` method. |
| `src/runtime/visual.ts` | Add `AllowDrop`, `IsDragOver`, `IsDraggable`, `OnDragStart` DPs. Add the declarative `IsDraggable` threshold latch in the property-changed hook. |
| `src/runtime/input-manager.ts` | Add `_dragSession` field. Intercept pointer/key/blur events when a session is active. Drive `DragSession#drive` / `#dropOrCancel` / `#cancel`. |
| `src/visual-engine/targets/html-target.ts` | Add the `mural-drag-overlay` `<g>` element and a `DragOverlay` accessor; expose cursor-style write hook. |
| `src/runtime/index.ts` | Re-export the new public symbols. |
| `src/compiler/symbol-table.ts` | Add `DataObject`, `DragDropEffects` to the LSP / `.mu` symbol table so authors get IntelliSense on the new types in setter values. |
| `demo/demos/diagram/diagram-vm.mjs` | Retire the `gesture` state machine; rewrite toolbox-tile / node-move / port-wire as declarative source + receiver handlers per § 7. |
| `demo/demos/diagram/diagram.mu` | Add `[IsDraggable=true, OnDragStart=…]` on tile + node templates; add `AllowDrop=true` on the canvas. |
| `current-backlog.md` | Already updated with § 8 (v2 follow-ups). |

## 10. Risks and open questions

- **SVG clone snapshot (mode A) fidelity.** The clone is a flat DOM copy. If the source has running animations or unresolved bindings, the snapshot captures the post-render state, which is what we want — but a Visual whose `RenderOverride` reads context-dependent state (theme color resolved at render time, e.g.) may render once at clone time and not update. v1 accepts this; the recommendation in the API doc is "use mode C for state-sensitive previews."
- **Hit-test cost on every move sample.** `document.elementsFromPoint` is O(layers under the cursor). For deeply nested scenes this could spike. v1 measures it as part of the diagram demo smoke test; if a problem surfaces, the optimization is to cache the last-hit receiver and validate it still contains the cursor before re-hitting.
- **Receiver Visual is destroyed mid-drag.** If a `DragOver` handler mutates the tree such that the current receiver is detached, the next move sample will not find it. The session should detect "current receiver no longer in the visual tree" (cheap via `Visual.IsInTree` or equivalent) and treat the next sample as a receiver-change → fires `DragLeave` (defensively), then re-hit-tests.
- **Pointer capture interaction.** If a handler at `PointerDown` time captured the pointer (via `args.CapturePointer(...)`), and the same handler calls `BeginDragDrop`, the capture is released by the session and re-acquired by the InputManager-level interception. The session is the de-facto capture; explicit release on session-end restores nothing (the original capture was a deliberate user choice that's been superseded). Documented in the API doc as "calling BeginDragDrop subsumes any pre-existing capture."
- **Programmatic `DataTemplate` rendering for mode C.** v1 renders the template's produced Visual by running `Measure(Infinity, Infinity)` then `Arrange(DesiredSize)`. If the template depends on its parent's available size (e.g., a Visual whose `MeasureOverride` reads the constraint), the result may differ from the in-tree render. Mode C consumers are advised to size their template explicitly.
- **`IsDragOver` and Style-trigger tier.** The `IsDragOver` writes happen at LocalValue priority (it's a framework-written DP, not a binding). Style triggers `when($IsDragOver)` fire at the Trigger tier. Receivers can override `IsDragOver` for testing via direct write; this is harmless but worth noting.

## 11. Implementation order (informative)

Sequenced so each layer is testable before the next is built:

1. `DragDropEffects` enum, `DataObject` class, `DragEventArgs` class. Standalone, pure data.
2. `RoutedEventKind` extension; dispatcher table slots; `Visual.AllowDrop` / `IsDragOver` DPs. Receivers can be wired but no source exists yet — visible via `DragEnter`/`Over`/`Leave`/`Drop` listeners; sessions tested by manually constructing `DragEventArgs` and calling `Visual.dispatch`.
3. `DragSession` class + `DragDrop.DoDragDrop` (no preview, no `InputManager` integration yet). Session is a standalone object whose `OnMove`/`Cancel` work; pointer events not yet intercepted.
4. `InputManager._dragSession` interception + cursor-sampling loop. Now a real session drives receiver events end-to-end via synthetic pointer events.
5. `DragOverlay` + mode-A SVG clone (the easy default).
6. Mode-C `DataTemplate` preview.
7. Cursor-style writes.
8. ESC / blur / pointercancel cancellation paths.
9. `Visual.IsDraggable` / `OnDragStart` DPs + declarative threshold latch.
10. `PointerEventArgs.BeginDragDrop` sugar.
11. Diagram demo migration (the proof point).

Each step lands tests that pin its behavior; the suite stays green between steps.
