# Current Backlog

Open gaps in the property/binding/control system compared to WPF. Closed items moved to [completed-backlog.md](completed-backlog.md) — section numbers preserved across both files so cross-references survive.

**Status:** Property / binding / inheritance / layout / render pipeline is feature-complete for WPF parity; the concrete-control roster covers Border, Grid (with shared-size groups), StackPanel, DockPanel, Canvas, UniformGrid, VirtualizingStackPanel, Button, TextBlock, TextBox, ComboBox, ListBox, TreeView, Slider, SpinEdit, ScrollBar, ScrollViewer, ContentControl, ItemsControl, ControlTemplate, DataTemplate, Drawer, PageView, Diagram, and shapes (Ellipse, Line). 5.3 `Dispatcher` / thread affinity dropped — N/A for single-threaded JS. Test suite: 1278 tests passing.

## 2. Change notification

2.4. **No `INotifyCollectionChanged` integration.** Arrays in paths (`managers[2]`) don't notify when elements are added/removed/replaced. Bindings only re-resolve when *Models* in the chain change.

## 3. Binding ergonomics

3.5. **No `ValidationRules`.** Values can't be rejected.

3.6. **No `MultiBinding` / `PriorityBinding`.** Combining multiple sources.

3.7. **No `RelativeSource` / `ElementName`.** Bindings always take a literal `source` object, no way to express "ancestor of type X" or "named element Y".

## 4. Property metadata

4.2. **No `ValidateValueCallback`.** Coerce can normalize, but there's no "reject this value" hook.

4.4. **No `IsAnimationProhibited` / `IsNotDataBindable`.** Fine-grained per-property opt-outs.

## 5. Architectural gaps

5.2. **No `Freezable` / immutability.** Useful for shareable value-type-like Models (Brushes, Geometries).

5.6. **Missing WPF-roster panels.** `StackPanel`, `Canvas`, `DockPanel`, `VirtualizingStackPanel`, `Grid` (with `SharedSizeGroup` + `Row`/`Column`/`RowSpan`/`ColumnSpan` attached props) and `UniformGrid` are in. Only one common WPF panel is still missing:

  - **`WrapPanel`** — flows children along a primary axis, wrapping to the next row/column on overflow. Measure pass: sum child desired sizes along the primary axis, break to a new row when the accumulator exceeds `availableSize`. Arrange pass: per-row, primary-axis position = running sum; cross-axis position = row-start. `Orientation=Horizontal/Vertical` DP. Useful as an `ItemsPanel` for tag clouds, swatches, palette grids.

  Pure layout panel — no chrome, no triggers. Plugs into the existing `ItemsControl.ItemsPanel` slot the same way `StackPanel` does today.

5.7. **`mural-hit` pad opt-out for non-interactive Visuals.** Today `SvgRenderer` emits an invisible `<rect class="mural-hit" fill="none" pointer-events="all" .../>` inside every Visual's outer `<g>`, sized to its `ArrangedRect`. The pad exists so pointer events register on the whitespace between painted descendants (a TreeView row's gaps between chevron and label glyphs would otherwise fall through under SVG's default `visiblePainted`). One pad per Visual ≈ half the `<rect>` count in any non-trivial scene (~280 of the 633 rects in the tree-view demo, ~28 KB of attributes for a 108 KB dump). For most Visuals the pad is dead weight — purely decorative `TextBlock`s, `Border`s, layout panels, etc. never get a routed-event listener and never appear in an `IsMouseOver`/`IsPressed`/`IsFocused` trigger. The pad is only load-bearing for Visuals that: (a) have a per-instance routed-event listener (`AddPointerDownListener` etc.), (b) appear as the watched target in a `PropertyTrigger` over `IsMouseOver`/`IsPressed`/`IsFocused`, (c) have `Focusable=true`, or (d) override an input virtual (`OnPointerDown`, …). The renderer doesn't currently know any of those criteria. Two viable shapes for the opt-out: an `interactive` bit on Visual that subclasses opt into (cheap, explicit, requires touching every interactive control); or a renderer-side derivation that walks the listener Maps + Style triggers when materializing the outer `<g>` (no control-side change, but couples the renderer to the routed-event + style internals). Either way, the pad still gets re-emitted at the moment a Visual transitions from non-interactive to interactive (new listener added at runtime, Focusable flipped, a trigger installed via Style.OverrideMetadata on a descendant class). Pairs naturally with the existing "lazy-attach `mural-own`" optimization — together they could plausibly halve the steady-state SVG size for layout-heavy demos.

## 6. Path parser

6.2. **No type-qualified indexers.** WPF supports `[(sys:Int32)0]` to disambiguate indexer overloads. Probably fine to skip for JS.

---

## 7. Suggested priority order (next pass)

What's left, ordered by impact-per-effort:

7.2. **`INotifyCollectionChanged` integration.** (Closes 2.4.) Required for collection bindings (Items / ItemSource patterns). Arrays in paths (`managers[2]`) don't notify when elements are added/removed/replaced. Bigger lift — needs an `ObservableArray` or `Proxy`-based wrapper plus `PropertyPath` integration. ~80 lines + meaningful tests.

### Smaller wins that have no dependencies

These each take an hour or two and round out the WPF parity:

- **3.5 `ValidationRules`** — value rejection at the binding boundary.
- **3.6 `MultiBinding`** — combine multiple source paths into one resolved value.
- **3.7 `RelativeSource` / `ElementName`** — named-element registry + ancestor lookup.
- **4.2 `ValidateValueCallback`** — boolean-returning hook in `PropertyMetadata`. Tiny.

## 8. Drag & drop (v2 follow-ups)

The v1 design (`docs/superpowers/specs/2026-06-04-drag-and-drop-design.md`) lands a WPF-parity routed-event drag/drop subsystem — `AllowDrop` / `IsDragOver` DPs, `DragEnter`/`Over`/`Leave`/`Drop` routed events, `DataObject` formats map, `DragDropEffects`, imperative `DragDrop.DoDragDrop` + declarative `IsDraggable` / `OnDragStart` sugar, and three preview modes (framework ghost / null / DataTemplate). These items are intentionally out of scope for v1 and are listed here as concrete follow-ups so the design isn't load-bearing for them.

8.1. **OS-level file drops.** Wire the host (`HtmlTarget`) into the browser's HTML5 DragEvent surface (`dragenter`/`dragover`/`drop` on the host element). Synthesize a `DragSession` from the external session, populating `DataObject` with browser-standard MIME formats (`text/plain`, `text/uri-list`, `Files`). Receivers reuse the same `AllowDrop` DP and `DragEnter`/`Over`/`Drop` handlers. The source side has no equivalent (the source lives outside the app); `DragSession.Source` is `undefined` for OS-initiated drags. Two implementation concerns: the browser's drag image is fixed by the OS (no opt-out for mode A), and the drag session is driven by the browser's pump (no `OnMove` callback for mode B). Pairs with future XAML-style URI / file accept handling.

8.2. **Multi-pointer drags.** v1 assumes one drag session at a time; a second `pointerdown` during a session is ignored. Lifting this means promoting `_dragSession` from `DragSession | null` to a `Map<pointerId, DragSession>` and tracking per-pointer cursor state. Useful for touch/pen multi-finger composition scenarios; not worth the bookkeeping until a concrete demo asks for it.

8.3. **`GiveFeedback` / `QueryContinueDrag` source-side hooks.** WPF fires these on the source so authors can change the cursor based on the receiver's chosen effect and abort the drag from keyboard state. v1 covers the cursor case via the framework's automatic `host.style.cursor` writes; the source-side feedback hook would let authors customize per-receiver-effect (e.g., a custom drag image swap when over a "delete" zone). The `QueryContinueDrag` hook would let the source cancel based on modifier-key state (`Shift` held → cancel). Both layer cleanly on the v1 `DragSession`: add `OnFeedback((effect) => void)` and `OnContinueQuery(() => boolean)` callbacks, fired on every move sample. Sequencing against `OnMove` becomes the design decision.

8.4. **Auto-scroll near edges of `ScrollViewer` during drag.** When a drag's cursor approaches the edge of a `ScrollViewer`'s viewport, the scroll viewer auto-scrolls in that direction (continuous, accelerating toward the edge). Standard UX in Visio / Figma / drawio for dragging items near the canvas boundary. Implementation: a `DragSession.OnMove` listener installed by `ScrollViewer` when it sees a drag enter; ticks a timer that nudges `Offset` while the cursor stays within the "edge gutter" (~24px). Cleans up on `DragLeave` and on session resolve. Doesn't need framework changes; lives entirely inside `ScrollViewer`. Could ship the same day as v1 + first edge-case bugfixes, but listed here because it's a control-specific enhancement rather than framework parity.

8.5. **Adorner-style drop position indicators inside `ItemsControl` (drag-to-reorder).** The data-side reorder helper is in (`src/Controls/list-reorder-behavior.ts` — wires `AllowDrop`, shows the Move effect, computes the insertion index from container midpoints, and mutates the underlying `Items` collection on drop). Still missing: the visual insertion-line indicator. Per the behavior's own docstring, the visual is explicitly NOT handled — consumers wanting one currently attach a sibling behavior that listens on the same `DragOver` and draws into the canvas. To close this item: lift the indicator into the framework as an adorner-layer overlay (`<line>` between the two containers the cursor sits between), driven by the same insertion-index math the behavior already does.

## 9. Declarative behaviors in markup

9.2. **Triggered Behavior attach.** Out of v9.1 scope but worth pinning here so the design doesn't paint itself into a corner: WPF's `Interaction.Triggers` can carry behavior attaches conditionally (e.g., attach a behavior only while a DataTrigger condition is true). Won't matter until a concrete demo needs it; the v9.1 collection shape should leave room for a future `Triggers { DataTrigger { …, Behaviors { X } } }` extension without restructuring the registry.
