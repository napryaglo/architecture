# Current Backlog

Open gaps in the property/binding/control system compared to WPF. Closed items moved to [completed-backlog.md](completed-backlog.md) — section numbers preserved across both files so cross-references survive.

**Status:** Property / binding / inheritance / layout / render pipeline is feature-complete for WPF parity; the concrete-control roster covers Border, Grid (with shared-size groups), StackPanel, WrapPanel, DockPanel, Canvas, UniformGrid, VirtualizingStackPanel, VirtualizingWrapPanel, Button, ToggleButton, TextBlock, TextBox, ComboBox, ListBox, TreeView, Slider, SpinEdit, ScrollBar, ScrollViewer, ContentControl, ItemsControl, ControlTemplate, DataTemplate, Drawer, PageView, Diagram (with Selector-based multi-select + marquee), Thumb, Splitter, GridSplitter, ToolBar (+ ToolBarButton / ToolBarToggleButton / ToolBarSeparator with overflow popup), Menu / MenuButton / MenuItem / MenuSeparator (hamburger fly-out), ContextMenu (attached DP + right-click auto-open), and shapes (Ellipse, Line). Two-level Theme + Scheme architecture shipped — Material Theme with Light/Dark Schemes, six adaptive inherited DPs, opt-in `SchemeTransition` animation for Brush tokens via the DynamicResource hook. `Visual.RenderTransform` DP shipped with Rotate / Scale / Skew / Group transforms — animatable inner DPs flow through the implicit-transition engine. Selector keyboard navigation surface (arrow / Home / End / PageDown / PageUp / Shift / Ctrl / Space / Ctrl+A) shipped — TreeView adds Left / Right collapse / expand on top. Smooth scrolling DPs + marquee autoscroll + incremental items-change in virtualizing panels (§ 10.4-10.7) shipped. 5.3 `Dispatcher` / thread affinity dropped — N/A for single-threaded JS. Test suite: **2091 tests passing.**

**M3 modernization (Phases 0-9 + Appendix C + Phase 2.5 + Phase 3.5):** shipped — see [m3-modernization-plan.md](m3-modernization-plan.md) (strike-through markings show shipped state) and [completed-backlog.md § 18](completed-backlog.md). Open M3 follow-ups live in § 18 below.

## 1. `Visual` → `Element` split + downstream cleanups

The 3300-line [src/visual-engine/visual.ts](src/visual-engine/visual.ts) has accreted ~10 distinct subsystems behind a single class because [framework/control.ts:6-9](src/framework/control.ts#L6-L9) admits the up-front trade: *"`FrameworkElement` in mural is rolled into `Visual` — DataContext, Style, Resources, Triggers, Template are all already on Visual."* That collapse is the root cause of the file's size. The fix is to re-introduce the missing layer: a 2-tier split (not WPF's full 3-tier) where `Visual` keeps only the render/input core and a new `Element` owns the app-facing surface. Items 1.2-1.16 are the consequent cleanups — most land naturally on `Element` once the seam exists; a few stay on `Visual`. Sequenced so 1.1 (the split) goes first as scaffolding, 1.2-1.5 are mechanical zero-behavior pre-work, 1.6 builds the `Model` internals seam those collaborators will consume, 1.7-1.9 are the structural moves that populate `Element`, and 1.10-1.16 are independent.

1.1. **Introduce the `Element` layer between `Visual` and `Control` — WPF's UIElement / FrameworkElement seam.** The 2-tier split maps `Visual` to WPF's `UIElement` (input + layout *machinery* + render, no dimension knobs) and `Element` to WPF's `FrameworkElement` (DataContext, Style, dimension knobs, overrides `MeasureCore` to apply them). Skipping WPF's third tier (the bare `Visual` between UIElement and the renderer) is the simplification — mural has no `DrawingVisual` analog whose contract demands "render only, no input, no layout participation"; if one ever shows up it can extend `Model` directly or get its own base.

  **What `Visual` retains** (UIElement-tier): visual-tree wiring + host attachment, Render/RenderOverride/InvalidateVisual, render-side DPs (RenderTransform/Origin, Opacity, Effect, Clip, Background, Cursor, Visibility), the **layout entry points** (`Measure(availableSize)` / `Arrange(finalRect)`) + the cache state (`DesiredSize`/`RenderSize`/`ArrangedRect`/`_isMeasureValid`/`_isArrangeValid`/`_previousAvailableSize`) + InvalidateMeasure/InvalidateArrange, routed-event registry + input virtuals + `KNOWN_ROUTED_EVENTS`, input-state DPs (IsMouseOver/Pressed/Focused/HitTestVisible/DragOver), HitTestGeometry, Focus/Focusable, drag-source latch + IsDraggable/OnDragStart/AllowDrop, `_renderInvalidatedWhileDetached` recycle support.

  **What `Element extends Visual` owns** (FrameworkElement-tier): dimension DPs (Width/Height/Min/Max), Margin, HorizontalAlignment/VerticalAlignment, the dimension-aware constrained-sizing pipeline currently at [visual.ts:2403-2467](src/visual-engine/visual.ts#L2403-L2467) (Margin-subtract → resolveMinMax → MeasureOverride → clamp → Margin-add), DataContext + inheritance machinery + `walk_inherited`, logical-tree wiring + overlay children, Style + Resources + Triggers (StyleApplicator + TriggerHost + ResourceResolver from 1.6-1.8), DefaultStyleKey + theme resolution, Loaded/Unloaded, FindName/NameScope, Tag, ResourceDictionary, FindResource, ambient-theme hooks, DynamicResource re-wire, Behaviors (they hook Unloaded), IsEnabled — the one inheritable UIElement-tier DP, lives on `Element` because the inheritance machinery is Element-tier (input dispatch does an `instanceof Element` check before gating).

  **The `MeasureCore` / `ArrangeCore` seam.** This is how layout machinery lives on the lower tier while the dimension knobs live on the upper one — straight WPF mechanic. `Visual.Measure(availableSize)` handles cache short-circuit and Visibility=Collapsed → zero, then delegates to `protected MeasureCore(availableSize): Size`. `Visual.MeasureCore` defaults to `return this.MeasureOverride(availableSize)` — unconstrained, what a render-only Visual subclass would inherit. `Element.MeasureCore` overrides to do the Width/Height/Min/Max/Margin/Alignment dance around `MeasureOverride`. Same shape for `Arrange` → `ArrangeCore` → `ArrangeOverride`. Subclass authors keep overriding `MeasureOverride`/`ArrangeOverride` unchanged — the seam is invisible to them.

  **Migration shape.** `Control` continues to extend `Element` (gains CommandBindings/InputBindings as today). Existing non-templated bases migrate up: `Single`, `Panel`, `Shape` → `Element`. Touches the `extends` clause on every control file but mechanically — every control wants what `Element` has anyway. `Visual` stays unpopulated by current subclasses but stands ready as the explicit escape hatch for future render-only constructs (chart-point clouds, marquee overlays, gridline backdrops). Target shape: `Visual` ≈ 1500 lines (UIElement-tier), `Element` ≈ 1500 lines (FrameworkElement-tier), both individually testable. Naming: `Element` over `FrameworkElement` — shorter at use sites, no `UIElement` to disambiguate against.

1.2. **Lazy-allocate the seven eagerly-created collections.** Every `Visual` instance allocates `_styleSetterBindings`, `_triggerSetterBindings`, `_activeTriggers`, `_triggerSubscriptions`, `_eventTriggerSubscriptions`, `_styleSubscriptions`, `_dynamic_resource_listeners` at construction — typically all empty for the lifetime of the instance. Half the per-instance state is already lazy (`_routedListeners`, `_loadedListeners`, `_unloadedListeners`, `_overlayChildren`, `_namedStoryboards`, `_behaviors`, `_resources`); the other half should follow the same pattern. For a 1000-item virtualized `ListBox` that's seven empty collections × 1000 containers. All seven move to `Element` as part of 1.1; this lazy-init cleanup can land before or after the split. Mechanical, zero behavior change.

1.3. **Collapse the four `evaluate_*_trigger` methods into one transition primitive.** [visual.ts:1733-1911](src/visual-engine/visual.ts#L1733-L1911) — `evaluate_trigger`, `evaluate_multi_trigger`, `evaluate_data_trigger`, `evaluate_multi_data_trigger` all repeat the same 30-line skeleton (compute `matched`, diff against `_activeTriggers`, apply/unapply setters, fire enter/exit actions). The only thing that differs is how `matched` is derived. Extract `apply_trigger_transition(trigger, matched, isInitial)` and let each `install_*` supply its own match-evaluator closure. `MultiTrigger` is missing the "suppress enterActions on initial evaluation" comment its siblings carry — a subtle drift the unification would close. Trigger machinery moves to `Element` via 1.8.

1.4. **Fix `SETTER_WRITEBACK` symbol-stash on the Binding.** [visual.ts:1322-1330](src/visual-engine/visual.ts#L1322-L1330) stores TwoWay writeback metadata on the Binding via a Symbol-keyed slot. The bookkeeping maps (`_styleSetterBindings`, `_triggerSetterBindings`) are keyed by Setter; the metadata lives on the Binding. If a Setter shares its Binding across both tiers (the comment at [visual.ts:708-710](src/visual-engine/visual.ts#L708-L710) explicitly acknowledges *"the same Setter instance can legally appear in both"*), the second tier's apply clobbers the first's metadata. In practice `SetterFactory` produces a fresh Binding per tier so the clobber doesn't fire today, but the invariant is undocumented and unenforced. Fix: store writeback metadata in `Map<Setter, { evd, listener }>` parallel to the existing setter-binding maps; drop the symbol and the two `as unknown as { [SETTER_WRITEBACK]?: ... }` casts. The Map lives on `StyleApplicator` (1.7) after the split.

1.5. **Generator for `(logicalChildren + overlayChildren)` cascade loops.** The pattern at [visual.ts:2224-2229, 2237-2242, 2865-2866, 3000-3003, 3050-3052](src/visual-engine/visual.ts#L2224-L2229) is duplicated five times: iterate logical children, then if `_overlayChildren` exists, iterate those too. When the overlay-inclusion rule changes (it will — today's split exists because `logicalChildren` excludes overlays), five sites must move in lock-step. Replace with `*allLogicalDescendantSubtreeRoots(): Iterable<Element>` and shrink each cascade to a single `for` loop. Lives on `Element` (logical-tree concept).

1.6. **Retire the `_xxx_by_name` family from `Model`'s public surface — extract a single `resolveKey` factor instead.** [src/runtime/model.ts](src/runtime/model.ts) exposes eight by-name accessor pairs (16 overloads) that are clearly internal but live on the class because TypeScript has no package-private modifier:
  - `_add_property_changed_listener_by_name` / `_remove_property_changed_listener_by_name`
  - `_get_property_value_by_name` / `_set_property_value_by_name`
  - `_clear_value_by_name` / `_get_value_source_by_name`
  - `_set_animated_value_by_name` / `_clear_animated_value_by_name`

  These exist because mural's property system has two addressing modes — typed keys (`Visual.WidthKey`) for compile-time access, and `(owner, name)` strings for markup-compiled paths, all four trigger flavors, the animation engine, attached-DP cross-class lookup, `Binding.set_value` / `get_value`. The two-mode design is correct; what's wrong is that every operation is duplicated as a by-name variant rather than factored.

  Key insight: every `_xxx_by_name` method internally does the same two-step — resolve `(owner?, name)` → `PropertyKey`, then call the typed-key operation. Factor out just the resolution:

  ```ts
  // src/runtime/model-internals.ts
  export function resolveKey(model: Model, owner: Function | undefined, name: string): PropertyKey<unknown>;
  ```

  Callers chain it with the existing typed-key public methods on `Model`:

  ```ts
  import { resolveKey } from '@visualisation-sub/mural/runtime/model-internals.js';

  // trigger install (was _add_property_changed_listener_by_name + _get_property_value_by_name)
  const key = resolveKey(target, trigger.propertyOwner, trigger.propertyName);
  target.AddPropertyChangedListener(key, onChange);
  const current = target.get_property_value(key);

  // animation engine (was _set_animated_value_by_name)
  target.SetAnimatedValue(resolveKey(target, undefined, 'Width'), value);
  ```

  **Why this beats the original sketch** (a WeakMap-keyed accessor object with N wrapper methods):
  - **One function exposed instead of 8.** Model loses 16 overloads from its public surface and gains zero — the typed-key API already exists.
  - **String → key happens AT the boundary.** Internal code reads as ordinary property-system usage afterwards, not as "internal mode".
  - **Hot-loop callers can cache.** A trigger evaluator that hits the same property on every fire resolves the key once at install time and skips re-resolution per change — small perf win.
  - **Single audit gate.** Every name-based access goes through `resolveKey`, so future instrumentation (typo logging, descriptor-missing diagnostics, debug tracing) lives in exactly one place.

  Implementation choice — `resolveKey` as `protected` on `Model` vs free function in `model-internals.ts`. The free-function shape matches the [CLAUDE.md § Cross-class internals](CLAUDE.md) pattern and the existing case at [input-manager.ts:583-590](src/framework/input-manager.ts#L583-L590); `protected` is the cleaner pick if most call sites are in `Model` subclasses (likely — trigger install/evaluate, animation engine, binding sets all live on `Visual` or its descendants). Decide at implementation time based on actual call-site distribution.

  Same module bundles the Model-private bracket-access from 1.10 — `Model['find_descriptor']`, `Model['peek_property_bag']`, `this['property_values']` — as typed free functions: `findDescriptor(klass, name)`, `peekPropertyBag(klass)`, `propertyValues(model)`. Bracket casts at [visual.ts:1250, 1346, 3069](src/visual-engine/visual.ts#L1250) disappear.

  Sequence-critical: land 1.6 BEFORE 1.7 / 1.8 / 1.9 (StyleApplicator / TriggerHost / ResourceResolver extractions) so the freshly-extracted collaborators use `resolveKey + typed-key API` from day one rather than the legacy `_xxx_by_name` calls.

1.7. **Extract `StyleApplicator` collaborator on `Element`.** Pulls [visual.ts:1141-1396](src/visual-engine/visual.ts#L1141-L1396) (`refresh_active_style`, `apply_setter`, `unapply_setter`, both setter-binding maps, the writeback Map from 1.4) into its own type. `Element` retains a single `_styleApplicator` field; the eight `previous?.ResolveXxxTriggers()` diff loops inside `refresh_active_style` move with it. Uses the `model-internals.ts` surface from 1.6 for `(owner, name)` reads/writes. Pairs with 1.8 — both collaborators share the `apply_setter` surface and may end up siblings under a common `Element`-side owner.

1.8. **Extract `TriggerHost` collaborator on `Element`.** Pulls [visual.ts:1679-1911](src/visual-engine/visual.ts#L1679-L1911) into a collaborator: all five `install_*` / `uninstall_*` methods, the `apply_trigger_transition` primitive from 1.3, `_activeTriggers`, `_triggerSubscriptions`, `_eventTriggerSubscriptions`. Uses the `model-internals.ts` surface from 1.6 for property-listener add/remove + value reads. Pairs with 1.7.

1.9. **Extract `ResourceResolver` collaborator on `Element` + retire ThemeManager hooks.** [visual.ts:1048, 1067](src/visual-engine/visual.ts#L1048) — `_ambientTokenResolver` and `_ambientResourceTriggerDps` are process-global static slots ThemeManager mutates at module load. Comment admits the design: *"runtime layer can't import ThemeManager directly (theme/theme.ts already imports Visual), so the integration goes through a function-pointer hook."* This is the [feedback_avoid-hooks-do-more-design](memory/feedback_avoid-hooks-do-more-design.md) smell verbatim. Same pattern on `Application.current?.Resources` at [visual.ts:2004](src/visual-engine/visual.ts#L2004). Fix: a `ResourceResolver` collaborator on `Element` constructed with an ordered resolver-strategy chain (active Style's resources → ancestor walk → ambient → app → defaults). ThemeManager registers its strategy when constructing the resolver, not via a global slot. Eliminates the import-direction problem and the singleton coupling. The `Element` layer is the natural seam — `ThemeManager` imports `Element`, not `Visual`, so the cyclic concern goes away.

1.10. **`ElementCtor` type alias + consistent `@internal` discipline.** Two adjacent paper cuts:
  - **`Function` typing for class refs** at [visual.ts:292, 1129, 3057](src/visual-engine/visual.ts#L292): `RegisterReadOnlyProperty<Function | undefined>`, `get DefaultStyleKey(): Function | undefined`, `collect_inheritable_descriptors(klass: Function)`. Introduce `type ElementCtor = new (...args: any[]) => Element`; the `as new (...args: any[]) => Visual` cast at [visual.ts:1229](src/visual-engine/visual.ts#L1229) goes away. (`DefaultStyleKey` lives on `Element` post-split — only `Element` subclasses opt into theme styling.)
  - **Bracket-access bypass of TS access modifiers** at [visual.ts:2224](src/visual-engine/visual.ts#L2224): `c['refresh_styles_subtree']` and similar calls to protected `Visual`/`Element` methods from outside the receiver chain. Promote to `public _xxx` with `@internal` JSDoc, matching the existing convention used by `_setAmbientTokenResolver`, `_registerAmbientResourceTriggerDp`, `_subscribe_dynamic_resource`. (The `Model`-private bracket-access cases at [visual.ts:1250, 1346, 3069](src/visual-engine/visual.ts#L1250) — `Model['find_descriptor']`, `this['property_values']`, `Model['peek_property_bag']` — are covered by 1.6.)

1.11. **`Loaded` vs `Unloaded` asymmetry — surface in the name.** [visual.ts:1547-1553](src/visual-engine/visual.ts#L1547-L1553) admits the design: *"Unlike Loaded (which is fire-once per instance to match FrameworkElement.Loaded), Unloaded fires on EVERY detach."* Recycled containers (a `ListBoxItem` rebound across virtualized positions) lose `Loaded` after first attach but keep getting `Unloaded` each rebind. A behavior wired with a `(Loaded, Unloaded)` setUp/tearDown pair drifts after one cycle. Pick one: rename `Loaded` → `FirstLoaded` so the asymmetry is in the name; add a symmetric `Attached`/`Detached` pair alongside; or fire `Loaded` on every attach edge and accept the WPF-parity break. Both events live on `Element` post-split (matches WPF's `FrameworkElement.Loaded`).

1.12. **`Resources` getter triggers subtree cascades on first access.** [visual.ts:976-985](src/visual-engine/visual.ts#L976-L985) — touching `Resources` for the first time runs `refresh_styles_subtree()` + `refresh_dynamic_resources_subtree()`. A read-shaped API doing a tree walk is surprising in tests, in debuggers, and in code that just wants `Resources.Has(key)`. Fix: explicit `EnsureResources()` for the "I'm about to write into it" path; keep the getter cheap. Or defer the cascade to next layout via a dirty flag. Lives on `Element`.

1.13. **"Read-only" DPs aren't actually read-only — and the `Model.*WithKey` escape hatches are public, so even promoting them to `RegisterReadOnlyProperty` wouldn't enforce the contract.** Two coupled gaps:
  - **DP declaration side.** `IsMouseOver`, `IsPressed`, `IsFocused`, `IsDragOver` carry "read-only by convention" comments at [visual.ts:467, 487, 497](src/visual-engine/visual.ts#L467) but they're regular `RegisterProperty` — any consumer can write them through `set_property_value`. `DefaultStyleKey` is properly `RegisterReadOnlyProperty` (consumer writes throw via `require_writable`).
  - **Escape-hatch visibility side.** The privileged-write trio on `Model` — `set_property_value_with_key` ([model.ts:524](src/runtime/model.ts#L524)), `ClearValueWithKey` ([model.ts:423](src/runtime/model.ts#L423)), `RemoveValueWithKey` ([model.ts:460](src/runtime/model.ts#L460)) — are all `public`. The key (`Visual.IsMouseOverKey`) is itself `public static readonly`, so anyone with a class reference can call `model.set_property_value_with_key(IsMouseOverKey, true)` and bypass the contract entirely. The escape hatch was meant for the *registering class* (and its subclasses); leaving it `public` means "read-only" is a docstring claim, not an enforced invariant.

  Fix has two parts that have to land together:
  1. **Promote the input flags to `RegisterReadOnlyProperty`.** Eliminates the "anyone can write via `set_property_value`" path.
  2. **Promote the `WithKey` trio to `protected`.** External callers can no longer bypass; subclasses still use the escape hatch as today (Button writing `IsPressed` from its own `OnPointerDown`, ClickableBorder writing on press, etc.). For genuinely external writing authorities — `InputManager` writes `IsMouseOver` / `IsFocused` / `IsDragOver` from outside the `Visual` class hierarchy — `Visual` exposes typed `@internal` methods (`_setIsMouseOver(value)`, `_setIsFocused(value)`, `_setIsDragOver(value)`) that internally use the now-protected `WithKey` path. Matches the existing `_setAmbientTokenResolver` / `_registerAmbientResourceTriggerDp` convention.

  Net effect: the read-only contract becomes real (must extend `Visual` to write); `Model`'s public surface loses 3 methods that shouldn't have been there; the duck-typed by-name cast trick at [input-manager.ts:585-619](src/framework/input-manager.ts#L585-L619) (which exists today to dodge a Visual import cycle while still writing these "read-only" DPs) collapses into typed `_setXxx` calls. Coordinates with 1.6 — InputManager's current `(v as VisualWithDp)._set_property_value_by_name(…)` pattern is unrelated to read-only enforcement (it's an import-cycle workaround), but the typed `@internal` wrappers added here let it go away too. Stays on `Visual` (DP declarations) + `Model` (visibility change on the WithKey trio).

1.14. **`OnBeforeBaseValueWrite` couples Visual to EVD internals.** [visual.ts:2826-2846](src/visual-engine/visual.ts#L2826-L2846) — the implicit-transition engine needs to fire BEFORE the EVD updates because Animated-tier writes mask the new value and `OnPropertyChanged` would miss the edge. The hook is correctly placed but the design says "Visual knows EVD's tier ordering." Cleaner: EVD emits `OnBaseValueWriteRequest(descriptor, newValue)`; the transitions engine subscribes via that event. `Visual` stops carrying a pre-write hook that subclasses didn't ask for. Stays on `Visual` (animation engine is render-tier).

1.15. **`propagate_*` virtual quartet is mechanical boilerplate.** `propagate_target_to_visual_children`, `propagate_inheritance_to_logical_children`, `propagate_inheritance_for_logical_children`, `propagate_dynamic_resources_to_logical_children` — four virtuals overridden identically by `Single` and `Panel` to "call X on each child of the appropriate tree." Replace with `forEachVisualChild(fn)` on `Visual` and `forEachLogicalChild(fn)` on `Element`. `Single` overrides each as `if (this._child) fn(this._child)`; `Panel` as `for (const c of this._children) fn(c)`. The four `propagate_*` methods collapse to one-line bodies in the base.

1.16. **Small paper cuts.** Each ~15 min:
  - **Inconsistent private-field casing.** `_visualParent`/`_isMeasureValid` (camelCase) vs `_dynamic_resource_listeners` (snake_case) — same file. Pick one.
  - **Snapshot-then-iterate pattern repeated four times** at [visual.ts:1527, 1581, 2102, 3036](src/visual-engine/visual.ts#L1527). Extract `safeFire(set, ...args)`.
  - **`KNOWN_ROUTED_EVENTS` never validated at registration time.** [visual.ts:1503-1513](src/visual-engine/visual.ts#L1503-L1513) accepts any string; `AddRoutedEventListener('PointreDown', …)` silently subscribes to a name that will never fire. Type the parameter as a string-literal union or assert at registration.
  - **`_renderInvalidatedWhileDetached` is unilateral.** [visual.ts:631-639, 2080-2084](src/visual-engine/visual.ts#L631-L639) — no `_measureInvalidatedWhileDetached` companion. Either explain the asymmetry (measure invalidations during detach are routed differently?) or add the symmetric flag.
  - **Inconsistent error-handling policy.** `apply_setter` silently returns on missing descriptor; `AttachVisual` throws on self-parenting; EventTrigger logs to console; unknown routed-event names silently no-op. Pick a single policy: silent / log / throw.
  - **`Transitions` lazy getter writes through `set_property_value`** at [visual.ts:476-482](src/visual-engine/visual.ts#L476-L482) — a side-effecting getter that fires bindings on first read. Extract an explicit `EnsureTransitions()`.

**Recommended sequence.**
1. **1.1 first as scaffolding.** Introduce `Element` as an empty subclass of `Visual` and migrate `extends` clauses across the control library. Zero behavior change initially — everything still works because the methods all live on `Visual`. Locks in the seam.
2. **1.2-1.5 mechanical pre-work.** Lazy collections (1.2), trigger evaluate dedup (1.3), `SETTER_WRITEBACK` fix (1.4), cascade-loop generator (1.5). Risk-free, any order. Reduce the surface area to relocate in steps 1.7-1.9.
3. **1.6 — `model-internals.ts` module.** Prerequisite for the collaborator extractions: the new `StyleApplicator` / `TriggerHost` / `ResourceResolver` files import the clean by-name surface from day one rather than the legacy `_xxx_by_name` calls.
4. **1.7-1.9 structural moves into `Element`.** `StyleApplicator` → `Element` (1.7); `TriggerHost` → `Element` (1.8); `ResourceResolver` + ThemeManager-hook retirement → `Element` (1.9). Methods physically migrate from `Visual` to `Element`. Each is one PR.
5. **1.10-1.16 independent.** Can land alongside the structural moves or after; mostly local cleanups inside whichever layer their target lives on.

Target end-state: `Visual` ≈ 1500 lines (render + input + layout lifecycle); `Element` ≈ 1500 lines (DataContext + Style + Resources + Triggers + inheritance + logical tree); `Model` stays clean (zero `_xxx_by_name` methods on its public surface); `Control` unchanged; existing collaborators (StyleApplicator, TriggerHost, ResourceResolver) each in their own file with their own tests.

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

