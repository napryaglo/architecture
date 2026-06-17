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

Phases 1–6 + 7 + 8 (including the 19.7-engine + 19.8 corpus close-outs) + the demo-driven 4 + the audit 5.1 + the 19.3 / 19.4 / 19.7 / 19.5 / 19.8 follow-ups all shipped — see [completed-backlog.md § 19](completed-backlog.md). What remains open:

19.8-engine. **Coincidence / angle-ring infinite-loop safety nets for adversarial corpus inputs.** §19.8 ships the harness + ~550 ported regression tests, but running them surfaces a small number of Skia adversarial inputs that drive `op-coincidence.ts` / `op-angle.ts` loops without termination (the engine port faithfully copies Skia's `for (;;)` shapes, which depend on monotonic state changes that adversarial inputs don't guarantee). bridgeOp / bridgeWinding got hard safety nets in §19.8, but the coincidence-resolver and angle-ring iterators still hang on entries like `cubicOp35d`. Corpus tests are gated behind `RUN_PATHOPS_CORPUS=1` until each remaining loop gets either a safety net or a real termination proof.

  Plan of attack: add `OpGlobalState.iterationBudget` (a global integer that every major loop decrements on entry). When the budget hits 0, set a `bailout` flag the loops check next time around — single threadsafe gate across the whole engine. Op() / Simplify() reset the budget at entry and treat a bailout as a graceful `return false` (the corpus verifier already accepts that outcome via the robustness fallback). The "find which loop loops forever" work is the read of each `for (;;)` in op-coincidence.ts / op-angle.ts + a small instrumentation pass to confirm where the cycle is.

**Deferred past Phase 8** (history; revisit when a concrete demo demands them):
  - ~~Path-offset / outline-widening~~ ✅ Done — see [completed-backlog.md § 19-deferred #1](completed-backlog.md). `widen(g, pen)` flattens to polylines, then walks parallel offsets at ±half-thickness with Miter / Round / Bevel joins and Flat / Square / Round caps. Output PathGeometry has LineSegments only (Bezier round-tripping deferred — caller can re-combine() through boolean ops if needed).
  - ~~Re-fitting boolean output back to higher-degree Beziers~~ ✅ Done — see [completed-backlog.md § 19-deferred #2](completed-backlog.md). Collinear-line collapse + same-original-curve coalescing run inside `combine()` between `Op()` and the lift back to PathGeometry.
  - SoA + typed-array hot path. Performance polish if profiling shows the boolean engine on a critical path. Confirmed-deferred 2026-06-17: no profiling motivation; re-open if a real workload puts the engine on the hot path.
  - ~~Geometry text-on-path / geometry-from-text glyph outlines~~ ✅ Done — see [completed-backlog.md § 19-deferred #4](completed-backlog.md). `FontMetricsMeasurer.BuildGeometry(text, …)` lifts a text run to a filled `PathGeometry` via opentype.js glyph outlines; `textOnPath({...})` lays text along a curve via flatten-then-sample.
  - ~~PathGeometry serialization~~ ✅ Done — see [completed-backlog.md § 19-deferred #5](completed-backlog.md). `pathGeometryFromSvgD` parses full SVG 1.1 path-data; round-trips geometry-identical through `pathGeometryToSvgD`.

