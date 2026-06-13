# Current Backlog

Open gaps in the property/binding/control system compared to WPF. Closed items moved to [completed-backlog.md](completed-backlog.md) — section numbers preserved across both files so cross-references survive.

**Status:** Property / binding / inheritance / layout / render pipeline is feature-complete for WPF parity; the concrete-control roster covers Border, Grid (with shared-size groups), StackPanel, WrapPanel, DockPanel, Canvas, UniformGrid, VirtualizingStackPanel, VirtualizingWrapPanel, Button, ToggleButton, TextBlock, TextBox, ComboBox, ListBox, TreeView, Slider, SpinEdit, ScrollBar, ScrollViewer, ContentControl, ItemsControl, ControlTemplate, DataTemplate, Drawer, PageView, Diagram (with Selector-based multi-select + marquee), Thumb, Splitter, GridSplitter, ToolBar (+ ToolBarButton / ToolBarToggleButton / ToolBarSeparator with overflow popup), Menu / MenuButton / MenuItem / MenuSeparator (hamburger fly-out), ContextMenu (attached DP + right-click auto-open), and shapes (Ellipse, Line). Two-level Theme + Scheme architecture shipped — Material Theme with Light/Dark Schemes, six adaptive inherited DPs, opt-in `SchemeTransition` animation for Brush tokens via the DynamicResource hook. 5.3 `Dispatcher` / thread affinity dropped — N/A for single-threaded JS. Test suite: **1954 tests passing.**

**M3 modernization (Phases 0-9 + Appendix C + Phase 2.5 + Phase 3.5):** shipped — see [m3-modernization-plan.md](m3-modernization-plan.md) (strike-through markings show shipped state) and [completed-backlog.md § 18](completed-backlog.md). Open M3 follow-ups live in § 18 below.

## 5. Architectural gaps

5.2. **No `Freezable` / immutability.** Useful for shareable value-type-like Models (Brushes, Geometries).

5.11. **Command surface controls — Ribbon remainder.** 5.11.1 (ToolBar), 5.11.2 (Menu / MenuButton / MenuItem / ContextMenu), and the non-Ribbon part of 5.11.4 (commands demo) all shipped — see [completed-backlog.md](completed-backlog.md). What stays open:

  - **5.11.3 — Ribbon / RibbonTab / RibbonContextualGroup / RibbonGroup / RibbonButton / RibbonToggleButton / RibbonSplitButton / RibbonDropDownButton / RibbonSmallButtonColumn.** Tabbed grouped chrome. Two ItemsControls under `Ribbon`: stable `Tabs` always visible, `ContextualGroups` whose `IsActive` predicate (typically VM-bound) reveals their child contextual tabs with a non-default tab color — inline-badge style, single-row tab strip retained (no Office-style banner above). `RibbonButton.Size` ∈ { Large, Small }; small buttons stack 3 per `RibbonSmallButtonColumn`. `RibbonGroup.LaunchCommand` produces the `↘` corner icon for dialog launchers. Out-of-scope for v1: Backstage / QAT / minimize / KeyTips / galleries / touch sizing (see § 7 of the design doc).

  - **5.11.4-followup — Ribbon mode in the `commands` demo.** The current `commands` demo exercises ToolBar + MenuButton + ContextMenu over a shared `ICommand` catalog with selection-gated commands. When Ribbon (5.11.3) lands, extend the demo with a title-bar toggle to swap between Classic (Menu + ToolBar) and Ribbon modes, and add a contextual Format tab that activates on selection (exercising `RibbonContextualGroup.IsActive`). Also worth migrating: reuse the existing Diagram model from the diagram demo as the demo's content surface (the current demo just uses a status-text content area).

  **Recommended cut line.** 5.11.3 (Ribbon) is heavy — defer until a real demo or app explicitly demands the tabbed grouped chrome. The 5.11.4 followup lands alongside it.

  Surface-control follow-ups (all shipped — see [completed-backlog.md](completed-backlog.md) for the closed entries):
   - ~~**Submenu fly-outs** for MenuItem.Items.~~ Closed. `MenuItem.IsSubmenuOpen=true` mounts the submenu popup on the OverlayLayer. Positioning honours an `anchorSide: 'below' | 'right'` flag on `MenuPopupHost`: top-level rows in a `MenuStrip` open below; nested rows open to the right (WPF parity).
   - ~~**Submenu keyboard navigation**~~ Closed. `MenuItem.Focusable=true`; `OnKeyDown` handles Arrow keys, Enter, Space, Escape, and letter accelerators. `KeyEventArgs` now carries a focus sink so handlers can transfer focus via `args.SetFocus(target)`.
   - ~~**Double-click gesture for MouseBinding.**~~ Closed. `PointerEventInit.IsDoubleClick` flows through the host adapter — `HtmlTarget` classifies consecutive presses within 500 ms / 4 px tolerance and sets the flag on the second one. `dispatchPointer`'s bubble pass now consults `InputBindings` for `PointerDown` (the historic gap), so `MouseBinding(LeftDoubleClick)` fires.
   - ~~**Dynamic Icon / ShowText on ToolBarButton.**~~ Closed. Added a `Text: string | undefined` DP alongside `Icon` / `ShowText`; flipping any of the three rebuilds the inline `Content` stack via `OnPropertyChanged` (reusing a single per-button `StackPanel` instance so the icon Visual's single-parent invariant holds).
   - ~~**ToolBar HasOverflowItems styling.**~~ Closed. `OnPropertyChanged('HasOverflowItems')` collapses the chevron Button to `Width=0` when no items overflow; restores to `NaN` (auto) when they do.

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

From [items-and-scrolling.md § 12](src/document/items-and-scrolling.md) and [marquee-selection.md § 12](src/document/marquee-selection.md).

10.1. **Variable item heights in `VirtualizingStackPanel`.** Uniform-height assumption today. Real-world text-heavy lists with measured-per-item heights need a per-item size cache and binary-search viewport-hit-test. Same shape `VirtualizingWrapPanel` would need for a future variable-cell variant.

10.2. **Horizontal-orientation virtualization.** `VirtualizingStackPanel` is vertical-only. Symmetric math; not done.

10.3. **`ItemTemplateSelector` / `DataTemplateSelector`.** Pick a template per item instance (vs. the current one-template-per-ItemsControl). Useful for heterogeneous data sources.

10.4. **Incremental items-change handling in virtualizing panels.** Today `OnItemsChanged` recycles everything and invalidates measure. Per-change incremental update (Insert at index, Remove at index, Move) would keep already-realized rows in place. Subclasses could override `OnItemsChanged`; the default is the conservative path.

10.5. **Smooth scrolling.** `ScrollViewer` offsets change instantaneously. A future animation system (16.1) would let offset changes tween over time.

10.6. **`ScrollViewer` descendant walk for `IScrollInfo`.** Content must currently BE the `IScrollInfo` provider directly. Wrapping a `ScrollViewer` around an `ItemsControl` whose `ItemsPanel` is a `VirtualizingStackPanel` doesn't auto-delegate — needs a stable lookup from ItemsControl through to its inner panel.

10.7. **Marquee autoscroll.** Dragging the marquee past the panel's edges holds the rectangle at the edge; the underlying `ScrollViewer` doesn't auto-scroll to bring more rows into the gesture. Wiring autoscroll mirrors the same hook drag-drop's `8.4` autoscroll uses.

10.8. **Marquee keyboard equivalent.** Currently mouse-only. Shift+arrow row-range extension exists via `selectContainerRange` at the Selector level, but no marquee-shaped keyboard gesture (e.g., select-to-edge-of-viewport).

10.9. **`HierarchicalDataTemplate`.** TreeView lives, but the `HierarchicalDataTemplate` declarative shape (template that defines both the row visual AND the per-item Items binding) isn't built; consumers wire TreeView item recursion imperatively.

---

## 11. Templating

From [templating.md § 9](src/document/templating.md).

11.1. **`MultiBinding` for `TemplateBinding`.** A single `TemplateBinding` resolves one source path. Combining multiple source values (e.g., `BorderBrush` derived from `IsMouseOver + IsPressed`) needs a `MultiBinding`-equivalent. Same shape gap as data-side `MultiBinding` on `DataTemplate`s ([items-and-scrolling.md § 12](src/document/items-and-scrolling.md)).

11.2. **`Style.TargetType = TemplateType` integration.** WPF's themed styles auto-apply to a control through its template (a Style targeting `Button` reaches a Button inside another control's template). Mural's implicit-style lookup is logical-tree-bound and doesn't traverse template boundaries.

---

## 12. Resources / bindings

From [resources.md § 6](src/document/resources.md).

12.1. **`DynamicResource` re-wiring on first-access mid-life.** Host re-parent re-wires (Attach/Detach drive `refresh_dynamic_resources_subtree`), so moving Visuals between resource scopes at runtime works. Remaining gap: an ancestor that first-accesses its `Resources` (lazily allocating its dict) AFTER a descendant's `DynamicResource` was already built — without a tree mutation in between — doesn't get subscribed to. Common shapes hit the closed paths; this one is exotic.

12.2. **`MergedDictionaries.Source` URI loading.** Consumers populate resource dictionaries imperatively or via `.mu`. No built-in "load this .mu / JSON / file at this URI" path.

12.3. **Coarse-grained resource change notifications.** `ResourceDictionary.Subscribe` is `() => void` (no per-key diff payload). Consumers re-resolve specific keys on each fire. Fine for typical resource counts; would be wasteful for dictionaries with thousands of entries where most changes don't affect a given consumer.

12.4. **No keyed sealing of resources.** WPF freezes a resource value once committed; Mural lets you `Set` over an existing key. Defensive copy-on-write may be needed if shared Brush/Geometry instances start getting mutated.


---

## 14. Grid v3

From [grid.md § 8](src/document/grid.md).

14.1. **`Grid.ShowGridLines`.** Debug rendering of cell boundaries. Trivial: the DP isn't registered and `RenderOverride` doesn't draw separators. The rendering layer is ready.

14.2. **Star-track shrinkage when Auto requests more than available.** WPF clamps Auto sizes to keep at least some room for Star tracks; Mural lets Stars go to 0. In practice this only manifests when the available size is too small to fit Auto-driven content — usually a layout bug at a higher level. Edge-case allocation policy.

---

## 15. Attached-properties design follow-ups

From [attached-properties-design.md § 8](src/document/attached-properties-design.md).

15.1. **`targetType` validation on attached properties.** WPF allows specifying that an attached property is only valid for certain target types. Not in scope; revisit if a use case appears.

15.2. **Bulk cross-class inheritance enumeration.** If a `Border` ancestor sets many inheritable cross-class properties, a freshly-attached subtree fills them via per-property cascades. There's no single "walk ancestors and discover inheritable cross-class properties" pass. Works fine for normal usage; revisit only if performance demands.

15.3. **`RemoveValue` API.** `ClearValue` resets to default but leaves the EVD slot. A `RemoveValue` that deletes the EVD entirely would save memory per target. Not worth the API surface unless profiling shows the cost.

---

## 16. Animation system

A genuine gap: there's no time-driven property animation today. Needed before several other backlog items become actionable (7.3 `EventTrigger`, 7.4 `EnterActions/ExitActions`, 10.5 smooth scrolling).

16.1. **Animation framework.** `Storyboard`, `DoubleAnimation`, `ColorAnimation`, `AnimationTimeline` — the WPF shape, or a simpler primitive: a per-property tween scheduled via rAF that writes through the DP system at the Animated tier of the value-priority ladder (already reserved in [property-system.md § 3](src/document/property-system.md)). Large item — design first.

---

## 17. Theme system follow-ups

The two-level (Theme + Scheme) architecture shipped — see [theme-architecture.md](theme-architecture.md), [theme-authoring.md](src/document/theme-authoring.md). Material Theme + Light/Dark Schemes are live, the `tokens { … }` catalog is compiler-validated, adaptive DPs (Density / ViewportClass / Pointer / PrefersContrast / PrefersReducedMotion / PrefersColorScheme) cascade through the tree, and SchemeTransition animates `SolidColorBrush` token swaps via DynamicResource. These items are the residual gaps.

17.1. **`Visual.Scheme` / `Visual.Theme` inherited DPs.** Spec § Slice 3 called for these alongside the six adaptive DPs — they never landed ([src/runtime/adaptive.ts](src/runtime/adaptive.ts) only exposes Density, ViewportClass, Pointer, PrefersContrast, PrefersReducedMotion, PrefersColorScheme). Without them, subtree `Scheme=@MaterialDark` overrides don't actually exist; every consumer reads from the global `Application.Resources` merge. Wiring requires the inherited DPs + a `DynamicResource` re-resolve when the nearest-ancestor `Scheme` value changes (so descendants see Theme A's templates against Theme B's scheme on the local subtree). Pairs with 17.2.

17.2. **Cross-theme scheme reuse at runtime.** Spec settled on **authoring-only** via `defineScheme({ basedOn: '<theme>.<scheme>' })`. A runtime mode pairing Theme A's templates with Theme B's scheme — useful for design-system A/B previews or skin-only branding — is open. Pairs with 17.1.

17.3. **SchemeTransition: non-Brush token animators.** The DynamicResource hook (`registerSchemeTransitionAnimator` in [src/runtime/theme.ts](src/runtime/theme.ts)) is type-agnostic; only `SolidColorBrush` has a registered factory ([src/visual-engine/solid-color-brush-animation.ts](src/visual-engine/solid-color-brush-animation.ts)). CornerRadius / Thickness / number / Typography tokens snap regardless. `tokens: 'all'` is therefore silently equivalent to `'brushes-only'` until per-type factories land. Each new factory needs an `interpolate*` helper (most already exist for the matching animation timeline) and the right "rebuild a frame's value" shape.

17.4. **SchemeTransition for inherited DP changes.** Pre-deferred in [theme-architecture.md § Deferred](theme-architecture.md#deferred-topics-own-brainstorms): tween spacing values when `Density` flips, similar token-swap semantics but driven off an inherited DP rather than an `Application.Resources` mutation. Requires extending the animator hook to also wrap inherited-DP transitions, or a parallel mechanism on the DP plumbing.

17.5. **Container queries.** Per-element responsive observers ("when *this* container is narrower than X, restyle"). Pre-deferred in [theme-architecture.md § Deferred](theme-architecture.md#deferred-topics-own-brainstorms). Needs one `ResizeObserver` per container; concrete demand absent.

17.6. **`Theme.ApplyTo` as attached property.** Subtree theme swap via an attached DP rather than `Visual.Theme` write. Pre-deferred in [theme-architecture.md § Deferred](theme-architecture.md#deferred-topics-own-brainstorms); revisit if a concrete side-by-side full-design-language preview consumer appears. Pairs with 17.1.

17.7. **Adaptive trigger coverage gaps.** Density + Pointer + PrefersContrast triggers shipped on `Button`, `Outlined`, `MenuButton` ([src/basic/basic.template.mu](src/basic/basic.template.mu), [src/framework/menu/surface.template.mu](src/framework/menu/surface.template.mu)). Missing on: `ToolBarButton` / `ToolBarToggleButton`, `ToggleButton`, `ComboBox` (popup + selection), `Slider` thumb, `SpinEdit`, `ScrollBar` thumb, `TextBox`, `TreeView` rows, `ListBox` rows, `MenuItem` rows. Each needs `when(Density=Compact)` / `when(Density=Comfortable)` / `when(Pointer=Coarse)` Padding/Size setters per M3 spec.

17.8. **ViewportClass structural swap — Menu → Drawer on Mobile.** Slice 4 scope from the theme spec. `Menu` / `ContextMenu` should retemplate to a drawer-shaped surface when `ViewportClass=Mobile`. The drawer-shaped `MenuPopup` template never landed; pairs naturally with the existing `Drawer` control. Spec also names this as the canonical demo of the structural-fluid responsive tier.

17.9. **Configurable viewport breakpoints.** `M3_BREAKPOINTS` in [src/runtime/adaptive.ts](src/runtime/adaptive.ts) is hard-coded (Mobile ≤ 600, Tablet 600–840, Desktop > 840). Spec called for `ThemeManager.Breakpoints = { mobile, tablet }` as a configurable knob so apps can shift the cutovers without forking the framework. Mechanical add — a constant becomes a getter on `ThemeManager` that `MediaWatcher` consults on resize.

17.10. **`Typography` value class + per-scheme typography swaps.** Slice 5 scope; never landed. Schemes today inline typography token entries from a sibling `Typography.Clone()` dict; the proper shape is a `Typography` Model with `family / size / weight / lineHeight / tracking` DPs that can be authored in `.mu` value position (e.g. `@BodyMedium = Typography { Family: "Roboto" Size: 14 Weight: 400 LineHeight: 20 }`). Template references like `Style = @BodyMedium` fan out to TextBlock at apply time. LineHeight DP itself (Slice 5's prerequisite) shipped — see [src/basic/text-block.ts](src/basic/text-block.ts).

17.11. **Hard-deprecation pathway for legacy `SetTheme` / `CurrentTheme` / `ToggleTheme`.** These survive as aliases over `ThemeManager.Current.ActivateScheme` / `ActiveScheme`. The "keep forever" answer was leaning at spec time; alternative is a deprecation warning gate followed by removal. Open until a concrete reason to choose one over the other appears.

17.12. **Material theme: ContextualGroup adaptive triggers + auxiliary surfaces.** Once 5.11.3 (Ribbon) lands, the Material Theme needs to define its Ribbon templates + tokens. Separate from the framework gap in 5.11.3 — this is the Theme-side authoring once the controls exist.

17.13. **M3 dynamic-colour scheme generator.** Today `MaterialLight` / `MaterialDark` are hand-authored — every brush in [src/resources/material/light.mu](src/resources/material/light.mu) / [dark.mu](src/resources/material/dark.mu) is an explicit hex literal. M3's dynamic-colour story (see [m3-modernization-plan.md](m3-modernization-plan.md), reference catalogue in [material3-tokens.md](material3-tokens.md)) builds the entire 30-role system-colour map from a single seed via the CAM16-L\* "HCT" colour space: `CorePalette.of(seedArgb)` derives five tonal palettes (`a1` primary, `a2` secondary, `a3` tertiary, `n1` neutral, `n2` neutral variant) plus a fixed error palette; each role then picks a specific tone per scheme (`primary = a1.tone(40)` light / `a1.tone(80)` dark; `surface = n1.tone(99)` / `n1.tone(10)`; etc.). The integration shape mural needs: (a) vendor or port [material-color-utilities](https://github.com/material-foundation/material-color-utilities)'s TS package next to [visual-engine/brush.ts](src/visual-engine/brush.ts) — pure numeric library, no API surface impact; (b) a `makeDynamicScheme({ name, seed, isDark, variant? })` factory that runs `CorePalette.of(seed)` and emits a `defineScheme({ … })` whose token map composes 30 `SolidColorBrush`es from the palette/tone lookup, plus the shared shape/motion/typography pass-through; (c) a host helper `Material.UseDynamic(seedArgb, variant?)` that builds the light + dark pair, registers them on the singleton `Material` theme, and activates whichever matches the current ambient `PrefersColorScheme` DP. Variants from `DynamicScheme` (`TonalSpot` default, `Vibrant`, `Expressive`, `Fidelity`, `Content`, `Neutral`, `Monochrome`) rotate secondary/tertiary hues and pick different chroma ceilings — same generator, different per-variant tone tables. Rides for free on the `ThemeManager.Activated` event surface ([src/runtime/theme.ts](src/runtime/theme.ts) — added with 17.x ThemeSelector work) and the existing `DynamicResource` cascade: seed change = scheme swap = every bound brush re-resolves, no imperative refresh anywhere. Out of v1: user-wallpaper seed extraction (no browser API), `PrefersContrast=More` higher-chroma tone tables, per-role post-generation overrides, exposing `TonalPalette` itself as a first-class `.mu` value type (the generator hides palettes inside its closure). Slots in after Phase 1 (token rollout) and before Phase 2 (control rewrites) of the modernization plan — control templates are seed-agnostic.

---

## 18. M3 modernization follow-ups

Surfaced by the post-shipping self-review against [m3-modernization-plan.md](m3-modernization-plan.md) (Phases 0-9 + Appendix C + Phase 2.5 / Phase 3.5 Tier-1 close-out). Items 18.1-18.5 are *new* runtime / framework gaps that the Tier-1 work (SegmentedButton, ButtonGroup, SplitButton, FabMenu) exposed but couldn't fix in their own scope. 18.6-18.8 are plan-process debt. 18.9 lists the plan-explicit deferrals still awaiting demo motivation.

18.1. **`Visual.RenderTransform` DP.** The visual-engine ships `RotateTransform` / `ScaleTransform` / `TransformGroup` ([src/visual-engine/drawing/transform.ts](src/visual-engine/drawing/transform.ts)) at the geometry level — `MatrixTransform` is the only one consumed today, by `Slanted` / `Puffy` / `SplitButton` via `DrawingContext.PushTransform`. A Visual-level `RenderTransform` DP (animatable via `PropertyTransition`) would unlock: `FabMenu`'s spec-correct 45° icon rotation on open (currently snaps — see [fab-menu.ts](src/framework/fab-menu.ts) header), per-Visual scale / skew / rotate without geometry rewrites, `Slanted`-style shears as a declarative DP rather than the buildSquircleFigure shrink-then-skew workaround, and animated affordances across every control. Pairs with 16.1 (animation framework) — `RenderTransform` needs interpolation support to become a `MatrixAnimation` target.

18.2. **`Button.CornerRadius` DP.** `Button`'s chrome is fixed by its default template; consumers composing Button parts into a larger surface have no way to drive corner shape per-instance. `SplitButton` ([src/framework/split-button.ts](src/framework/split-button.ts)) had to fall back to raw `Border` halves with manual press-here-release-here gates rather than using `Button` parts with left-rounded / right-rounded corners. Same gap will bite any future composed-button surface (rounded segmented banks, custom toolbar groupings, button cards). Fix: register `Button.CornerRadiusKey` on the Button class and bind it through to `PART_Border.CornerRadius` in every Button variant template.

18.3. **Externally-writable layout DPs for Panel children.** `Panel` children's `Width` / `Height` / `Margin` are markup-author territory — a parent Panel that wants to drive child sizes (for hover-expand, accordion, drawer-like collapse) has to either clobber author intent or reach around the DP system. `ButtonGroup` ([src/framework/button-group.ts](src/framework/button-group.ts)) uses a `setTimeout`-driven polled tween over an internal `Map<Visual, lerpFraction>` because there's no Visual-level "AnimatedWidth" separate from the Local-tier `Width`. Result: custom easing curves and Storyboard interop are inaccessible to consumers who want a non-default expand cadence. Fix shape: either a `Visual.ArrangeWidth` DP that floats above Local-tier `Width` and feeds Arrange, OR an `ArrangeOverrideTransition` hook on Panel that lets the panel interpolate its own arrange decisions.

18.4. **`Storyboard.AddCompletedListener` reliability in Node tests.** `AnimationManager`'s `RafClock` falls back to `setInterval(16ms)` ([src/runtime/animation/raf-clock.ts](src/runtime/animation/raf-clock.ts)) when `requestAnimationFrame` is unavailable, but the resulting tick cadence doesn't reliably fire `Storyboard.AddCompletedListener` at expected wall-clock moments inside Node test fixtures. `FabMenu` had to schedule its deterministic unmount via `setTimeout(detachMenuChrome, DurationMs + (N-1)·StaggerMs)` rather than chain off the close storyboard. `ManualClock` ([src/runtime/animation/clock.ts](src/runtime/animation/clock.ts)) already exists for this; the gap is the wiring — `initTestApp` ([src/basic/tests/test-app.ts](src/basic/tests/test-app.ts)) doesn't swap it in. Fix: add a `initTestApp({ clock: 'manual' })` opt-in or a `Storyboard.AwaitCompleted` Promise that auto-resolves regardless of clock source.

18.5. **Inline-author popup body in markup (SplitButton, future fly-outs).** Attaching the same `Visual` to both the markup tree AND the `OverlayLayer` dual-parents it (the framework enforces single-parent on Visuals). `SplitButton`'s demo ([demo/demos/split-button/split-button.mjs](demo/demos/split-button/split-button.mjs)) constructs the popup `Border` in the `.mjs` bootstrap and assigns it to a `MenuPopup` VM DP — the `.mu` can't author it inline. Two viable shapes: (a) a `Visibility=Collapsed` / `Detached` analog that lets the popup `Border` sit in markup with zero layout footprint until the overlay adopts it, OR (b) a `PopupTemplate` DP on `SplitButton` (parallel to `ItemTemplate`) that instantiates a fresh popup Visual on every open. (b) plays nicer with the existing template system; (a) is lighter-weight for one-off popups.

18.6. **M3 audit batches A-E never tracked as discrete commits.** [m3-modernization-plan.md § Appendix B](m3-modernization-plan.md) calls for 19 per-control audit commits before each phase — Batch A (4) before Phase 2, Batch B (4) before Phase 7, Batch C (2) before Phase 8, Batch D (5) before Phase 9, Batch E (4) anywhere across Phases 5-9. Each audit applies an 8-point checklist (tokens-only, state-layer pattern, five-state pass, shape tokens, typography roles, density triggers, coarse-pointer targets, live theme swap). The work landed alongside its consuming phase commit but no commit message records which controls actually passed all 8 checks. Fix: one-pass audit per-control with a per-control commit if any check fails. Pairs with 17.7 (adaptive trigger coverage gaps) which lists the controls still missing density / pointer / contrast triggers.

18.7. **Phase 1 token audit — pre-M3 cleanup.** [src/resources/material/material.mu](src/resources/material/material.mu) currently catalogs 195 tokens; the M3 plan called for ~170. The extra ~25 are partly intentional (the Phase 7 spacing / list-height / disabled-opacity additions) but some pre-M3 tokens may still be in the catalog without documented rationale. Plan § 1.2 explicitly calls for "cross-check the existing 50-ish tokens against this list. Anything in the existing catalog that's NOT in M3 either (a) gets a documented rationale to keep, or (b) gets removed and call sites migrated." Unverified.

18.8. **Missing demos for shipped Phase 9 controls — Badge, Banner, BottomSheet.** Phase 9 shipped `Badge` (`BadgeVariant.Dot` / `BadgeVariant.Numeric`), `Banner` (a `ContentControl` for in-flow announcements), and `BottomSheet` (a `ContentControl` with a peek-vs-expanded posture). The original plan said "defer pending demo needs" but they got built anyway during Phase 9 close-out. Cross-cutting acceptance criterion #6 ("every new control gets a demo entry under `demo/demos/<name>/`") is unmet for these three. Fix: three small demos exercising each control's headline DP. Pairs with 18.6 — the audit batches would have caught this.

18.9. **Plan-explicit M3 spec deferrals — pending demo motivation.** Listed for completeness; each one ships when a concrete demo motivates it.
  - **`DatePicker` / `TimePicker`** ([m3-modernization-plan.md § 8.10](m3-modernization-plan.md)). Modal + Docked variants per M3 spec. No demo today.
  - **Bottom app bar** ([§ 5](m3-modernization-plan.md)). Companion to TopAppBar for mobile-shaped chromes. Defer "unless a demo asks for it."
  - **`Carousel`** ([§ Appendix A](m3-modernization-plan.md)). Horizontal hero-card scroller. No M3 demand surface in current roster.
  - **`SideSheet`** (Modal + Standard, Appendix A). M3 spec's docked side panel — closest mural analog is `Drawer`. A demo distinguishing the two would clarify which to ship and which to redirect to.
  - **`LoadingIndicator`** (M3 2024, distinct from `ProgressIndicator.Circular`). M3 2024 added a new explicit "still loading" indicator separate from the circular progress. Mural's `ProgressIndicator` (Linear + Circular) covers determinate + indeterminate progress; LoadingIndicator's headline difference is its variable-amplitude oscillation pattern.

