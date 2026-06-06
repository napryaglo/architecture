# Current Backlog

Open gaps in the property/binding/control system compared to WPF. Closed items moved to [completed-backlog.md](completed-backlog.md) — section numbers preserved across both files so cross-references survive.

**Status:** Property / binding / inheritance / layout / render pipeline is feature-complete for WPF parity; the concrete-control roster covers Border, Grid (with shared-size groups), StackPanel, WrapPanel, DockPanel, Canvas, UniformGrid, VirtualizingStackPanel, Button, TextBlock, TextBox, ComboBox, ListBox, TreeView, Slider, SpinEdit, ScrollBar, ScrollViewer, ContentControl, ItemsControl, ControlTemplate, DataTemplate, Drawer, PageView, Diagram, and shapes (Ellipse, Line). 5.3 `Dispatcher` / thread affinity dropped — N/A for single-threaded JS. Test suite: 1353 tests passing.

## 5. Architectural gaps

5.2. **No `Freezable` / immutability.** Useful for shareable value-type-like Models (Brushes, Geometries).

5.7. **`mural-hit` pad opt-out for non-interactive Visuals.** Today `SvgRenderer` emits an invisible `<rect class="mural-hit" fill="none" pointer-events="all" .../>` inside every Visual's outer `<g>`, sized to its `ArrangedRect`. The pad exists so pointer events register on the whitespace between painted descendants (a TreeView row's gaps between chevron and label glyphs would otherwise fall through under SVG's default `visiblePainted`). One pad per Visual ≈ half the `<rect>` count in any non-trivial scene (~280 of the 633 rects in the tree-view demo, ~28 KB of attributes for a 108 KB dump). For most Visuals the pad is dead weight — purely decorative `TextBlock`s, `Border`s, layout panels, etc. never get a routed-event listener and never appear in an `IsMouseOver`/`IsPressed`/`IsFocused` trigger. The pad is only load-bearing for Visuals that: (a) have a per-instance routed-event listener (`AddPointerDownListener` etc.), (b) appear as the watched target in a `PropertyTrigger` over `IsMouseOver`/`IsPressed`/`IsFocused`, (c) have `Focusable=true`, or (d) override an input virtual (`OnPointerDown`, …). The renderer doesn't currently know any of those criteria. Two viable shapes for the opt-out: an `interactive` bit on Visual that subclasses opt into (cheap, explicit, requires touching every interactive control); or a renderer-side derivation that walks the listener Maps + Style triggers when materializing the outer `<g>` (no control-side change, but couples the renderer to the routed-event + style internals). Either way, the pad still gets re-emitted at the moment a Visual transitions from non-interactive to interactive (new listener added at runtime, Focusable flipped, a trigger installed via Style.OverrideMetadata on a descendant class). Pairs naturally with the existing "lazy-attach `mural-own`" optimization — together they could plausibly halve the steady-state SVG size for layout-heavy demos.

5.8. **No proper `Adorner` abstraction — manual host-coord math leaks into consumers.** The framework has one [`OverlayLayer`](src/visual-engine/overlay-layer.ts) per `PresentationTarget` — a plain `Panel` that paints above Content and gives every child a full-surface arrange slot. (Now that `ScrollViewer` is templated and ships a [`ScrollContentPresenter`](src/Controls/scroll-content-presenter.ts) part, the structural prerequisite for an *inner* `AdornerLayer` exists: an `AdornerDecorator` could wrap the SCP's child without any further refactor of consumer controls.) Consumers that want to position something **relative to an adorned element** (insertion-line indicators, resize handles, selection rectangles, validation badges) currently walk the parent chain themselves to compute host coordinates and either wrap their visual in a `Canvas` (`ListReorderBehavior`'s current hack) or override `ArrangeOverride` in a bespoke Panel subclass (`ComboBoxPopupHost`). There's no `AdornedElement` coupling, no `GetAdornerLayer(visual)` discovery, and no "scrolls with content" semantics.

  **WPF reference.** Three classes form the architecture:
  - `Adorner` — abstract `FrameworkElement` bound to a `UIElement` at construction. Override `OnRender(DrawingContext)` to paint; optionally `GetDesiredTransform(elementTransform)` to translate.
  - `AdornerLayer` — Panel-like surface. Always on top within its visual-tree subtree. Static `GetAdornerLayer(uiElement)` walks UP to find the nearest one.
  - `AdornerDecorator` — `Decorator` that materializes an `AdornerLayer` in the visual tree. Window template carries one; `ScrollContentPresenter` carries one (so adorners scroll with content). Adorners attached to the inner layer inherit the scroll transform automatically because they're descendants of the scrolled subtree.

  **Proposed shape for mural (v1 — additive, low risk).**

  - **`Adorner extends Single`** — single-child container holding `AdornedElement: Visual | undefined` + `Offset: Point` DPs. `ArrangeOverride` computes the adorned element's host-relative rect via parent-walk, calls a subclass hook `ComputeAdornerRect(adornedHostRect): Rect`, and arranges its child there. Subclasses encode the geometry: `BoundsAdorner` (matches the rect), `InsertionAdorner` (centered on an edge — `Side: 'before' | 'after'`, `Thickness: number`), future `HandlesAdorner` (corner grips).
  - **`AdornerLayer` (new class, sibling to `OverlayLayer`)** — Panel-like surface with `Add(adorner: Adorner)` / `Remove(adorner: Adorner)` and a `static GetAdornerLayer(visual): AdornerLayer | undefined` that walks up looking for any ancestor exposing an `AdornerLayer` property (duck-typed to avoid a runtime → Controls dependency). Layers are placed by wrapping a subtree in an `AdornerDecorator`. The existing host-root `OverlayLayer` stays in place for imperative scrim / popup hosting (`PresentationTarget.AttachOverlay`, used by `ComboBox` dropdown and `Drawer` — they don't need adorned-element semantics). Originally framed as a rename; landed as an additive sibling so the imperative overlay path didn't need to grow adorned-element machinery.
  - **Migration.** `ListReorderBehavior.updateInsertionAdorner` collapses from ~30 lines of `hostTop` / `hostLeft` / `Canvas.SetTop` bookkeeping to: instantiate `InsertionAdorner`, set `Child = template.Apply(host)`, set `AdornedElement = containers[insertionIndex]`, `AdornerLayer.For(host).Add(adorner)`. On move, just update `AdornedElement`.

  **Why multiple layers matter — the core idea.** The win in WPF's design isn't that there are MULTIPLE layers; it's that each layer's POSITION IN THE VISUAL TREE determines what transforms apply to the adorners painted on it. An `AdornerLayer` lives INSIDE the regular visual tree (via an `AdornerDecorator` wrapper). Whatever transforms its ancestors apply — scroll offsets, rotations, scaling, opacity, clips — also apply to the adorners painted on that layer. Place a layer inside a scrolled subtree → adorners scroll with the content. Place a layer at the window root → adorners stay anchored to screen coords while content moves under them. The "scrolls with content" feature is structural; the framework doesn't need explicit "follow this scroll offset" code anywhere.

  The two questions a layer placement answers:

  - **Does the adorner move when its anchor moves?** If the anchor moves with scrolled content → inner layer (inside ScrollViewer). If the anchor is the cursor / window viewport / a fixed corner → outer (window-root) layer. If the anchor is inside a rotated or zoomed canvas (e.g., a Diagram) → inside that transform.
  - **Should the adorner be clipped by its container?** Layers inherit their ancestors' clip. An adorner inside a 100×100 clipped Border can't paint outside it, even if the geometry would extend beyond. Tooltips and dropdowns escape their host's clip by living at the outer layer.

  Practical examples that want the INNER (scrolls-with-content) layer:

  - **Insertion-line indicator** (the 8.5 case). When `ScrollViewer`'s auto-scroll fires and pulls the list up, the blue line should ride along with the items so it keeps pointing at the gap between the right two rows. Today's host-root layer masks this via the `DragOver` re-fire heuristic — works because the cursor moves on every sample — but breaks the moment auto-scroll fires WITHOUT cursor motion (which it does: the user can hold the cursor still in the gutter and the viewport keeps scrolling).
  - **Selection rectangle around a shape on a Diagram canvas.** User pans the canvas; the rectangle pans too.
  - **Resize handles** on a selected element. They track the element's actual on-screen position as the canvas scrolls.
  - **Lasso / rubber-band selection** while drawing a marquee on a scrollable canvas. The rectangle is anchored in canvas coordinates, not screen coordinates.
  - **Validation error squiggles** under text in a scrollable TextBox.
  - **Comment pins in the margin** of a document (Google Docs / Word style). They scroll with the paragraph they're attached to.

  Practical examples that want the OUTER (stay-on-screen) layer:

  - **Drag ghost / cursor preview.** Always follows the pointer. Anchored to `(mouseX, mouseY)` in window coords, not to any document position. Today the existing `HtmlTarget.dragGhost` machinery lives at this layer.
  - **Drawer scrim** (current `Drawer`). Covers the full viewport regardless of any inner scrolling.
  - **Modal dialog backdrops.** Same — the dim covers the whole window.
  - **Toast / snackbar notifications** ("Saved!"). Pinned to a window corner; document scrolling has no effect.
  - **Tooltips.** Anchored to a Visual's last known position but laid out in screen coords so they don't get clipped by the host control's bounds.
  - **Combo dropdown popup** (current `ComboBox`). Lives at the window root so it can extend BELOW the combo's bounds even when the combo is near the viewport bottom — if it lived inside the `ScrollViewer` it sits in, the inner clip would chop it off.

  **How discovery handles both with the same consumer code.** `AdornerLayer.For(visual)` walks UP the visual tree and returns the FIRST layer it finds. The consumer doesn't have to know which layer — they say "adorn this visual" and the nearest layer above it wins:

  ```
  Window
   ├── AdornerLayer (OUTER)              ← For(cursorGhost) lands here
   └── content
        └── ScrollViewer
             └── AdornerDecorator
                  ├── AdornerLayer (INNER)   ← For(shape) lands here first
                  └── Canvas
                       └── Shape             ← adorned element
  ```

  `For(Shape)` walks `Shape → Canvas → AdornerDecorator → AdornerLayer(INNER)` and stops. Adorners attached here inherit the ScrollViewer's translate transform → they scroll. `For(cursorGhost)` from a Visual outside the scrolled subtree reaches the OUTER layer first. Same consumer call site: `AdornerLayer.For(adorned)?.Add(new MyAdorner({ Child, AdornedElement: adorned }))`. The screen-fixed-vs-content-tracked decision is encoded in WHERE you placed the layers, not in which API the consumer called.

  **v2 (when a demo needs adorners that scroll with content).** Add `AdornerDecorator` — a `Single` that hosts an inner `AdornerLayer` painted atop its child content. Embed one in `ScrollViewer`'s content area; `AdornerLayer.For(...)` walks up and finds the inner layer first. Adorners attached there scroll with the content because they're descendants of the scrolled subtree. Concrete trigger for prioritizing v2: a Diagram demo where resize handles track a shape during canvas pan, OR the 8.5 case improved to handle auto-scroll-without-cursor-motion (which today re-fires DragOver only when the cursor moves).

  **v3 (deferred unconditionally — no use case yet).** `IsHitTestVisible` opt-out so adorners can pass pointer events through to the adorned element. Without it, an overlaid adorner intercepts clicks that should hit the thing underneath.

  **Cost / value.** v1 is ~200 LOC across `Adorner.ts`, the `OverlayLayer` → `AdornerLayer` rename, and the `ListReorderBehavior` migration. The win is removing the manual host-coord math from every consumer that wants to follow an element, plus the disappearance of the Canvas-wrapping hack inside `ListReorderBehavior`. Pairs with future `BoundsAdorner` use cases (selection rectangles in `Diagram`, focus highlights in `TextBox`, validation-error templates on bound DPs). v2 is the bigger structural change because it touches `ScrollViewer`'s template and the `For(...)` lookup walks templated subtrees correctly.

  **Status (2026-06-07): v1 + v2 + v3 all shipped.** [src/runtime/adorner.ts](src/runtime/adorner.ts) houses `Adorner` (abstract Visual w/ readonly `AdornedElement` ctor arg + `Placement(adornedRect, desiredSize): Rect` hook), `AdornerLayer` (Panel-like w/ `Add` / `Remove` / `GetAdorners` and static `GetAdornerLayer` / `FindFirstInSubtree` walkers), and `AdornerDecorator extends Single` (the WPF Decorator analog). [src/Controls/scroll-content-presenter.ts](src/Controls/scroll-content-presenter.ts) owns an inner `AdornerLayer` as a sibling visual child of its content — structurally simpler than embedding an `AdornerDecorator` (which would have collided with `ContentControl`'s logical-tree ownership of the content) but functionally identical for the "adorners scroll with content" property. [src/Controls/list-reorder-behavior.ts](src/Controls/list-reorder-behavior.ts) migrated to `GetAdornerLayer(host.ItemsPanelInstance ?? host)` so the insertion line lands in the SCP's inner layer; a Canvas-wrapping fallback path covers hosts not under an `AdornerDecorator`. Bonus consumers: [src/visual-engine/targets/html-target.ts](src/visual-engine/targets/html-target.ts) drag-ghost goes through a `DragGhostAdorner` against the platform-root `AdornerDecorator` ([demo/platform/platform.mu](demo/platform/platform.mu) wraps the root); [src/Controls/validation-error-adorner.ts](src/Controls/validation-error-adorner.ts) paints the red rectangle as an adorner reactive to `Validation.HasError`. v3's `IsHitTestVisible` DP lives on `Visual` (default `true`, `MetaData.Render`) and the SVG renderer emits `pointer-events="none"` on the outer `<g>` when false — the three decoration adorners (drag ghost, insertion line, validation chrome) set `IsHitTestVisible = false` so they don't intercept pointer events headed for the adorned content. Outstanding before close-out: the `DragOver` re-fire heuristic in `ListReorderBehavior` referenced above isn't actually present in the codebase (auto-scroll only re-evaluates on cursor move via `session.OnMove`); the insertion line tracking during auto-scroll-without-cursor-motion now works structurally because the line is on the SCP's inner layer which shares the scrolled subtree's translate transform.

## 6. Path parser

6.2. **No type-qualified indexers.** WPF supports `[(sys:Int32)0]` to disambiguate indexer overloads. Probably fine to skip for JS.

---

## 8. Drag & drop (v2 follow-ups)

The v1 design (`docs/superpowers/specs/2026-06-04-drag-and-drop-design.md`) lands a WPF-parity routed-event drag/drop subsystem — `AllowDrop` / `IsDragOver` DPs, `DragEnter`/`Over`/`Leave`/`Drop` routed events, `DataObject` formats map, `DragDropEffects`, imperative `DragDrop.DoDragDrop` + declarative `IsDraggable` / `OnDragStart` sugar, and three preview modes (framework ghost / null / DataTemplate). These items are intentionally out of scope for v1 and are listed here as concrete follow-ups so the design isn't load-bearing for them.

8.2. **Multi-pointer drags.** v1 assumes one drag session at a time; a second `pointerdown` during a session is ignored. Lifting this means promoting `_dragSession` from `DragSession | null` to a `Map<pointerId, DragSession>` and tracking per-pointer cursor state. Useful for touch/pen multi-finger composition scenarios; not worth the bookkeeping until a concrete demo asks for it.

