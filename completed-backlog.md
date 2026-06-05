# Completed Backlog

Items moved from [current-backlog.md](current-backlog.md) once closed. Section numbering matches the original backlog so cross-references survive. Test suite: 1278 tests passing.

## 1. Value resolution (`EffectiveValueDescriptor` / `Model`)

~~1.1. **Coerced value is dead.**~~ ✅ Done. `EffectiveValueDescriptor` now treats coerce as a transform applied on every effective-value read (not a stored base slot). `compute_base_value()` resolves the highest-priority base entry (Animated / Binding / Local / Trigger / Style / Inherited / Default); `value` overlays `descriptor.CoerceValue` on the result. The dead `coerced_value` field was removed; the `CoercedValue` enum value remains and is returned by `GetValueSource` iff a coerce callback is registered AND its result differs from the base (WPF-accurate diagnostic — "this isn't what you set"). `Model.set_via_descriptor` no longer pre-coerces on first set — raw values are stored, coerce runs on read. Default-value reads on properties without an EVD also flow through `resolve_default`, so a coerce callback gets to clamp the registered default. Binding push notifications transform old/new through coerce so listeners see the same values `value` returns. Side effect: coerce callbacks that depend on sibling model state re-evaluate automatically when that sibling changes (no explicit `CoerceValue(dp)` API needed yet). Pinned by 8 tests in the "Coerce on every effective-value recomputation" suite. Closes 7.1 as a side effect.

~~1.2. **Animated value is dead.** Same story: enum slot exists, no API to set it.~~ ✅ Done — closed by the animation engine landing (`src/runtime/animation/`: Clock, AnimationManager, Storyboard, Timeline). `EVD.SetAnimatedValue` / `ClearAnimatedValue` populate / drain the slot; `Model.SetAnimatedValue<T>(key)` and `_set_animated_value_by_name` are the public entry points; coerce-overlay integration pinned by 4 tests in "EVD animation slot — coerce integration" (animation.test.ts).

~~1.3. **No `ClearValue`.**~~ ✅ Done. `Model.ClearValue(property)` resets the property to its registered default, disposing any active binding (which also tears down its chain listeners). Listeners on the EVD itself are preserved. Throws on unregistered property; no-op when the property was never set.

~~1.4. **No way to distinguish default vs explicit set.**~~ ✅ Done as part of 1.3. `Model.GetValueSource(property)` returns a `PropertyValueSource` enum value (`Default` / `LocalValue` / `Binding` / `CoercedValue` / `AnimatedValue` / `InheritedValue`). The enum is exported. Throws on unregistered property. Explicit-owner overload added with 5.1.

~~1.5. **No property value inheritance.**~~ ✅ Done. Properties registered with `MetaData.Inherits` resolve via the parent chain when no local override is set. The resolved value caches per-instance in `EffectiveValueDescriptor` under a new `PropertyValueSource.InheritedValue` slot (so reads are O(1)). Cache lifecycle: `Attach` walks the new parent chain and fills inherited caches across the moved subtree; `Detach` clears them. Ancestor mutations cascade via `OnPropertyChanged` → `propagate_inheritance_for(property)` → descendants' `refresh_inherited` (re-walks). Local overrides act as cascade boundaries — `SetInheritedValue` returns early when a higher-priority source already owns the slot, and the chain stops without firing further. Bindings on ancestor properties expose their resolved value to descendants (never the `Binding` instance) because the walk reads `evd.value`, which dereferences bindings. Pinned by 11 tests in the "Property value inheritance" suite.

~~1.6. **No read-only properties.**~~ ✅ Done. `Model.RegisterReadOnlyProperty(owner, name, default, meta, coerce?)` returns a `PropertyKey` that grants write privileges; the owner keeps it private. Public `set_property_value` / `ClearValue` (both implicit and explicit-owner overloads) throw `"...is read-only"` when called for a read-only property. Privileged `set_property_value_with_key(key, value)` and `ClearValueWithKey(key)` bypass the gate. Reads, listeners, bindings-as-readers all work unmodified — consumers can still bind to a read-only property as a source. `PropertyDescriptor` carries an `IsReadOnly` flag that walks the parent chain so `OverrideMetadata` preserves the read-only semantic across overrides. Re-registering an already-registered name as read-only throws (stricter than regular `RegisterProperty`, since duplicate calls would return different keys). Pinned by 12 tests in the "Read-only properties" suite.

## 2. Change notification

~~2.1. **Listeners live on the *descriptor*, not the instance.**~~ ✅ Done. `Model.Add/RemovePropertyChangedListener` now route to per-instance `EffectiveValueDescriptor.changeListeners` via `ensure_effective_value`. `PropertyDescriptor.PropertyChanged` and its backing field were removed as dead code. Pinned by 5 tests in the "Per-instance PropertyChanged listeners" suite.

~~2.2. **`EffectiveValueDescriptor.changeListeners` is dead code.**~~ ✅ Done as part of 2.1 — the slot is now the primary listener store.

~~2.3. **No push-style binding notification.**~~ ✅ Done. `PropertyPath` now caches the resolved value and exposes `setOnValueChanged`. `Binding` proxies it. `EffectiveValueDescriptor`, when installing a binding, subscribes — chain mutations that alter the resolved value fire `OnPropertyChange(oldResolved, newResolved)` on the consumer's EVD, which in turn fires per-instance listeners. Detached when a binding is replaced. Pinned by 6 tests in the "Push-style binding notification on bound consumers" suite. Also: binding install now reports `(default, val.get_value())` instead of `(default, BindingInstance)`.

~~2.5. **No listener disposal.**~~ ✅ Done. `PropertyPath.dispose()` removes `onChangedBound` from every chain Model and clears state; `Binding.dispose()` proxies to it. `EffectiveValueDescriptor.set value` now disposes the previous binding when one is replaced (by another binding or a local value), so chain Models actually shed their listener references instead of holding silenced ones. Dispose is idempotent. Pinned by 6 tests in the "Binding / PropertyPath disposal" suite, which assert listener counts on chain-Model EVDs via a test-side peek helper.

## 3. Binding ergonomics

~~3.1. **No `IValueConverter`.**~~ ✅ Done. `Binding` accepts an optional `converter: ValueConverter` in its 4th `BindingOptions` argument. `convert(value)` runs source → target on every read (and on push notifications). `convertBack(value)` (optional) reverses on TwoWay / OneWayToSource writeback; bindings without it pass the writeback value through unchanged. Pinned by 5 tests in "Binding pipeline — ValueConverter".

~~3.2. **No `FallbackValue` / `TargetNullValue`.**~~ ✅ Done. `BindingOptions` accepts `fallbackValue?` (substituted when the post-converter value is `undefined`) and `targetNullValue?` (substituted when it's `null`). Presence vs absence checked via `'field' in opts` so `undefined` can be passed as an explicit fallback. Both apply on `get_value` and on push notifications to consumer listeners. Pinned by 6 tests in "Binding pipeline — FallbackValue / TargetNullValue".

~~3.3. **No `StringFormat`.**~~ ✅ Done. `BindingOptions.stringFormat?: string` applies `{0}` substitution after the converter. Composes with a user-supplied converter (converter runs first, format wraps the result). One-way only — TwoWay writeback bypasses the format and runs `convertBack` on the user-supplied converter (if any). Format strings without `{0}` placeholder yield themselves literally. Richer numeric/date format specifiers (`{0:0.00}`, `{0:HH:mm}`) can layer on later via `Intl.*`. Pinned by 5 tests in "Binding pipeline — StringFormat".

~~3.4. **No `UpdateSourceTrigger` (PropertyChanged path).**~~ ✅ Done. `EffectiveValueDescriptor.set value` now routes non-Binding writes through an installed TwoWay or OneWayToSource binding instead of replacing it (WPF's `UpdateSourceTrigger=PropertyChanged` semantics — the common default). Source-side `set_property_value` fires the binding's push notification, which routes back through the consumer's `OnPropertyChange` — listeners see one transition. If the path is no longer writable (severed intermediate), the write falls back to local-replace so the user's value isn't silently lost. `LostFocus` and `Explicit` triggers aren't applicable in a headless property system. Pinned by 8 tests in the "Target-side writeback through TwoWay / OneWayToSource bindings" suite. Closes 3.9 as a side effect.

~~3.8. **No default-mode inference.**~~ ✅ Done. `MetaData` gained a `BindsTwoWayByDefault` flag (with a matching `bindsTwoWayByDefault(meta)` predicate, exported from the barrel). `Binding`'s `mode` constructor argument is now optional and tracked as explicit-vs-default internally; on install, `EffectiveValueDescriptor.set value` calls `binding.ResolveDefaultMode(this.property_descriptor)` BEFORE any read of `binding.mode` (push-callback wiring, subsequent writeback). When the binding was constructed without an explicit mode and the target's metadata declares `BindsTwoWayByDefault`, the mode flips to `TwoWay`; explicit modes (including an explicit `OneWay`) always win — matches WPF's `FrameworkPropertyMetadataOptions.BindsTwoWayByDefault` precedence. Resolution happens at install time rather than in the constructor because the constructor doesn't know its eventual target. Pinned by 6 tests in the "Binding default-mode inference (BindsTwoWayByDefault)" suite.

~~3.9. **Binding.set_value is the only writeback path.**~~ ✅ Done as part of 3.4 — target-side `set_property_value` on a property holding a TwoWay/OneWayToSource binding now writes through to the source instead of replacing the binding.

## 4. Property metadata

~~4.1. **`MetaData` enum is single-value.**~~ ✅ Done. `MetaData` is now a flag enum: `None=0`, `Measure=1`, `Arrange=2`, `Render=4`. Combine with bitwise OR (e.g. `MetaData.Measure | MetaData.Render`). Three helper predicates exported from the barrel: `affectsMeasure(meta)`, `affectsArrange(meta)`, `affectsRender(meta)`. Pinned by 6 tests in the "MetaData flag enum" suite.

~~4.3. **No per-type metadata override.**~~ ✅ Done. `Model.OverrideMetadata(klass, property, opts)` creates a per-class descriptor whose `parent` references the inherited one. `PropertyDescriptor`'s `DefaultValue` / `MetaData` / `CoerceValue` getters fall through to the parent for fields not explicitly set (presence is checked via `'field' in own`, so `undefined` is preserved as an opinion). Repeated overrides chain. Also delivered as part of the same change: **property inheritance** — descriptors registered on a base class are now visible to subclass instances, courtesy of the registry switching from `Map<string, ...>` to `WeakMap<Function, ...>` and lookups walking the class prototype chain via the new `Model.find_descriptor` helper. The `RegisterProperty` signature now takes a class object (not a class-name string). Pinned by 10 tests in the "Property inheritance and metadata override" suite.

## 5. Architectural gaps

~~5.1. **No attached properties.**~~ ✅ Done. Reframed as universal cross-class property usage — any property registered on any class can be set on any Model instance. `PropertyDescriptor` carries `Owner` (the class where this metadata lives) and `RootOwner` (the original registering class — used to compose the storage key, so overrides preserve identity). Per-instance values are keyed by composite `${RootOwner.name}.${name}` on the existing `property_values` map. Every accessor (`set_property_value`, `get_property_value`, `ClearValue`, `GetValueSource`, `Add/RemovePropertyChangedListener`) gained an explicit-owner overload alongside the existing implicit-owner form. `EVD`'s internal callback now passes the descriptor directly so `OnPropertyChanged` doesn't need to re-look it up. `Model.OnPropertyChanged` signature changed from `(name, old, new)` to `(descriptor, old, new)`. Inheritance machinery from 1.5 carried over with no structural change — the cascade is keyed on opaque strings, composite keys just plug in. `RegisterAttachedProperty` exists as a one-line synonym for readability at declaration sites. Property names containing `.` are rejected at registration time. Pinned by 11 tests in the "Cross-class / attached properties" suite. Design: see [attached-properties-design.md](attached-properties-design.md).

~~5.4. **No layout / render pipeline.**~~ ✅ Done (skeleton). Per-Visual lifecycle (`Measure` / `Arrange` / `Render` + `MeasureOverride` / `ArrangeOverride` / `RenderOverride`), invalidation (`InvalidateMeasure` / `InvalidateArrange` / `InvalidateVisual`) with parent-walk cascade, the `VisualHost` interface, and concrete `PresentationTarget` / `HeadlessTarget` / `SvgDrawingContext` are all in place. The remaining piece — the host-side dirty queue + coalesced flush — was added by 7.3: `PresentationTarget` carries three `Set<Visual>` dirty queues (measure / arrange / render), invalidations populate them and `queueMicrotask`-schedule a single coalesced `Flush()` per task, and `HeadlessTarget.Render(dc)` drains layout via `Flush()` then walks the tree and clears the render set. Future refinements (granular subtree re-render, partial repaint, `requestAnimationFrame` scheduling on a future `HtmlTarget`) layer on top without disturbing the skeleton.

~~5.5. **No concrete control / panel primitives.** No `Border`, `Grid`, `StackPanel`, `Button`, `TextBlock`, etc. The framework currently has only the abstract building blocks (`Model`, `Visual`, `Single`, `Panel`) and the property/binding system.~~ ✅ Done. `src/Controls/` carries the full WPF-parity roster: `Border`, `Grid` + `SharedSizeGroup`, `StackPanel`, `Canvas`, `DockPanel`, `UniformGrid`, `VirtualizingStackPanel`, `Button`, `TextBlock`, `TextBox`, `ComboBox`, `ListBox`, `TreeView`, `Slider`, `SpinEdit`, `ScrollBar`, `ScrollViewer`, `ContentControl` + `ContentPresenter`, `ItemsControl` + `ItemsPresenter` + `ItemContainerGenerator`, `ControlTemplate` + `DataTemplate`, `Drawer`, `PageView`, `Diagram` + `DiagramNode`, plus shapes (`Ellipse`, `Line`) and the theme / default-resources scaffolding. Closes 7.4. Still missing from §5.6: `WrapPanel`.

## 6. Path parser

~~6.1. **No attached-property syntax in path parser.**~~ ✅ Done. `PropertyPath.parse` now recognises the WPF `(Owner.Property)` syntax and mixes freely with regular dotted segments and indexed accessors (`dept.(Grid.Row).color`, `(Holder.List)[1]`, etc.). `PropertyPathSegment` carries an optional owner-class name; traversal routes attached segments through the explicit-owner overloads added in 5.1. Owner classes are resolved by name via `Model.find_class`, backed by a class-registry populated automatically by `RegisterProperty` / `OverrideMetadata`. The registry uses `WeakRef` values so test classes still GC normally. Unknown owner names in a path resolve to `undefined` (graceful); malformed `(...)` segments without a `.` throw at parse time. Pinned by 8 tests in the "PropertyPath attached-property syntax" suite.

## 7. Suggested priority order — items closed

~~7.1. **Coerce on every set, not just first.**~~ ✅ Done as part of 1.1.

~~7.3. **Layout / render pipeline (skeleton).**~~ ✅ Done. `PresentationTarget` gained per-phase dirty `Set<Visual>` queues (`measureDirty` / `arrangeDirty` / `renderDirty`), populated by the now-real `OnMeasureInvalidated` / `OnArrangeInvalidated` / `OnRenderInvalidated` hooks. The first invalidation per task schedules a single `queueMicrotask` that drains via `Flush()`, so N property mutations in one task coalesce into one layout pass. `Flush()` runs measure + arrange root-down (Visual's own `_isMeasureValid` / `_isArrangeValid` caches make untouched subtrees O(1)), publishes the resolved surface size via `SetActualSize`, and clears the layout sets. The render set persists across `Flush()` — only an actual render pass drains it. `HeadlessTarget.Render(dc)` was rewritten to call `Flush()` first (factoring the measure/arrange computation out of its previous one-shot body), then paint background + walk the tree, then clear `renderDirty`. Public `HasPendingLayout` / `HasPendingRender` getters are exposed for tests and for renderers that want to skip frames. Pinned by 15 tests in `presentation-target.test.ts` covering queue population, dedupe, multi-flag fan-out, microtask coalescing, explicit-vs-auto flush, layout-only drain semantics, and the rewritten `Render(dc)` flow.

~~7.4. **Concrete control / panel primitives.** (Closes 5.5.) Builds on 7.3 — populate `Border`, `Grid`, `StackPanel`, `Button`, `TextBlock`, etc.~~ ✅ Done — closed by 5.5. Remaining panel-roster gap (`WrapPanel`) tracked at 5.6.

## 9. Declarative behaviors in markup

~~9.1. **Behavior collection attached property + markup vocabulary.**~~ ✅ Done. The `.mu` compiler parses `Behaviors { … }` blocks (`compileBehaviorsBlock` in [src/compiler/compiler.ts](src/compiler/compiler.ts)), resolves behavior class references through the symbol table the same way control types are resolved, emits per-entry property bindings, and wires `AddBehavior` calls post-materialization. The `Visual.AddBehavior` plumbing auto-wires the returned detach against the Visual's `Unloaded` edge (see Behaviors v2 work). Pinned by tests in `src/compiler/tests/behaviors.test.ts`. Original concrete shape from the design discussion, for posterity:

  ```
  ListBox x:name="leftList" [ItemsSource=$LeftItems, ...] {
      Behaviors {
          ListBoxDropBehavior [Vm=$, Side=Left]
      }
  }
  ```

  Compiler responsibilities: parse `Behaviors { … }` as a typed collection, resolve behavior factory names through the same registry the symbol table already uses for control types, emit per-entry property bindings. Runtime responsibilities: invoke `attach(owner, opts)` post-materialization, store the returned `detach` thunk on the visual, fire it on `OnUnloaded`. Acceptance criterion: `drag-drop.mu` wires `ListBoxDropBehavior` from markup, and `drag-drop.mjs` loses its `attachListBoxDrop(view)` calls + the `FindName` glue around them. Pairs with the future drag-reorder helper (8.5) which also wants markup-side attachment.

---

## Done (history)

Coarse-grained log of closures, in roughly the order they shipped:

- ~~Per-instance listeners (2.1 / 2.2)~~
- ~~Push-style binding notification (2.3)~~
- ~~Listener cleanup on disposal (2.5)~~
- ~~`ClearValue` + value-source query (1.3 / 1.4)~~
- ~~Property inheritance (1.5)~~
- ~~Read-only properties via `PropertyKey` (1.6)~~
- ~~`MetaData` flag enum (4.1)~~
- ~~Metadata override + property inheritance through class hierarchy (4.3)~~
- ~~Attached / cross-class properties (5.1)~~
- ~~Attached-property syntax in `PropertyPath` (6.1)~~
- ~~`IValueConverter` (3.1)~~
- ~~`FallbackValue` / `TargetNullValue` (3.2)~~
- ~~`StringFormat` (3.3)~~
- ~~Target-side TwoWay writeback (3.4 / 3.9)~~
- ~~Default-mode inference via `BindsTwoWayByDefault` (3.8)~~
- ~~Layout / render pipeline skeleton — dirty queue + microtask flush (5.4 / 7.3)~~
- ~~Coerce on every effective-value recomputation (1.1 / 7.1)~~
- ~~Animated value slot wired to animation engine + coerce overlay (1.2)~~
- ~~Concrete control + panel roster (5.5 / 7.4)~~
- ~~Grid + UniformGrid panels with attached row/column props + shared-size groups (part of 5.6)~~
- ~~Declarative `Behaviors { … }` block in markup (9.1)~~

## Architectural notes (for orientation)

- **`Visual` class — the visual-tree layer above `Model`.** `Model` is now a pure property/binding store. `Visual extends Model` adds: the parent link (`Attach`/`Detach`), the `MarkMeasureDirty`/`Arrange`/`Render` hooks, and an `OnPropertyChanged` override that consults the property's MetaData flags to fire those hooks and to cascade `Inherits` properties down the visual tree. Plain `Model` instances are pure storage — they participate in cross-class properties and bindings but not in the visual tree or in property value inheritance. `Single` and `Panel` extend `Visual`. This split anticipates the visualization engine: only `Visual` and its descendants will plug into the layout/render pipeline (5.4).
- **`OnPropertyChanged` virtual signature.** `(descriptor, old, new)` — receives the `PropertyDescriptor` directly. Internal callback path (`EVD.SetInternalCallback`) carries the descriptor so cross-class properties (5.1) dispatch without re-lookup. No-op on `Model`; overridden by `Visual` to route invalidation and inheritance. User-facing `PropertyChangedCallback` signature (passed to `Add/RemovePropertyChangedListener`) is unchanged — still `(model, name, old, new)`.
- **Composite-key storage.** All property values live on `Model.property_values: Map<string, EVD>` under `${descriptor.RootOwner.name}.${name}`. Applies uniformly to "regular" and "attached" usage. Listener attach paths go through the same map.
- **Two accessor surfaces, one core.** Every accessor (`set_property_value`, `get_property_value`, `ClearValue`, `GetValueSource`, `Add/RemovePropertyChangedListener`) has two overloads: implicit-owner (walks the target's class hierarchy via `find_descriptor`) and explicit-owner (`find_descriptor_on`). Both resolve to a `PropertyDescriptor` and then dispatch through a single shared body. Read-only properties add a third path via `PropertyKey`.
- **Binding pipeline.** `Binding.apply_transform(raw)` runs the value through (in order) `converter.convert` → `stringFormat '{0}'` substitution → `targetNullValue` (if null) → `fallbackValue` (if undefined). Applied on every `get_value` AND on push-notification callbacks to consumer listeners, with dedup on the post-pipeline value so a converter/formatter that collapses two raw values to one doesn't fire spurious change events. TwoWay writeback reverses only the converter (`convertBack`); StringFormat is one-way by design.
- **Class registry for cross-class path syntax.** `Model.find_class(name)` resolves a class-name string to its constructor, backed by a `WeakRef`-valued `Map` populated by `RegisterProperty` / `OverrideMetadata`. Used by `PropertyPath.parse` to resolve `(Owner.Property)` segments.
- **Module split.** `metadata.ts` (flags + predicates), `property-descriptor.ts` (schema), `effective-value.ts` (per-instance value + listeners + callbacks), `binding.ts` (`PropertyPath` + `Binding` + `ValueConverter` + `BindingOptions`), `model.ts` (`Model` + `PropertyKey`), `visual.ts` (`Visual` + `Single` + `Panel`). Barrel: `index.ts`.
