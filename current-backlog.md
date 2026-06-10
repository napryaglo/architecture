# Current Backlog

Open gaps in the property/binding/control system compared to WPF. Closed items moved to [completed-backlog.md](completed-backlog.md) — section numbers preserved across both files so cross-references survive.

**Status:** Property / binding / inheritance / layout / render pipeline is feature-complete for WPF parity; the concrete-control roster covers Border, Grid (with shared-size groups), StackPanel, WrapPanel, DockPanel, Canvas, UniformGrid, VirtualizingStackPanel, VirtualizingWrapPanel, Button, ToggleButton, TextBlock, TextBox, ComboBox, ListBox, TreeView, Slider, SpinEdit, ScrollBar, ScrollViewer, ContentControl, ItemsControl, ControlTemplate, DataTemplate, Drawer, PageView, Diagram (with Selector-based multi-select + marquee), Thumb, Splitter, GridSplitter, ToolBar (+ ToolBarButton / ToolBarToggleButton / ToolBarSeparator with overflow popup), Menu / MenuButton / MenuItem / MenuSeparator (hamburger fly-out), ContextMenu (attached DP + right-click auto-open), and shapes (Ellipse, Line). 5.3 `Dispatcher` / thread affinity dropped — N/A for single-threaded JS. Test suite: 1650 tests passing.

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

5.15. **Migrate imperative `Theme.*` consumers to declarative bindings.** [src/Basic/theme.ts](src/Basic/theme.ts) was introduced as a bridge between imperative paint paths in controls (Slider thumb tinting, ScrollBar thumb hover, ComboBox border focus, Menu item hover, etc.) and the Material 3 token system that templates consume via `DynamicResource`. Each `Theme.x` getter resolves the matching M3 token from `Application.Resources` on every read, so theme swap (light ↔ dark) reflects in the next imperative refresh — but the call sites still mutate Visual props directly instead of binding declaratively. 15 src files import from `theme.ts` today; ~35 distinct read sites. Three migration categories:

  - **Hover / press / focus painters** — the prime candidates. `ScrollBar` thumb drag/hover/normal ([scroll-bar.ts:504-506](src/Basic/scroll-bar.ts#L504-L506)), `Slider` thumb drag/hover/normal ([slider.ts:488-490](src/Basic/slider.ts#L488-L490)), `SpinEdit` border focus/hover/normal ([spin-edit.ts:158-160](src/Basic/spin-edit.ts#L158-L160)), `ComboBox` selection / popup item / placeholder ([combo-box.ts:589-639](src/Basic/combo-box.ts#L589-L639)), `TreeView` row hover/selected ([tree-view.ts:689-690](src/framework/list/tree-view.ts#L689-L690)). All of these are state-driven and should lower to template `when(IsMouseOver)` / `when(IsPressed)` / `when(IsSelected)` triggers with `Background = @SurfaceContainerHigh` style setters reading the token via DynamicResource.

  - **Static-default callsites** — `Button.Foreground = Theme.primaryInk` ([button.ts:135](src/framework/button.ts#L135)), `PageView.subtitleText.Foreground = Theme.hint` ([page-view.ts:81](src/Basic/page-view.ts#L81)), `Thumb.Background = Theme.scrollThumb` ([thumb.ts:103](src/Basic/thumb.ts#L103)), `MenuStrip` text foreground ([menu-strip.ts:712](src/framework/menu/menu-strip.ts#L712)), `ToolBar` chrome border/background setup ([tool-bar.ts:126-147](src/framework/tool-bar/tool-bar.ts#L126-L147)). One-shot writes during template apply — should become `Setter` entries in the control's default `Style` reading the token via DynamicResource.

  - **Optional-public-API fallbacks** — `PreviewBrush ?? Theme.primary` ([splitter.ts:137](src/Basic/splitter.ts#L137), [grid-splitter.ts:210](src/Basic/grid-splitter.ts#L210)), `LineBrush ?? Theme.fieldBorder` ([menu-strip.ts:760](src/framework/menu/menu-strip.ts#L760), [tool-bar-items.ts:159](src/framework/tool-bar/tool-bar-items.ts#L159)), `brush ?? Theme.error` ([validation-error-adorner.ts:50](src/Basic/validation-error-adorner.ts#L50)), `Foreground ?? Theme.ink` ([text-block.ts:178](src/Basic/text-block.ts#L178)). These fall back to a theme token only when the consumer didn't override. Migration: register the DP default as a `DynamicResource` factory in the control's default Style, so unset consumers pick up the token via the resource chain instead of via `Theme.x` lookup at render time.

  **Residual after migration.** Two values stay framework-owned and would remain in `theme.ts` (or move to a smaller `defaults.ts`): `DEFAULT_FONT_FAMILY` (referenced at TextBlock DP-registration time, before any `Application` exists) and the preallocated `scrim` brush (M3's `Scrim` token registers as fully opaque black; we want ~40% black for popup dimming). The rest of `Theme` collapses once the consumers above migrate.

  **Pacing.** Per-control PRs — `ScrollBar`, `Slider`, `SpinEdit`, `ComboBox`, `TreeView` are the heaviest hover/state consumers and would benefit most. Static-defaults sweep is bookkeeping once the trigger-based migrations land.

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

12.1. **`DynamicResource` re-wiring on host re-parent.** `DynamicResource` walks the host's ancestor chain ONCE at construction and subscribes to every `Resources` dict it finds. Re-parenting the host afterwards, or an ancestor first-accessing its `Resources` (allocating its dict) after the DynamicResource was already built, doesn't re-wire. Covers the common case of consuming resources from a fixed Application / Window / templated control; not the case of moving controls between resource scopes at runtime.

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

