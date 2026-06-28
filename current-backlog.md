# Current Backlog

Open gaps in the property/binding/control system compared to WPF. Closed items moved to [completed-backlog.md](completed-backlog.md) — section numbers preserved across both files so cross-references survive.

**Status:** Property / binding / inheritance / layout / render pipeline is feature-complete for WPF parity; the concrete-control roster covers Border, Grid (with shared-size groups), StackPanel, WrapPanel, DockPanel, Canvas, UniformGrid, VirtualizingStackPanel, VirtualizingWrapPanel, Button, ToggleButton, TextBlock, TextBox, ComboBox, ListBox, TreeView, Slider, SpinEdit, ScrollBar, ScrollViewer, ContentControl, ItemsControl, ControlTemplate, DataTemplate, Drawer, PageView, Diagram (with Selector-based multi-select + marquee), Thumb, Splitter, GridSplitter, ToolBar (+ ToolBarButton / ToolBarToggleButton / ToolBarSeparator with overflow popup), Menu / MenuButton / MenuItem / MenuSeparator (hamburger fly-out), ContextMenu (attached DP + right-click auto-open), and shapes (Ellipse, Line). Two-level Theme + Scheme architecture shipped — Material Theme with Light/Dark Schemes, six adaptive inherited DPs, opt-in `SchemeTransition` animation for Brush tokens via the DynamicResource hook. `Visual.RenderTransform` DP shipped with Rotate / Scale / Skew / Group transforms — animatable inner DPs flow through the implicit-transition engine. Selector keyboard navigation surface (arrow / Home / End / PageDown / PageUp / Shift / Ctrl / Space / Ctrl+A) shipped — TreeView adds Left / Right collapse / expand on top. Smooth scrolling DPs + marquee autoscroll + incremental items-change in virtualizing panels (§ 10.4-10.7) shipped. `Visual` → `Element` split + downstream cleanups (§ 1) shipped — UIElement / FrameworkElement seam, three independent collaborators (`StyleApplicator` / `TriggerHost` / `ResourceResolver`), compiler emits typed-key `set_property_value(Owner.PropKey, value)` directly so `Model` has zero `_xxx_by_name` accessors. 5.3 `Dispatcher` / thread affinity dropped — N/A for single-threaded JS. Test suite: **2091 tests passing.**

**M3 modernization (Phases 0-9 + Appendix C + Phase 2.5 + Phase 3.5):** shipped — see [m3-modernization-plan.md](m3-modernization-plan.md) (strike-through markings show shipped state) and [completed-backlog.md § 18](completed-backlog.md). Open M3 follow-ups live in § 18 below.

## 1. `Visual` → `Element` split + downstream cleanups

All 16 items closed — see [completed-backlog.md § 20](completed-backlog.md). End-state matches target: `Visual` is render + input + layout lifecycle (UIElement-tier); `Element` is DataContext + Style + Resources + Triggers + inheritance + logical tree (FrameworkElement-tier); `StyleApplicator` / `TriggerHost` / `ResourceResolver` are independent collaborators; `Model`'s public surface has zero `_xxx_by_name` accessors (compiler emits typed-key `set_property_value(Owner.PropKey, value)` directly).

---

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

---

## 21. Diagram toolbox items factory

Turn the diagram toolbox from a closed, geometry-only built-in catalog into an **open registry of factories** where each entry produces a **fully-configured node** (geometry + presets + label + ports + optional `Figure`/`Group` subclass), registrable from both TypeScript and `.mu`. Today the toolbox is hard-wired: `SHAPE_CATALOG` (35 kinds) auto-populates `DiagramDocument.ToolboxShapes` ([src/framework/diagram/diagram-document.ts:84-105](src/framework/diagram/diagram-document.ts#L84-L105)); a tile carries only `Kind`/`Label`/`PreviewNode`; drop → `attach-standard-mutations` reads the kind string → `CreateNode(kind)` → `Figure.fromKind(kind)`, which can only pull unit-1 geometry from the catalog. No way for an app to contribute an item that drops as a pre-configured node, and no way to assemble a non-built-in toolbox.

**Locked design decisions** (brainstormed 2026-06-26): item richness = **fully-configured node** (`create()` returns a ready `Figure`/`Group`); registration = **TS registry API _and_ `.mu` markup**; catalog relationship = **`SHAPE_CATALOG` unified as the built-in factory source** (no special-case branch — `Figure.fromKind` becomes one ordinary descriptor's `create`); serialization = **full snapshot** (keep writing `d` + fill per node, as today); registry scope = **global singleton**; categories = **descriptor field now, flat rail UI** (grouped/collapsible rail is a follow-up). Open micro-decision: duplicate-`kind` policy — recommended **last-wins** (app can deliberately override a built-in, dev-mode `console.warn` on built-in override); alternatives are throw-on-collision or first-wins.

21.1. **`ToolboxCatalog` + descriptor** (`src/framework/diagram/toolbox-catalog.ts`, new). `interface ToolboxItemDescriptor { kind; label; category?; create(ctx): Figure|Group; preview?(ctx) }` where `NodeCreateContext = { x; y; width?; height?; preview? }`. `ToolboxCatalog` is a global singleton with static `register` / `registerAll` / `get` / `has` / `all` (registration order preserved). `create()` is where "fully-configured" lives — it can `Figure.fromSource(geom)`, set `Fill`/`Stroke`/`LabelText`/`ExplicitPorts`, or `new MySubclass()`. Real class refs throughout (no string proxies).

21.2. **Built-in unification** (`shape-catalog.ts` + a small `register-builtins.ts` to avoid an import cycle). At module load each `SHAPE_CATALOG` entry is wrapped as a descriptor whose `create()` is exactly today's `Figure.fromKind(kind, x, y, opts)` and registered into `ToolboxCatalog`. `Figure.fromKind` stops being special-cased.

21.3. **`.mu` declarative form** (`toolbox-item.ts`, new, + symbol-table entry). Needs **zero compiler changes**: `ToolboxItem` is a markup-constructible runtime class implementing `ToolboxItemDescriptor` with DPs `Kind, Label, Category, Geometry, Fill, Stroke, DefaultLabel, FigureType, Width, Height`. `FigureType` is a real imported class ref (falls back to `Figure`); `create()` instantiates it and applies presets. Markup builds descriptor objects into a resource collection; the demo `.mjs` registers them explicitly via `ToolboxCatalog.registerAll(...)` (compiler stays policy-free). Add `['ToolboxItem', …]` to `DEFAULT_SYMBOLS`.

21.4. **Wiring** (`diagram-document.ts`, `toolbox-shape.ts`). `ToolboxShapes` populates from `ToolboxCatalog.all()`. `ToolboxShape` ctor takes a descriptor; `PreviewNode = (descriptor.preview ?? create({preview:true}))` normalized to 48×48; drag payload unchanged (`'mural/node-kind'` = `kind`). `CreateNode(kind,x,y)` → `ToolboxCatalog.get(kind)?.create({x,y}) ?? Figure.fromKind(kind,x,y)`. Drop path (`attach-standard-mutations.ts`) unchanged. **Save** unchanged (full snapshot). **Load** for a known kind: `descriptor.create()` for the configured base (gets ports/subclass/default fill that aren't serialized) then overlay the snapshot (`d`→geometry, stored fill/label, position, size — snapshot wins so user edits survive); kind-less combined geometries keep the existing `fromSource(d)` branch.

21.5. **Tests + demo.** `toolbox-catalog.test.ts` (register/get/all, built-ins seeded, last-wins override), `toolbox-item.test.ts` (presets + `FigureType` subclass + preview normalize), `diagram-document` round-trip (factory node survives full-snapshot save/load), a compile test (`ToolboxItem` resolves + builds a descriptor). Demo: register one TS item + one `.mu` `ToolboxItem` in the diagram demo; browser-verify drag→drop→configured node.

**Build order** (one pass): (1) `ToolboxCatalog` + descriptor + built-in seeding + tests — pure data, no UI risk; (2) rewire `DiagramDocument`/`ToolboxShape` through the catalog + round-trip test; (3) `ToolboxItem` markup class + symbol-table + compile test; (4) demo wiring + browser verify.

**Follow-ups (out of scope this pass):** grouped/collapsible category rail UI (descriptor already carries `category`); delta-over-factory-default serialization (would shrink docs + let factory defaults evolve into saved docs, but full-snapshot is the chosen v1); per-document / layered catalogs (global singleton is the chosen v1).

---

## 22. Application shell

**Shipped (skeleton, 2026-06-26):** a reusable application-shell family — `ShellBase` → `EditorShell` / `ViewerShell` ([src/framework/shell/shell.ts](src/framework/shell/shell.ts), [editor-shell.ts](src/framework/shell/editor-shell.ts), [viewer-shell.ts](src/framework/shell/viewer-shell.ts)). Region content is authored by tagging each body child with a `Shell.Region` attached property (Header / Commands / Navigation / Content / Inspector / Status), routed into named template hosts by `ShellBase.AddChild` — same mechanism as `DockPanel.Dock`. Each variant ships its own default `ControlTemplate` in [shell.template.mu](src/framework/shell/shell.template.mu): `EditorShell` carries all six regions, `ViewerShell` only Header / Navigation / Content. Region hosts are single-child stretching `Border`s except the `Commands` host (a vertical `StackPanel` for menu+toolbar). The region VM is a **service**: `ServiceBase` ([src/runtime/services/service-base.ts](src/runtime/services/service-base.ts)) = `Model` + `Dispose()` + a static `Key` convention; `ServiceProvider.dispose()` ([service-provider.ts](src/runtime/services/service-provider.ts)) tears down a scope's instances structurally. Three per-region services shipped (`NavigationService` / `InspectorService` / `StatusService`, [src/framework/shell/services/](src/framework/shell/services/)); `ShellBase` creates a child DI scope per instance, resolves each region's service `scoped`, and binds it as the region host's DataContext. The demo platform migrated to `ViewerShell` ([demo/platform/platform.mu](demo/platform/platform.mu)); an `EditorShell` scaffold demo ([demo/demos/editor-shell/](demo/demos/editor-shell/)) wires all four editor regions to their services. 11 shell tests + headless-mount verification of both shells pass.

22.1. **Service-registration wiring — RESOLVED via the markup services DSL.** Closed by the `.services:` / `$service` work (§24): the shell exposes its DI scope as `ShellBase.Services`, a `.services:` block authored on the shell element registers into that scope (`editorShell.Services.…`), and the shell publishes the scope as the inherited `ServiceScope` so region content's `$service(Token)` bindings resolve the shell's per-instance services — no app-root pollution. The editor-shell demo now registers + consumes entirely in markup. The old code-path (`bindRegionServices()` setting region DataContext, register-at-root) remains for apps that prefer it, but is no longer the demo's mechanism. Residual: `ServiceBinding` resolves the scope ONCE at activate (forward-ref retry) and doesn't re-resolve if `ServiceScope` changes after — fine for shells (scope is stable), revisit if a relocatable provider appears.

22.2. **Region chrome — bare hosts, no separators / tints / collapse.** The shell templates lay regions out but ship them as undecorated `Border` / `StackPanel` hosts. No M3 hairlines between regions, no region container tints, and no collapse affordance — regions can't be hidden or resized via DPs (`IsNavigationVisible` / `IsInspectorVisible`, region width DPs). The platform migration had to re-author its own separators (header hairline, nav right-border) inside the region content to keep visual parity. Fix shape: per-region default styling in the shell template + collapse / width DPs on `ShellBase` driving trigger-based region visibility.

22.3. **`NavigationService` is single-level — doesn't fit two-level nav.** `NavigationService` exposes a flat `Items` / `SelectedItem`. The demo platform's navigation is two-level (a `NavigationRail` group picker + a `ListBox` of that group's demos), which doesn't map, so the platform migration kept its existing `PlatformVM` as the Navigation region's inherited DataContext and registered **no** `NavigationService`. To route the platform's nav through the service, either extend `NavigationService` with a hierarchy (groups → items + selected-group/selected-item) or add a `GroupedNavigationService` variant. Pairs with 22.2 (a data-driven rail would also want the group-icon mapping currently hardcoded in [platform-vm.mjs](demo/platform/platform-vm.mjs)).

22.4. **Editor capabilities — Content region is a placeholder.** The `EditorShell` scaffold demo ([demo/demos/editor-shell/](demo/demos/editor-shell/)) renders all regions but has no editable model: the Content region is a hint label, the toolbar buttons are inert, and the services carry only seed state (`Layer 1/2`, `Status: Ready`). The proof-of-loop work — an editable surface in Content whose selection drives `InspectorService.Target` and whose toolbar commands post to `StatusService` (busy / message) — is the next pass. Depends on 22.1 (where the services get registered).

22.5. **No service for Header / Commands / Content (by design) — revisit Commands.** Those three regions inherit the shell's DataContext rather than a dedicated service. Fine for Header / Content, but the `Commands` region's command-enablement state (which commands are available / gated for the current selection) is a natural service candidate — a `CommandService` exposing observable command-availability DPs the toolbar binds `IsEnabled`-equivalent chrome to, written by the editor model. Defer until 22.4 motivates it with real commands.

---

## 24. Markup services DSL — `.Member:` / `.services:` / `$service`

Shipped — see [completed-backlog.md § 24](completed-backlog.md). The DI container's markup surface: `.Member:` aggregate blocks, the `.services:` registration DSL (uniform `(p) => new Impl(p)` lowering + inline config), `IServiceProvider` / `IServiceContainer` + `ServiceBase`, and `$service(Token).path` consumption via the inherited `ServiceScope`. Dogfooded by the demo platform (`PlatformVM` → `DemoNavigationService`).

---

## 25. Fold `resources:` into the general `.Member:` dictionary form

Shipped — see [completed-backlog.md § 25](completed-backlog.md). The dictionary `.Member:` strategy now delegates to the shared `compileResourcesBody` router, so `.Resources:` / `.Member:` accept every `resources:` entry kind (resource-forms with implicit keys, `include`, `glyphs`); `resources:` stays a back-compat alias.

---

## 26. `.Behaviors:` colon-section syntax

Shipped — see [completed-backlog.md § 26](completed-backlog.md). The class-based behaviors block gained the colon-section spelling `.Behaviors: { … }` (braces form kept as an alias); syntax-conformance only, function-attach behaviors remain a future gap.

---

## 27. Resource management is mural-only — migrate demo composition out of `.mjs`

**Rule (user, 2026-06-28):** all resource management AND referencing belongs in `.mu` — no `.mjs`/TS resource composition. Forbidden in bootstraps: `Application.Resources.AddMergedDictionary(...)`, `Resources.Set(key, value)`, registering value resources imperatively. Do it in markup instead: `dictionaries: [A, B]` to merge dictionaries, `import` to pull one in, `include "glob"` for compile-time splice, and keyed entries (`@Key = …`, `Type x:key="…"`, value-object resources) inside a `resources { }` block. If markup can't express something, the missing capability IS the bug — add it, don't fall back to JS.

**Done (proof of pattern):** `ColorScheme` is now a markup-authorable value resource — no-arg ctor + PascalCase settable `Name`/`Colors`/`Tints`/`Shades` (the `Colors` setter unwraps the `SolidColorBrush`es a colour literal lowers to), registered in the compiler `DEFAULT_SYMBOLS`. No grammar change was needed: a `ColorScheme x:key="…" [Name=…, Colors=[#a,#b,…]]` resource lowers through the existing value-object element + plain-field path + `[ … ]` list literal. The color-picker demo authors `@BrandColors` in `color-picker.mu`; the old `.mjs` `Resources.Set('BrandColors', new ColorScheme(…))` is gone.

**Open — the broad migration:** every demo `.mjs` factory still merges its dictionary imperatively (`Application.current?.Resources.AddMergedDictionary(DemoDict.Clone())`, ~40 demos), and the platform composes services in `platform.html` (`app.Services.registerInstance(DiagramStorageKey, …)`). Move these into markup: merge each demo's dictionary from the demo's own `.mu` (via `dictionaries:` / `import`) rather than the factory, and author the platform's service composition in `platform.mu`'s `.services:` block. This touches the demo-loading model (factories currently merge lazily on first activation) and the platform composition root — a single cross-cutting pass, not a per-demo edit. Pairs with § 24 (`.services:` DSL) and § 25 (`.Member:` dictionary fold).

