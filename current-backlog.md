# Current Backlog

Open gaps in the property/binding/control system compared to WPF. Closed items moved to [completed-backlog.md](completed-backlog.md) — section numbers preserved across both files so cross-references survive.

**Status:** Property / binding / inheritance / layout / render pipeline is feature-complete for WPF parity; the concrete-control roster covers Border, Grid (with shared-size groups), StackPanel, WrapPanel, DockPanel, Canvas, UniformGrid, VirtualizingStackPanel, VirtualizingWrapPanel, Button, ToggleButton, TextBlock, TextBox, ComboBox, ListBox, TreeView, Slider, SpinEdit, ScrollBar, ScrollViewer, ContentControl, ItemsControl, ControlTemplate, DataTemplate, Drawer, PageView, Diagram (with Selector-based multi-select + marquee), Thumb, Splitter, GridSplitter, ToolBar (+ ToolBarButton / ToolBarToggleButton / ToolBarSeparator with overflow popup), Menu / MenuButton / MenuItem / MenuSeparator (hamburger fly-out), ContextMenu (attached DP + right-click auto-open), and shapes (Ellipse, Line). Two-level Theme + Scheme architecture shipped — Material Theme with Light/Dark Schemes, six adaptive inherited DPs, opt-in `SchemeTransition` animation for Brush tokens via the DynamicResource hook. `Visual.RenderTransform` DP shipped with Rotate / Scale / Skew / Group transforms — animatable inner DPs flow through the implicit-transition engine. Selector keyboard navigation surface (arrow / Home / End / PageDown / PageUp / Shift / Ctrl / Space / Ctrl+A) shipped — TreeView adds Left / Right collapse / expand on top. Smooth scrolling DPs + marquee autoscroll + incremental items-change in virtualizing panels (§ 10.4-10.7) shipped. 5.3 `Dispatcher` / thread affinity dropped — N/A for single-threaded JS. Test suite: **2091 tests passing.**

**M3 modernization (Phases 0-9 + Appendix C + Phase 2.5 + Phase 3.5):** shipped — see [m3-modernization-plan.md](m3-modernization-plan.md) (strike-through markings show shipped state) and [completed-backlog.md § 18](completed-backlog.md). Open M3 follow-ups live in § 18 below.

## 5. Architectural gaps

5.2. **No `Freezable` / immutability.** Useful for shareable value-type-like Models (Brushes, Geometries).

5.11. **Command surface controls — Ribbon remainder.** 5.11.1 (ToolBar), 5.11.2 (Menu / MenuButton / MenuItem / ContextMenu), and the non-Ribbon part of 5.11.4 (commands demo) all shipped — see [completed-backlog.md](completed-backlog.md). What stays open:

  - **5.11.3 — Ribbon / RibbonTab / RibbonContextualGroup / RibbonGroup / RibbonButton / RibbonToggleButton / RibbonSplitButton / RibbonDropDownButton / RibbonSmallButtonColumn.** Tabbed grouped chrome. Two ItemsControls under `Ribbon`: stable `Tabs` always visible, `ContextualGroups` whose `IsActive` predicate (typically VM-bound) reveals their child contextual tabs with a non-default tab color — inline-badge style, single-row tab strip retained (no Office-style banner above). `RibbonButton.Size` ∈ { Large, Small }; small buttons stack 3 per `RibbonSmallButtonColumn`. `RibbonGroup.LaunchCommand` produces the `↘` corner icon for dialog launchers. Out-of-scope for v1: Backstage / QAT / minimize / KeyTips / galleries / touch sizing (see § 7 of the design doc).

  - **5.11.4-followup — Ribbon mode in the `commands` demo.** The current `commands` demo exercises ToolBar + MenuButton + ContextMenu over a shared `ICommand` catalog with selection-gated commands. When Ribbon (5.11.3) lands, extend the demo with a title-bar toggle to swap between Classic (Menu + ToolBar) and Ribbon modes, and add a contextual Format tab that activates on selection (exercising `RibbonContextualGroup.IsActive`). Also worth migrating: reuse the existing Diagram model from the diagram demo as the demo's content surface (the current demo just uses a status-text content area).

  **Recommended cut line.** 5.11.3 (Ribbon) is heavy — defer until a real demo or app explicitly demands the tabbed grouped chrome. The 5.11.4 followup lands alongside it.

  Surface-control follow-ups (all shipped — see [completed-backlog.md](completed-backlog.md)).

5.13. **Hit testing for non-SVG renderers.** SVG gets hit-testing free via `elementsFromPoint`. Canvas needs a spatial index or hidden picking buffer. WebGL same. Pairs with the CanvasRenderer (9.1). From [visual-engine-design.md](src/document/visual-engine-design.md) § 11.

5.7. **`mural-hit` pad opt-out for non-interactive Visuals.** Today `SvgRenderer` emits an invisible `<rect class="mural-hit" fill="none" pointer-events="all" .../>` inside every Visual's outer `<g>`, sized to its `ArrangedRect`. The pad exists so pointer events register on the whitespace between painted descendants (a TreeView row's gaps between chevron and label glyphs would otherwise fall through under SVG's default `visiblePainted`). One pad per Visual ≈ half the `<rect>` count in any non-trivial scene (~280 of the 633 rects in the tree-view demo, ~28 KB of attributes for a 108 KB dump). For most Visuals the pad is dead weight — purely decorative `TextBlock`s, `Border`s, layout panels, etc. never get a routed-event listener and never appear in an `IsMouseOver`/`IsPressed`/`IsFocused` trigger. The pad is only load-bearing for Visuals that: (a) have a per-instance routed-event listener (`AddPointerDownListener` etc.), (b) appear as the watched target in a `PropertyTrigger` over `IsMouseOver`/`IsPressed`/`IsFocused`, (c) have `Focusable=true`, or (d) override an input virtual (`OnPointerDown`, …). The renderer doesn't currently know any of those criteria. Two viable shapes for the opt-out: an `interactive` bit on Visual that subclasses opt into (cheap, explicit, requires touching every interactive control); or a renderer-side derivation that walks the listener Maps + Style triggers when materializing the outer `<g>` (no control-side change, but couples the renderer to the routed-event + style internals). Either way, the pad still gets re-emitted at the moment a Visual transitions from non-interactive to interactive (new listener added at runtime, Focusable flipped, a trigger installed via Style.OverrideMetadata on a descendant class). Pairs naturally with the existing "lazy-attach `mural-own`" optimization — together they could plausibly halve the steady-state SVG size for layout-heavy demos.

## 6. Path parser

6.2. **No type-qualified indexers.** WPF supports `[(sys:Int32)0]` to disambiguate indexer overloads. Probably fine to skip for JS.

---

## 8. Drag & drop (v2 follow-ups)

The v1 design (`docs/superpowers/specs/2026-06-04-drag-and-drop-design.md`) lands a WPF-parity routed-event drag/drop subsystem — `AllowDrop` / `IsDragOver` DPs, `DragEnter`/`Over`/`Leave`/`Drop` routed events, `DataObject` formats map, `DragDropEffects`, imperative `DragDrop.DoDragDrop` + declarative `IsDraggable` / `OnDragStart` sugar, and three preview modes (framework ghost / null / DataTemplate). These items are intentionally out of scope for v1 and are listed here as concrete follow-ups so the design isn't load-bearing for them.

8.2. **Multi-pointer drags.** v1 assumes one drag session at a time; a second `pointerdown` during a session is ignored. Lifting this means promoting `_dragSession` from `DragSession | null` to a `Map<pointerId, DragSession>` and tracking per-pointer cursor state. Useful for touch/pen multi-finger composition scenarios; not worth the bookkeeping until a concrete demo asks for it.

---

## 9. Renderers & Targets

From [targets.md § 10](src/document/targets.md) and [visual-engine-design.md § 11](src/document/visual-engine-design.md).

9.1. **`CanvasRenderer`.** Canvas2D backend for `HtmlTarget`. Same dirty-tracking shape as `SvgRenderer`, different `DrawingContext`. Needs spatial-index hit-testing — pairs with 5.13. Useful for scenes with thousands of leaf nodes where SVG DOM size becomes the bottleneck.

9.2. **`FileTarget` writers.** `FileTarget.Save()` currently throws. Three natural writers: SVG (trivial via existing `SvgDrawingContext`), PNG (needs Canvas2D rasterizer), PDF (needs a pdf library). SVG is the smallest unblocking move.

---

## 10. Items, scrolling, virtualization

All items closed — see [completed-backlog.md § 10](completed-backlog.md). The remaining v2 optimization (10.1 binary-search prefix-sum for variable heights) is documented inline in the StackPanel code as a "could speed up if profiled" follow-up.

---

## 11. Templating

All items closed — see [completed-backlog.md § 11](completed-backlog.md).

---

## 12. Resources / bindings

All items closed — see [completed-backlog.md § 12](completed-backlog.md).

---

## 14. Grid v3

All items closed — see [completed-backlog.md § 14](completed-backlog.md).

---

## 15. Attached-properties design follow-ups

All items closed — see [completed-backlog.md § 15](completed-backlog.md).

---

## 16. Animation system

Shipped — see [completed-backlog.md § 16](completed-backlog.md).

---

## 17. Theme system follow-ups

All 13 items closed — see [completed-backlog.md § 17](completed-backlog.md). Where v1 implementations stand in for the full WPF / M3 spec (HCT generator's HSL approximation, Typography without `.mu` value-position parser, Menu→Drawer pattern documented without a full drawer template), the closure record names the v2 follow-up criteria.

---

## 18. M3 modernization follow-ups

Surfaced by the post-shipping self-review against [m3-modernization-plan.md](m3-modernization-plan.md) (Phases 0-9 + Appendix C + Phase 2.5 / Phase 3.5 Tier-1 close-out) and the architecture review of the SplitButton popup-template fix against [theme-architecture.md](theme-architecture.md). Items 18.2-18.4 are runtime / framework gaps that the Tier-1 work (SegmentedButton, ButtonGroup, SplitButton, FabMenu) exposed but couldn't fix in their own scope. 18.6-18.8 are plan-process debt. 18.9 lists the plan-explicit deferrals still awaiting demo motivation. 18.12 is the residual theme-architecture-level caveat from the SplitButton popup conformance work. Closed entries 18.1 / 18.5 / 18.10 / 18.11 moved to [completed-backlog.md § 18](completed-backlog.md).

18.2. **`Button.CornerRadius` DP.** `Button`'s chrome is fixed by its default template; consumers composing Button parts into a larger surface have no way to drive corner shape per-instance. `SplitButton` ([src/framework/split-button.ts](src/framework/split-button.ts)) had to fall back to raw `Border` halves with manual press-here-release-here gates rather than using `Button` parts with left-rounded / right-rounded corners. Same gap will bite any future composed-button surface (rounded segmented banks, custom toolbar groupings, button cards). Fix: register `Button.CornerRadiusKey` on the Button class and bind it through to `PART_Border.CornerRadius` in every Button variant template.

18.3. **Externally-writable layout DPs for Panel children.** `Panel` children's `Width` / `Height` / `Margin` are markup-author territory — a parent Panel that wants to drive child sizes (for hover-expand, accordion, drawer-like collapse) has to either clobber author intent or reach around the DP system. `ButtonGroup` ([src/framework/button-group.ts](src/framework/button-group.ts)) uses a `setTimeout`-driven polled tween over an internal `Map<Visual, lerpFraction>` because there's no Visual-level "AnimatedWidth" separate from the Local-tier `Width`. Result: custom easing curves and Storyboard interop are inaccessible to consumers who want a non-default expand cadence. Fix shape: either a `Visual.ArrangeWidth` DP that floats above Local-tier `Width` and feeds Arrange, OR an `ArrangeOverrideTransition` hook on Panel that lets the panel interpolate its own arrange decisions.

18.4. **`Storyboard.AddCompletedListener` reliability in Node tests.** `AnimationManager`'s `RafClock` falls back to `setInterval(16ms)` ([src/runtime/animation/raf-clock.ts](src/runtime/animation/raf-clock.ts)) when `requestAnimationFrame` is unavailable, but the resulting tick cadence doesn't reliably fire `Storyboard.AddCompletedListener` at expected wall-clock moments inside Node test fixtures. `FabMenu` had to schedule its deterministic unmount via `setTimeout(detachMenuChrome, DurationMs + (N-1)·StaggerMs)` rather than chain off the close storyboard. `ManualClock` ([src/runtime/animation/clock.ts](src/runtime/animation/clock.ts)) already exists for this; the gap is the wiring — `initTestApp` ([src/basic/tests/test-app.ts](src/basic/tests/test-app.ts)) doesn't swap it in. Fix: add a `initTestApp({ clock: 'manual' })` opt-in or a `Storyboard.AwaitCompleted` Promise that auto-resolves regardless of clock source.

18.6. **M3 audit batches A-E never tracked as discrete commits.** [m3-modernization-plan.md § Appendix B](m3-modernization-plan.md) calls for 19 per-control audit commits before each phase — Batch A (4) before Phase 2, Batch B (4) before Phase 7, Batch C (2) before Phase 8, Batch D (5) before Phase 9, Batch E (4) anywhere across Phases 5-9. Each audit applies an 8-point checklist (tokens-only, state-layer pattern, five-state pass, shape tokens, typography roles, density triggers, coarse-pointer targets, live theme swap). The work landed alongside its consuming phase commit but no commit message records which controls actually passed all 8 checks. Fix: one-pass audit per-control with a per-control commit if any check fails. Pairs with 17.7 (adaptive trigger coverage gaps) which lists the controls still missing density / pointer / contrast triggers.

18.7. **Phase 1 token audit — pre-M3 cleanup.** [src/resources/material/material.mu](src/resources/material/material.mu) currently catalogs 195 tokens; the M3 plan called for ~170. The extra ~25 are partly intentional (the Phase 7 spacing / list-height / disabled-opacity additions) but some pre-M3 tokens may still be in the catalog without documented rationale. Plan § 1.2 explicitly calls for "cross-check the existing 50-ish tokens against this list. Anything in the existing catalog that's NOT in M3 either (a) gets a documented rationale to keep, or (b) gets removed and call sites migrated." Unverified.

18.8. **Missing demos for shipped Phase 9 controls — Badge, Banner, BottomSheet.** Phase 9 shipped `Badge` (`BadgeVariant.Dot` / `BadgeVariant.Numeric`), `Banner` (a `ContentControl` for in-flow announcements), and `BottomSheet` (a `ContentControl` with a peek-vs-expanded posture). The original plan said "defer pending demo needs" but they got built anyway during Phase 9 close-out. Cross-cutting acceptance criterion #6 ("every new control gets a demo entry under `demo/demos/<name>/`") is unmet for these three. Fix: three small demos exercising each control's headline DP. Pairs with 18.6 — the audit batches would have caught this.

18.9. **Plan-explicit M3 spec deferrals — pending demo motivation.** Listed for completeness; each one ships when a concrete demo motivates it.
  - **`DatePicker` / `TimePicker`** ([m3-modernization-plan.md § 8.10](m3-modernization-plan.md)). Modal + Docked variants per M3 spec. No demo today.
  - **Bottom app bar** ([§ 5](m3-modernization-plan.md)). Companion to TopAppBar for mobile-shaped chromes. Defer "unless a demo asks for it."
  - **`Carousel`** ([§ Appendix A](m3-modernization-plan.md)). Horizontal hero-card scroller. No M3 demand surface in current roster.
  - **`SideSheet`** (Modal + Standard, Appendix A). M3 spec's docked side panel — closest mural analog is `Drawer`. A demo distinguishing the two would clarify which to ship and which to redirect to.
  - **`LoadingIndicator`** (M3 2024, distinct from `ProgressIndicator.Circular`). M3 2024 added a new explicit "still loading" indicator separate from the circular progress. Mural's `ProgressIndicator` (Linear + Circular) covers determinate + indeterminate progress; LoadingIndicator's headline difference is its variable-amplitude oscillation pattern.

18.12. **`ControlTemplate` DP swap-while-active is silently ignored.** `SplitButton.OnPropertyChanged` mounts/unmounts the popup only when `IsOpen` flips ([split-button.ts](src/framework/split-button.ts)). If a consumer writes `PopupTemplate` while the popup is open, the change is ignored until the next close→open cycle. Same shape applies to `MenuButton.TriggerTemplate` (the inline trigger is captured at ctor time and not rebuilt on TriggerTemplate change), `MenuButton.Template` (popup chrome — also ctor-captured), `Drawer.Template`, and any future `Visual.RenderTransform`-style template DP. Runtime template swaps are rare enough that v1 acceptance is fine; the gap matters most under [theme-architecture.md § Slice 4](theme-architecture.md#L533)'s structural-fluid pattern (Menu→Drawer template swap on `ViewportClass=Mobile`). Fix shape: each control with a templated-part DP should rebuild its template parts in `OnPropertyChanged` when the template DP changes, with care taken not to clobber consumer-set Visual content (e.g. SplitButton's MenuContent must survive a PopupTemplate swap). Pairs with [theme-architecture.md § Slice 4](theme-architecture.md#L533) drawer-shaped Menu template — Menu can't be `ViewportClass`-trigger-driven until template swap-while-active works.

---

## 19. Geometry math — boolean ops & shape queries

The geometry model ([src/visual-engine/geometry/geometry.ts](src/visual-engine/geometry/geometry.ts)) currently exposes `RectangleGeometry` / `EllipseGeometry` / `LineGeometry` / `PathGeometry` / `GeometryGroup` and lowers each to its own SVG element or a `<path d="…">`. Five gaps stand between today's surface and a diagram-grade geometry kernel:

  1. No boolean ops between geometries — the inline note at [geometry.ts:203-206](src/visual-engine/geometry/geometry.ts#L203-L206) explicitly flags `CombinedGeometry` (Union / Intersect / Xor / Exclude) as not-yet-supported. SVG has no native operator; the result must be CSG'd into a single `<path>` at the model layer.
  2. No `Geometry.GetBounds()` virtual — `Visual.ArrangedRect` is the only bounds source today, which is AABB-of-the-Visual-frame, not the painted shape.
  3. No `Geometry.Contains(p)` virtual — hit-testing falls back to SVG's `elementsFromPoint` against the lowered `<rect>` / `<ellipse>` / `<path>` chrome. Works for closed-form primitives, but clicking transparent corners of M3 Expressive shapes (Heart, Clover, Squircle, etc.) still selects the node because the SVG element is the AABB-pad rect not the shape outline (pairs with 5.7).
  4. No alignment-edges math for the diagram demo — drag operations have no "snap to other nodes' edges/centers" guides. The current branch name `align-with-combined-edges` carved out this gap.
  5. No selection bounding-box / group resize — multi-select shows per-item chrome but no group affordance.

**Design decisions (already confirmed in design conversation):**

  - **Two-layer surface.** A shape-math kernel under [src/visual-engine/geometry/](src/visual-engine/geometry/) plus runtime helpers under [src/runtime/](src/runtime/). Both the declarative `CombinedGeometry` Model AND a runtime `combine(a, b, mode)` helper consume the kernel. *Kernel shipped; declarative surface still open under 19.7.*
  - ~~**Curve-preserving boolean ops (Skia-style), not polygon-tessellation.** Output keeps cubic / quadratic Bezier segments instead of degenerating curves to many-sided polygons. Higher fidelity at every zoom level, no re-fit pass required.~~ **Shipped.**
  - ~~**Zero new npm deps.** The kernel is a TypeScript port of Skia's `pathops` module (BSD-3-Clause), not a runtime dependency on PathKit-WASM or polygon-clipping.~~ **Shipped — `LICENSE-skia` lives at repo root; `CONTRIBUTING.md` derivation note still open.**
  - ~~**Vendor Skia source as reference.** Drop `skia/src/pathops/*.{h,cpp}` and `skia/include/pathops/*.h` (just those files, not all of Skia) into `third_party/skia-pathops-source/` checked into git. Each port commit gets reviewed against its C++ original; future Skia bugfixes can be back-ported by reading the diff against the vendored snapshot.~~ **Shipped** under [third_party/skia/](third_party/skia/).
  - ~~**Drop conics.** Skia uses rational quadratics (conics) for ellipse arcs and stroke joins. Our model has only line / quad / cubic + `ArcSegment` (which SVG renders directly via the `A` command).~~ **Shipped** — pathops port has line / quad / cubic only; `ArcSegment` → cubic adapter is a Phase 2 (`Geometry.GetBounds()`) follow-up (~50 LOC, lands when CombinedGeometry needs to consume Ellipse / arc inputs).
  - ~~**Object refs, not SoA.** First port mirrors Skia's pointer-linked `SkOpSpan` / `SkOpSegment` / `SkOpContour` graph as TypeScript object refs (one allocation per span, GC handles cleanup).~~ **Shipped.** SoA + indexed typed-arrays remains a future polish pass.
  - **Port the regression corpus.** Skia's `tests/PathOpsOpTest.cpp` carries thousands of recorded path-pair regression tests (`path_union1_0`, `cubicOp1_d`, `bug_5240`, …). The corpus IS where Skia's 10+ years of robustness live. Phase 8 ports the corpus harness + a bulk-conversion script. Probably ~500 tests survive porting cleanly; the rest depend on Skia-specific behavior and get dropped. *Still open under 19.8.*

**Phasing — 8 milestones, ~6 weeks of work, user-visible features land before the hardest port work:**

**Status:** Phases 1, 4, 5, 6 shipped in full. Phase 7 ships the Skia port half (`Op` + `Simplify` driver) — the `CombinedGeometry` Model class + runtime `combine(a, b, mode)` helper are still open. Phase 8's `Simplify` ships; corpus port deferred. Phases 2 (Geometry virtual methods) and 3 (alignment-edges math) remain open. 282 pathops tests passing.

19.1. ~~**Phase 1 — Curve math primitives.** Port `SkPathOpsPoint` / `SkPathOpsLine` / `SkPathOpsQuad` / `SkPathOpsCubic` / `SkPathOpsBounds`. Pure numerics — no graph, no Ops. Includes `cubicRoots` / `quadRoots`, `bezierExtremaT`, segment intersect, cubic × cubic intersection via T-section + bbox clipping. Lands under [src/visual-engine/geometry/pathops/](src/visual-engine/geometry/pathops/) with Skia headers preserved. ~3 days. Not user-visible but unblocks 19.2.~~ **Shipped.**

  **19.1.1 follow-up — `ArcSegment` → cubic adapter.** The pathops port has line / quad / cubic verbs only. SVG-style `ArcSegment` (rx/ry/φ/large-arc/sweep) needs flattening to a chain of cubics before 19.7's `combine()` can consume PathGeometries with arc segments and before 19.2's `PathGeometry.GetBounds()` can return a tight box for arc-containing figures. Endpoint→center parameterization (SVG spec § F.6.5) → split into ≤90° pieces → standard `κ ≈ (4/3) tan(θ/4)` cubic approximation per piece.
  - **Files:** create [src/visual-engine/geometry/pathops/arc-to-cubic.ts](src/visual-engine/geometry/pathops/arc-to-cubic.ts) + [src/visual-engine/geometry/pathops/tests/arc-to-cubic.test.ts](src/visual-engine/geometry/pathops/tests/arc-to-cubic.test.ts). Export from [src/visual-engine/geometry/pathops/index.ts](src/visual-engine/geometry/pathops/index.ts).
  - **API:** `arcToCubics(start: Point, end: Point, rx: number, ry: number, xAxisRotationDeg: number, largeArc: boolean, sweepClockwise: boolean): Cubic[]`. Caller (figure walker in 19.2 / 19.7) converts `ArcSegment` to `(end, rx, ry, φ, large, sweep)` and the pen-position to `start`. Out-of-range radii get scaled up per SVG § F.6.6.
  - **Tests:** (a) degenerate equal-endpoints → empty result; (b) 90° quarter arc → 1 cubic with end-point match within 1e-12; (c) 180° semicircle with large-arc → 2 cubics; (d) full circle expressed as two large-arc halves → 4 cubics; (e) 45° rotated quarter arc → endpoint matches rotation matrix applied to non-rotated case; (f) max-error sweep — sample 16 t-values along the cubic chain, verify each lies within `0.0003 · max(rx,ry)` of the true ellipse (the canonical bound for `κ ≈ 4/3 tan(θ/4)` at θ ≤ 90°).

19.2. **Phase 2 — `Geometry.GetBounds()` / `Contains(p)` / `Intersects(other)`.** Virtual on `Geometry`. Primitives have closed-form overrides (Rect, Ellipse, Line); `PathGeometry` walks figures, uses Phase 1's cubic extrema for tight bounds, uses winding-number ray cast for point-in-shape (works under either fill-rule). RenderTransform-aware via inverse-transform-then-test. `Intersects` is bbox-only for this phase with a `// 19.7 makes this exact` follow-up comment. ~2 days. Ships hit-test through M3 Expressive shapes (closes the demo #3 driver listed in design conversation; pairs with 5.7 for the `mural-hit` opt-out).

  Broken down as sub-tasks (each independently testable):
  - **19.2.1 — Base virtuals on `Geometry`.** Add three abstract methods on [src/visual-engine/geometry/geometry.ts](src/visual-engine/geometry/geometry.ts):
    ```ts
    public abstract GetBounds(): Rect;
    public abstract Contains(point: Point): boolean;
    public abstract Intersects(other: Geometry): boolean;
    ```
    Apply `Geometry.Transform` via the same shape used at render time — return `Transform.Identity`-bounded result for the local geometry then transform-corners + bbox for `GetBounds`; inverse-transform the test `point` then call local `Contains`; bbox vs bbox for `Intersects`. Helpers: `protected getLocalBounds(): Rect` / `protected localContains(point: Point): boolean` separate the local-space subclass overrides from the public transform-aware methods.
  - **19.2.2 — `RectangleGeometry`.** Closed-form. `localBounds = this.Rect` (rounded corners don't change the AABB). `localContains` = inside-with-radii: outside `Rect` → false; inside the un-cornered interior rect (Rect deflated by `(RadiusX, RadiusY)`) → true; otherwise distance from the appropriate corner center vs `(RadiusX, RadiusY)` ellipse equation. `localIntersects` for v1 is bbox-only (matches base).
  - **19.2.3 — `EllipseGeometry`.** Closed-form. `localBounds = new Rect(Center.X - RadiusX, Center.Y - RadiusY, 2·RadiusX, 2·RadiusY)`. `localContains` = `((px - cx)/rx)² + ((py - cy)/ry)² ≤ 1`. Degenerate radii (≤ 0) → empty / never-contain.
  - **19.2.4 — `LineGeometry`.** No fill, so `localContains` always returns false. `localBounds` = AABB of the two endpoints (zero-area for vertical / horizontal, still a valid Rect for intersection tests).
  - **19.2.5 — `PathGeometry`.** The non-trivial case. Walk figures × segments accumulating bounds:
    - `LineSegment`: union endpoint into a running Rect.
    - `QuadraticBezierSegment`: build `Quad` from pen-position + control + endpoint, union with `quad.boundingRect()` (Phase 1 already ships this).
    - `CubicBezierSegment`: build `Cubic`, union with `cubic.boundingRect()`.
    - `ArcSegment`: flatten via 19.1.1's `arcToCubics()`, union each cubic's `boundingRect()`.
    `localContains` uses winding-number ray cast — cast a +X ray from `point` and count signed crossings against each segment. Lines use direct half-plane sign; quads/cubics use Phase 1's `Quad.FindExtrema` / `Cubic.searchRoots` to find t-values where the segment's Y equals `point.Y`, then count those whose X > `point.X` and weight by the segment's local dy sign. Result `≠ 0` (Nonzero) or odd-count (EvenOdd) → inside.
  - **19.2.6 — `GeometryGroup`.** Composite. `localBounds` = union of children's `GetBounds()` (children's Transform already applied by their own `GetBounds`). `localContains` under `FillRule.EvenOdd` XOR-folds child Contains results; under `FillRule.Nonzero` returns `OR` (good enough — Nonzero across composite groups is rare and the v1 weakness is documented).
  - **19.2.7 — Hit-testing wire-up.** Add `Visual.HitTestGeometry: Geometry | undefined` DP. When set, `InputManager`'s hit walk consults `geometry.Contains(pointInVisualLocalCoords)` instead of (or in addition to) the SVG element. Default `undefined` keeps today's behavior. Pairs with **5.7** (`mural-hit` opt-out) — a Visual with `HitTestGeometry` set is by definition interactive in the precise-shape sense, so the renderer can drop the `mural-hit` pad for it.
  - **19.2.8 — Tests.** [src/visual-engine/geometry/tests/geometry-queries.test.ts](src/visual-engine/geometry/tests/geometry-queries.test.ts) — per-subclass cells: rounded-corner contains at the corner radius diagonal, ellipse contains at the focus, line never-contains, path bounds against a 4-cubic heart figure matching the basic shape test corpus, group bounds union, EvenOdd vs Nonzero contains over an annulus (two concentric circles with opposite winding).

19.3. **Phase 3 — Alignment-edges math + diagram behavior.** Mural-native (not ported from Skia) — pure Rect-set algorithms under [src/runtime/alignment-math.ts](src/runtime/alignment-math.ts). API: `findAlignmentGuides(moving: Rect, others: readonly Rect[], opts: { tolerance, edges?: 'min'|'mid'|'max'|'all' }) → {horizontal: number[], vertical: number[], snappedMoving: Rect}`. Lands `align-edges-behavior.mjs` under [demo/demos/diagram/behaviors/](demo/demos/diagram/behaviors/) — attaches to the Diagram surface, intercepts the drag of any `DiagramNode`, emits dashed guide lines through the existing `OverlayLayer`, snaps on release. ~2 days. Closes the `align-with-combined-edges` branch name's namesake feature (demo #1 driver).

  Broken down as sub-tasks:
  - **19.3.1 — Alignment math kernel.** [src/runtime/alignment-math.ts](src/runtime/alignment-math.ts) — pure functions, no Visual / DP / Model imports.
    ```ts
    export type EdgeKind = 'min' | 'mid' | 'max';
    export interface AlignmentGuide { axis: 'x' | 'y'; position: number; movingEdge: EdgeKind; otherEdge: EdgeKind; otherRect: Rect; }
    export interface AlignmentResult { guides: readonly AlignmentGuide[]; snapped: Rect; }
    export function findAlignmentGuides(
        moving: Rect,
        others: readonly Rect[],
        opts?: { tolerance?: number; edges?: readonly EdgeKind[] }): AlignmentResult;
    ```
    Algorithm: for each `(movingEdge, otherEdge)` pair in the cartesian product of requested edge kinds, project both Rects onto X and Y, compute the absolute coordinate of each edge (`min = rect.X`, `mid = rect.X + rect.Width/2`, `max = rect.X + rect.Width`). For each `other`, emit a guide if `|movingCoord - otherCoord| ≤ tolerance` on either axis. Snap by picking the closest matching edge per axis and shifting `moving` by `(otherCoord - movingCoord)` on that axis (independent X/Y snapping — diagonal drag snaps both axes). Defaults: tolerance `5`, edges `['min', 'mid', 'max']`.
  - **19.3.2 — Math tests.** [src/runtime/tests/alignment-math.test.ts](src/runtime/tests/alignment-math.test.ts) — no-others (empty guides + unchanged snap), single other with X-edge match (one guide, X-snapped, Y unchanged), tie-breaking (two others equidistant — first-wins), tolerance boundary (just-inside vs just-outside), `edges: ['mid']` opt-out keeps min/max from firing.
  - **19.3.3 — Overlay guide-line visual.** Add a stateless `AlignmentGuides` Visual under [src/runtime/](src/runtime/) (or place demo-local under [demo/demos/diagram/](demo/demos/diagram/) and promote when 5.x backlog touches it). Takes a `Guides: readonly AlignmentGuide[]` DP, renders dashed `Line` Visuals through `OverlayLayer`. Stroke `#1976d2` 1 px, `StrokeDashArray = [4, 4]`. Cleared by setting `Guides = []`.
  - **19.3.4 — Diagram behavior.** [demo/demos/diagram/behaviors/align-edges-behavior.mjs](demo/demos/diagram/behaviors/align-edges-behavior.mjs). Shape: `export function attachAlignEdges(diagramSurface, vm) → { detach }`. On `DiagramNode` `PointerMove` during drag, compute `moving = node.ArrangedRect` and `others = vm.Nodes.filter(n !== node).map(n => n.ArrangedRect)`, call `findAlignmentGuides`, write `vm.AlignmentGuides = result.guides` and apply the snapped delta to the drag VM. On `PointerUp`, clear `vm.AlignmentGuides = []`. No view-tree reads from VM side — behavior owns all `ArrangedRect` lookups.
  - **19.3.5 — VM surface.** Add `DiagramVM.AlignmentGuidesKey: readonly AlignmentGuide[]` DP (default `[]`). Wire the OverlayLayer in `diagram.mu` to bind `AlignmentGuides.Guides = {Binding AlignmentGuides}`.
  - **19.3.6 — Diagram bootstrap.** Call `attachAlignEdges(surface, vm)` in [demo/demos/diagram/diagram.mjs](demo/demos/diagram/diagram.mjs) entry point alongside the existing behavior wires.

19.4. ~~**Phase 4 — Selection bounding-box + group-resize adorner.** Uses Phase 2's `GetBounds()` composed with each Visual's `RenderTransform` to compute the tight selection rect. New `SelectionBoundsAdorner` under [src/basic/adorners/](src/basic/adorners/) — dashed AABB chrome + 8 corner / edge resize handles. Group resize applies proportional scale via a Storyboard targeting each selected Visual's `RenderTransform` (uses the existing implicit-transition engine). ~2 days. Ships demo #2 driver.~~ **Shipped** as [demo/demos/diagram/selection-resize-adorner.mjs](demo/demos/diagram/selection-resize-adorner.mjs) (demo-local Adorner subclass; group resize via direct DP writes rather than Storyboard — works fine for the demo, a `SelectionBoundsAdorner` promoted into `src/basic/adorners/` is the v2 polish).

  **19.4.1 follow-up — promote `SelectionBoundsAdorner` into the framework.** The demo-local class duplicates everything a second consumer would need. Trigger to promote: a second demo or control needs selection-bbox + resize handles. Concrete shape:
  - **Files:** create [src/basic/adorners/selection-bounds-adorner.ts](src/basic/adorners/selection-bounds-adorner.ts), tests under [src/basic/tests/selection-bounds-adorner.test.ts](src/basic/tests/selection-bounds-adorner.test.ts), barrel export from [src/basic/index.ts](src/basic/index.ts). Diagram demo's local file becomes a 3-line re-export until proven dead.
  - **Generalize the VM coupling.** The demo-local class references `DiagramVM.SelectionXKey` etc. directly. Promoted form takes a `SelectionSource` interface: `{ subscribe(cb: () => void): () => void; getBounds(): Rect; getCount(): number; beginResize(): void; applyResize(dw, dh, xAnchor, yAnchor): void; endResize(): void; }`. Diagram demo provides a thin adapter wrapping the existing VM DPs. Any future consumer wires its own adapter.
  - **Style + handle DPs.** Move the hard-coded colors (`#1976d2` / `#ffffff`) and `HANDLE_SIZE = 8` to `SelectionBoundsAdorner` DPs (`Stroke`, `Fill`, `HandleSize`) so consumers theme via Style rather than forking the class. Apply via the default Style — registered in [src/basic/themes/](src/basic/themes/) per the CLAUDE.md rule "Every control MUST have a default Style".
  - **Group resize via Storyboard.** The demo writes DPs directly inside `applyResize`. Promoted form, when `Animated = true`, drives a `DoubleAnimation` on each selected Visual's `RenderTransform` Scale inner-DPs (already animatable). Falls back to direct write when `Animated = false`. Pairs with the [animation system](completed-backlog.md#L16) — uses `Storyboard.AddCompletedListener` for the end-of-gesture callback (gated on **18.4** if Node test reliability matters; browser-side works today).
  - **Tests:** mount with a stub `SelectionSource`, drive `getBounds()` through a few values, snapshot the `Width`/`Height`/positions of each handle. Re-mount with `Animated = true`, drive a resize, advance the manual clock past `Duration`, assert handles and bbox have moved.

19.5. ~~**Phase 5 — Intersection core.** Port `SkIntersections` / `SkPathOpsTSect` / `SkAddIntersections` / `SkLineParameters`. The numerical heart — T-section curve × curve intersection with bbox clipping + Newton refinement, line × curve intersection, line × line with collinearity handling. ~5-7 days. Not user-visible; feeds 19.6.~~ **Shipped** as [intersections.ts](src/visual-engine/geometry/pathops/intersections.ts), [t-sect.ts](src/visual-engine/geometry/pathops/t-sect.ts), [line-parameters.ts](src/visual-engine/geometry/pathops/line-parameters.ts), [quad-line-intersection.ts](src/visual-engine/geometry/pathops/quad-line-intersection.ts), [cubic-line-intersection.ts](src/visual-engine/geometry/pathops/cubic-line-intersection.ts); `SkAddIntersections` shipped with Phase 7 as [op-add-intersections.ts](src/visual-engine/geometry/pathops/op-add-intersections.ts). 36 accuracy-validated tests (rounds 1-3) pin the bisection driver against analytical roots, coincidence-flag bitmasks, multi-crossing constructions, and near-tangent precision boundaries.

  **19.5.1 follow-up — closeout audit.** ~~Phase 5 has no open code work; the audit task is purely book-keeping. Confirm: (a) every Phase 5 file has the BSD-3-Clause Skia header preserved verbatim ([cubic.ts:1-10](src/visual-engine/geometry/pathops/cubic.ts#L1-L10) is the template); (b) [LICENSE-skia](LICENSE-skia) lives at repo root;~~ both verified clean: [intersections.ts](src/visual-engine/geometry/pathops/intersections.ts), [t-sect.ts](src/visual-engine/geometry/pathops/t-sect.ts), [line-parameters.ts](src/visual-engine/geometry/pathops/line-parameters.ts), [quad-line-intersection.ts](src/visual-engine/geometry/pathops/quad-line-intersection.ts), [cubic-line-intersection.ts](src/visual-engine/geometry/pathops/cubic-line-intersection.ts) all carry the Copyright + LICENSE-skia + Skia source path triplet; [LICENSE-skia](LICENSE-skia) lives at repo root. ~~(d) `intersections-accuracy-round3.test.ts` documents the engine's precision floor (1e-9 below near-tangent apex, 1e-6 above) in a top-of-file comment so future contributors don't chase floating-point ghosts.~~ Already documented in the file's existing header ([intersections-accuracy-round3.test.ts:16-26](src/visual-engine/geometry/pathops/tests/intersections-accuracy-round3.test.ts#L16-L26)). **Remaining open item:** `CONTRIBUTING.md` derivation note — deferred (creating a new .md file is out of scope without explicit user ask; same outstanding item as the cross-cutting acceptance row below).

19.6. ~~**Phase 6 — Half-edge graph.** Port `SkOpSpan` / `SkOpSegment` / `SkOpContour` / `SkOpEdgeBuilder` / `SkOpCoincidence`. Half-edge graph, span splitting at every intersection, coincidence detection for overlapping segments (the worst bug source — Skia's coincidence epsilon has been touched dozens of times for adversarial cases). Edge builder adapts `Geometry` input into the graph. ~5-7 days. Not user-visible; feeds 19.7.~~ **Shipped** across five chunks: foundation ([op-global-state.ts](src/visual-engine/geometry/pathops/op-global-state.ts), [op-span.ts](src/visual-engine/geometry/pathops/op-span.ts), [op-angle.ts](src/visual-engine/geometry/pathops/op-angle.ts) skeleton); OpSegment + OpContour ([op-segment.ts](src/visual-engine/geometry/pathops/op-segment.ts), [op-contour.ts](src/visual-engine/geometry/pathops/op-contour.ts)); OpAngle sort kernel (setSpans / setSector / orderable / after / insert / merge); OpCoincidence + helpers ([op-coincidence.ts](src/visual-engine/geometry/pathops/op-coincidence.ts) — full resolver kernel: apply / mark / addMissing / addEndMovedSpans / addExpanded); winding walker + ray-cast ([op-winding.ts](src/visual-engine/geometry/pathops/op-winding.ts) — sortableTop / findSortableTop / FindSortableTop). Edge builder shipped with Phase 7 as [op-edge-builder.ts](src/visual-engine/geometry/pathops/op-edge-builder.ts).

19.7. **Phase 7 — Boolean ops + `CombinedGeometry`.** ~~Port `SkOpAngle` (angle sort at vertices to decide result-boundary walk direction) + `SkPathOpsOp` (the operation dispatcher) + `SkPathWriter` (graph → output path).~~ **Skia port shipped:** [op-path-ops-op.ts](src/visual-engine/geometry/pathops/op-path-ops-op.ts) (`Op(a, b, op, result)` + `Simplify(p, result)` + `bridgeOp` + `findChaseOp` + `gOpInverse` / `gOutInverse` truth tables), [op-path-ops-common.ts](src/visual-engine/geometry/pathops/op-path-ops-common.ts) (`SortContourList` + `HandleCoincidence` + `AngleWinding` + `FindChase` + `FindUndone`), [op-path.ts](src/visual-engine/geometry/pathops/op-path.ts) + [op-path-writer.ts](src/visual-engine/geometry/pathops/op-path-writer.ts) + [op-edge-builder.ts](src/visual-engine/geometry/pathops/op-edge-builder.ts) (input/output sides). Driver tests cover empty-operand short-cuts + the four boolean ops on overlapping rectangles. **Still open:** add `CombinedGeometry extends Geometry` Model class — DPs: `Geometry1`, `Geometry2`, `GeometryCombineMode` ({Union, Intersect, Xor, Exclude}). Lazy memo of the flattened `PathGeometry`; invalidated when inputs' `MetaData.Render` properties change via the same `_setRenderInvalidator` pattern `TransformGroup` uses. Runtime helper `combine(a, b, mode) → PathGeometry` exposed under [src/visual-engine/geometry/](src/visual-engine/geometry/) wrapping the new `Op()`. Also upgrades 19.2's `Geometry.Intersects(other)` from bbox-only to exact.

19.8. **Phase 8 — Simplify + winding utilities + corpus port.** ~~Port `SkPathOpsSimplify` (resolves self-intersecting input — turns "input not simple" errors from Phase 6 into graceful degradation)~~ **`Simplify` shipped** as part of [op-path-ops-op.ts](src/visual-engine/geometry/pathops/op-path-ops-op.ts) (unary `bridgeWinding` variant). `SkPathOpsAsWinding` not ported (was only used by Skia's `convertToWindingMode` debugging utility — not on the boolean-op path). **Still open:** build the regression corpus harness: TS port of Skia's `outputProgressively`-style verifier, plus a small parser script that extracts path commands + expected ops from `skia/tests/PathOps*Test.cpp` and emits TS test stubs. Bulk-port the ~500 surviving tests. Robustness pass — pays huge dividends on adversarial inputs.

**Deferred past Phase 8:**
  - Path-offset / outline-widening (stroke → fill). Useful for "draw a parallel curve at offset N" diagram tooling but separate concern from boolean ops.
  - Re-fitting boolean output back to higher-degree Beziers. Phase 7 output already preserves segments — this would smooth across boundary segments. Cosmetic polish.
  - SoA + typed-array hot path. Performance polish if profiling shows the boolean engine on a critical path.
  - Geometry text-on-path / geometry-from-text glyph outlines. Different problem domain (font engine territory).
  - PathGeometry serialization (`PathGeometry.Parse("M 0 0 L 100 0 …")`). Useful for round-tripping with SVG sources.

**Cross-cutting acceptance:**
  - ~~Every Phase commit ports against its Skia C++ counterpart inline in the PR description (side-by-side diff).~~ Held through Phase 1 / 5 / 6 / 7 / 8 commits; line-by-line Skia file references preserved in the ported file headers.
  - ~~Every Phase ships its test fixture before merge; corpus integration is Phase 8 but per-Phase unit tests land throughout.~~ Per-phase tests shipped (282 pathops tests across 104 suites); Phase 8 corpus port still open.
  - ~~`LICENSE-skia`~~ shipped + `CONTRIBUTING.md` derivation note still open.

