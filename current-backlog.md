# Current Backlog

Gaps in the property/binding system compared to WPF. Ordered from biggest functional gaps down to nice-to-haves.

**Status:** 19 of the original 26 backlog items are done. The property/binding/inheritance system is functionally feature-complete for WPF parity. The remaining work splits between small correctness items (7.1) and bigger framework pieces (collection-change notification, layout/render pipeline, concrete controls). Test suite: 158 tests passing.

## 1. Value resolution (`EffectiveValueDescriptor` / `Model`)

1.1. **Coerced value is dead.** `EffectiveValuePriorities.CoercedValue` is declared as the top priority and `EffectiveValueDescriptor` has a `coerced_value` slot, but the setter never assigns to it. Coerce is also only run on first set (`Model.set_property_value`), so subsequent writes bypass coercion. WPF re-runs coerce on every effective-value recomputation.

1.2. **Animated value is dead.** Same story: enum slot exists, no API to set it.

1.3. ~~**No `ClearValue`.**~~ ✅ Done. `Model.ClearValue(property)` resets the property to its registered default, disposing any active binding (which also tears down its chain listeners). Listeners on the EVD itself are preserved. Throws on unregistered property; no-op when the property was never set.

1.4. ~~**No way to distinguish default vs explicit set.**~~ ✅ Done as part of 1.3. `Model.GetValueSource(property)` returns a `PropertyValueSource` enum value (`Default` / `LocalValue` / `Binding` / `CoercedValue` / `AnimatedValue` / `InheritedValue`). The enum is exported. Throws on unregistered property. Explicit-owner overload added with 5.1.

1.5. ~~**No property value inheritance.**~~ ✅ Done. Properties registered with `MetaData.Inherits` resolve via the parent chain when no local override is set. The resolved value caches per-instance in `EffectiveValueDescriptor` under a new `PropertyValueSource.InheritedValue` slot (so reads are O(1)). Cache lifecycle: `Attach` walks the new parent chain and fills inherited caches across the moved subtree; `Detach` clears them. Ancestor mutations cascade via `OnPropertyChanged` → `propagate_inheritance_for(property)` → descendants' `refresh_inherited` (re-walks). Local overrides act as cascade boundaries — `SetInheritedValue` returns early when a higher-priority source already owns the slot, and the chain stops without firing further. Bindings on ancestor properties expose their resolved value to descendants (never the `Binding` instance) because the walk reads `evd.value`, which dereferences bindings. Pinned by 11 tests in the "Property value inheritance" suite.

1.6. ~~**No read-only properties.**~~ ✅ Done. `Model.RegisterReadOnlyProperty(owner, name, default, meta, coerce?)` returns a `PropertyKey` that grants write privileges; the owner keeps it private. Public `set_property_value` / `ClearValue` (both implicit and explicit-owner overloads) throw `"...is read-only"` when called for a read-only property. Privileged `set_property_value_with_key(key, value)` and `ClearValueWithKey(key)` bypass the gate. Reads, listeners, bindings-as-readers all work unmodified — consumers can still bind to a read-only property as a source. `PropertyDescriptor` carries an `IsReadOnly` flag that walks the parent chain so `OverrideMetadata` preserves the read-only semantic across overrides. Re-registering an already-registered name as read-only throws (stricter than regular `RegisterProperty`, since duplicate calls would return different keys). Pinned by 12 tests in the "Read-only properties" suite.

## 2. Change notification

2.1. ~~**Listeners live on the *descriptor*, not the instance.**~~ ✅ Done. `Model.Add/RemovePropertyChangedListener` now route to per-instance `EffectiveValueDescriptor.changeListeners` via `ensure_effective_value`. `PropertyDescriptor.PropertyChanged` and its backing field were removed as dead code. Pinned by 5 tests in the "Per-instance PropertyChanged listeners" suite.

2.2. ~~**`EffectiveValueDescriptor.changeListeners` is dead code.**~~ ✅ Done as part of 2.1 — the slot is now the primary listener store.

2.3. ~~**No push-style binding notification.**~~ ✅ Done. `PropertyPath` now caches the resolved value and exposes `setOnValueChanged`. `Binding` proxies it. `EffectiveValueDescriptor`, when installing a binding, subscribes — chain mutations that alter the resolved value fire `OnPropertyChange(oldResolved, newResolved)` on the consumer's EVD, which in turn fires per-instance listeners. Detached when a binding is replaced. Pinned by 6 tests in the "Push-style binding notification on bound consumers" suite. Also: binding install now reports `(default, val.get_value())` instead of `(default, BindingInstance)`.

2.4. **No `INotifyCollectionChanged` integration.** Arrays in paths (`managers[2]`) don't notify when elements are added/removed/replaced. Bindings only re-resolve when *Models* in the chain change.

2.5. ~~**No listener disposal.**~~ ✅ Done. `PropertyPath.dispose()` removes `onChangedBound` from every chain Model and clears state; `Binding.dispose()` proxies to it. `EffectiveValueDescriptor.set value` now disposes the previous binding when one is replaced (by another binding or a local value), so chain Models actually shed their listener references instead of holding silenced ones. Dispose is idempotent. Pinned by 6 tests in the "Binding / PropertyPath disposal" suite, which assert listener counts on chain-Model EVDs via a test-side peek helper.

## 3. Binding ergonomics

3.1. ~~**No `IValueConverter`.**~~ ✅ Done. `Binding` accepts an optional `converter: ValueConverter` in its 4th `BindingOptions` argument. `convert(value)` runs source → target on every read (and on push notifications). `convertBack(value)` (optional) reverses on TwoWay / OneWayToSource writeback; bindings without it pass the writeback value through unchanged. Pinned by 5 tests in "Binding pipeline — ValueConverter".

3.2. ~~**No `FallbackValue` / `TargetNullValue`.**~~ ✅ Done. `BindingOptions` accepts `fallbackValue?` (substituted when the post-converter value is `undefined`) and `targetNullValue?` (substituted when it's `null`). Presence vs absence checked via `'field' in opts` so `undefined` can be passed as an explicit fallback. Both apply on `get_value` and on push notifications to consumer listeners. Pinned by 6 tests in "Binding pipeline — FallbackValue / TargetNullValue".

3.3. ~~**No `StringFormat`.**~~ ✅ Done. `BindingOptions.stringFormat?: string` applies `{0}` substitution after the converter. Composes with a user-supplied converter (converter runs first, format wraps the result). One-way only — TwoWay writeback bypasses the format and runs `convertBack` on the user-supplied converter (if any). Format strings without `{0}` placeholder yield themselves literally. Richer numeric/date format specifiers (`{0:0.00}`, `{0:HH:mm}`) can layer on later via `Intl.*`. Pinned by 5 tests in "Binding pipeline — StringFormat".

3.4. ~~**No `UpdateSourceTrigger` (PropertyChanged path).**~~ ✅ Done. `EffectiveValueDescriptor.set value` now routes non-Binding writes through an installed TwoWay or OneWayToSource binding instead of replacing it (WPF's `UpdateSourceTrigger=PropertyChanged` semantics — the common default). Source-side `set_property_value` fires the binding's push notification, which routes back through the consumer's `OnPropertyChange` — listeners see one transition. If the path is no longer writable (severed intermediate), the write falls back to local-replace so the user's value isn't silently lost. `LostFocus` and `Explicit` triggers aren't applicable in a headless property system. Pinned by 8 tests in the "Target-side writeback through TwoWay / OneWayToSource bindings" suite. Closes 3.9 as a side effect.

3.5. **No `ValidationRules`.** Values can't be rejected.

3.6. **No `MultiBinding` / `PriorityBinding`.** Combining multiple sources.

3.7. **No `RelativeSource` / `ElementName`.** Bindings always take a literal `source` object, no way to express "ancestor of type X" or "named element Y".

3.8. **No default-mode inference.** WPF reads `FrameworkPropertyMetadata.BindsTwoWayByDefault`; here mode defaults to OneWay regardless of the target property's metadata.

3.9. ~~**Binding.set_value is the only writeback path.**~~ ✅ Done as part of 3.4 — target-side `set_property_value` on a property holding a TwoWay/OneWayToSource binding now writes through to the source instead of replacing the binding.

## 4. Property metadata

4.1. ~~**`MetaData` enum is single-value.**~~ ✅ Done. `MetaData` is now a flag enum: `None=0`, `Measure=1`, `Arrange=2`, `Render=4`. Combine with bitwise OR (e.g. `MetaData.Measure | MetaData.Render`). Three helper predicates exported from the barrel: `affectsMeasure(meta)`, `affectsArrange(meta)`, `affectsRender(meta)`. Pinned by 6 tests in the "MetaData flag enum" suite.

4.2. **No `ValidateValueCallback`.** Coerce can normalize, but there's no "reject this value" hook.

4.3. ~~**No per-type metadata override.**~~ ✅ Done. `Model.OverrideMetadata(klass, property, opts)` creates a per-class descriptor whose `parent` references the inherited one. `PropertyDescriptor`'s `DefaultValue` / `MetaData` / `CoerceValue` getters fall through to the parent for fields not explicitly set (presence is checked via `'field' in own`, so `undefined` is preserved as an opinion). Repeated overrides chain. Also delivered as part of the same change: **property inheritance** — descriptors registered on a base class are now visible to subclass instances, courtesy of the registry switching from `Map<string, ...>` to `WeakMap<Function, ...>` and lookups walking the class prototype chain via the new `Model.find_descriptor` helper. The `RegisterProperty` signature now takes a class object (not a class-name string). Pinned by 10 tests in the "Property inheritance and metadata override" suite.

4.4. **No `IsAnimationProhibited` / `IsNotDataBindable`.** Fine-grained per-property opt-outs.

## 5. Architectural gaps

5.1. ~~**No attached properties.**~~ ✅ Done. Reframed as universal cross-class property usage — any property registered on any class can be set on any Model instance. `PropertyDescriptor` carries `Owner` (the class where this metadata lives) and `RootOwner` (the original registering class — used to compose the storage key, so overrides preserve identity). Per-instance values are keyed by composite `${RootOwner.name}.${name}` on the existing `property_values` map. Every accessor (`set_property_value`, `get_property_value`, `ClearValue`, `GetValueSource`, `Add/RemovePropertyChangedListener`) gained an explicit-owner overload alongside the existing implicit-owner form. `EVD`'s internal callback now passes the descriptor directly so `OnPropertyChanged` doesn't need to re-look it up. `Model.OnPropertyChanged` signature changed from `(name, old, new)` to `(descriptor, old, new)`. Inheritance machinery from 1.5 carried over with no structural change — the cascade is keyed on opaque strings, composite keys just plug in. `RegisterAttachedProperty` exists as a one-line synonym for readability at declaration sites. Property names containing `.` are rejected at registration time. Pinned by 11 tests in the "Cross-class / attached properties" suite. Design: see [attached-properties-design.md](attached-properties-design.md).

5.2. **No `Freezable` / immutability.** Useful for shareable value-type-like Models (Brushes, Geometries).

5.3. **No `Dispatcher` / thread affinity.** WPF DOs are thread-affine; here Models can be touched from anywhere.

5.4. **No layout / render pipeline.** `Visual.MarkMeasureDirty` / `MarkArrangeDirty` / `MarkRenderDirty` are no-op stubs. `Visual`'s `OnPropertyChanged` override fires them on every effective-value change of a Visual's property, but nothing consumes those calls. A real layout pass (measure → arrange) and render queue need to be built. Tree primitives are in place: `Visual` carries the parent link via `Attach`/`Detach`; `Single` (one-child slot) and `Panel` (children collection) extend `Visual` with the structural API.

5.5. **No concrete control / panel primitives.** No `Border`, `Grid`, `StackPanel`, `Button`, `TextBlock`, etc. The framework currently has only the abstract building blocks (`Model`, `Visual`, `Single`, `Panel`) and the property/binding system. Probably the next major chunk of work once the layout/render pipeline (5.4) exists.

## 6. Path parser

6.1. ~~**No attached-property syntax in path parser.**~~ ✅ Done. `PropertyPath.parse` now recognises the WPF `(Owner.Property)` syntax and mixes freely with regular dotted segments and indexed accessors (`dept.(Grid.Row).color`, `(Holder.List)[1]`, etc.). `PropertyPathSegment` carries an optional owner-class name; traversal routes attached segments through the explicit-owner overloads added in 5.1. Owner classes are resolved by name via `Model.find_class`, backed by a class-registry populated automatically by `RegisterProperty` / `OverrideMetadata`. The registry uses `WeakRef` values so test classes still GC normally. Unknown owner names in a path resolve to `undefined` (graceful); malformed `(...)` segments without a `.` throw at parse time. Pinned by 8 tests in the "PropertyPath attached-property syntax" suite.

6.2. **No type-qualified indexers.** WPF supports `[(sys:Int32)0]` to disambiguate indexer overloads. Probably fine to skip for JS.

---

## 7. Suggested priority order (next pass)

Most of the original priority list is done. What's left, ordered by impact-per-effort:

7.1. **Coerce on every set, not just first.** Currently coerce only runs when the EVD is first created. Subsequent sets bypass it. Closes the "1.1 coerce dead" gap meaningfully. One-line fix in `Model.set_via_descriptor`. ~5 lines + ~3 tests.

7.2. **`INotifyCollectionChanged` integration.** (Closes 2.4.) Required for collection bindings (Items / ItemSource patterns). Arrays in paths (`managers[2]`) don't notify when elements are added/removed/replaced. Bigger lift — needs an `ObservableArray` or `Proxy`-based wrapper plus `PropertyPath` integration. ~80 lines + meaningful tests.

7.3. **Layout / render pipeline (skeleton).** (Closes part of 5.4.) Even a no-op-but-traceable measure pass would let `MarkMeasureDirty` etc. become real. Probably the biggest unblock for moving the project forward — currently nothing visible can happen even though the property system is fully wired.

7.4. **Concrete control / panel primitives.** (Closes 5.5.) Builds on 7.3 — once the layout pipeline runs, populate `Border`, `Grid`, `StackPanel`, `Button`, `TextBlock`, etc.

### Smaller wins that have no dependencies

These each take an hour or two and round out the WPF parity:

- **3.5 `ValidationRules`** — value rejection at the binding boundary.
- **3.6 `MultiBinding`** — combine multiple source paths into one resolved value.
- **3.7 `RelativeSource` / `ElementName`** — named-element registry + ancestor lookup.
- **3.8 default-mode inference** — add `BindsTwoWayByDefault` to `PropertyMetadata`; `Binding` constructor consults the descriptor when mode isn't supplied.
- **4.2 `ValidateValueCallback`** — boolean-returning hook in `PropertyMetadata`. Tiny.
- **1.2 Animated value slot** — only meaningful once an animation engine exists.

### Done (history)

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

## 8. Architectural notes (for orientation)

- **`Visual` class — the visual-tree layer above `Model`.** `Model` is now a pure property/binding store. `Visual extends Model` adds: the parent link (`Attach`/`Detach`), the `MarkMeasureDirty`/`Arrange`/`Render` hooks, and an `OnPropertyChanged` override that consults the property's MetaData flags to fire those hooks and to cascade `Inherits` properties down the visual tree. Plain `Model` instances are pure storage — they participate in cross-class properties and bindings but not in the visual tree or in property value inheritance. `Single` and `Panel` extend `Visual`. This split anticipates the visualization engine: only `Visual` and its descendants will plug into the layout/render pipeline (5.4).
- **`OnPropertyChanged` virtual signature.** `(descriptor, old, new)` — receives the `PropertyDescriptor` directly. Internal callback path (`EVD.SetInternalCallback`) carries the descriptor so cross-class properties (5.1) dispatch without re-lookup. No-op on `Model`; overridden by `Visual` to route invalidation and inheritance. User-facing `PropertyChangedCallback` signature (passed to `Add/RemovePropertyChangedListener`) is unchanged — still `(model, name, old, new)`.
- **Composite-key storage.** All property values live on `Model.property_values: Map<string, EVD>` under `${descriptor.RootOwner.name}.${name}`. Applies uniformly to "regular" and "attached" usage. Listener attach paths go through the same map.
- **Two accessor surfaces, one core.** Every accessor (`set_property_value`, `get_property_value`, `ClearValue`, `GetValueSource`, `Add/RemovePropertyChangedListener`) has two overloads: implicit-owner (walks the target's class hierarchy via `find_descriptor`) and explicit-owner (`find_descriptor_on`). Both resolve to a `PropertyDescriptor` and then dispatch through a single shared body. Read-only properties add a third path via `PropertyKey`.
- **Binding pipeline.** `Binding.apply_transform(raw)` runs the value through (in order) `converter.convert` → `stringFormat '{0}'` substitution → `targetNullValue` (if null) → `fallbackValue` (if undefined). Applied on every `get_value` AND on push-notification callbacks to consumer listeners, with dedup on the post-pipeline value so a converter/formatter that collapses two raw values to one doesn't fire spurious change events. TwoWay writeback reverses only the converter (`convertBack`); StringFormat is one-way by design.
- **Class registry for cross-class path syntax.** `Model.find_class(name)` resolves a class-name string to its constructor, backed by a `WeakRef`-valued `Map` populated by `RegisterProperty` / `OverrideMetadata`. Used by `PropertyPath.parse` to resolve `(Owner.Property)` segments.
- **Module split.** `metadata.ts` (flags + predicates), `property-descriptor.ts` (schema), `effective-value.ts` (per-instance value + listeners + callbacks), `binding.ts` (`PropertyPath` + `Binding` + `ValueConverter` + `BindingOptions`), `model.ts` (`Model` + `PropertyKey`), `visual.ts` (`Visual` + `Single` + `Panel`). Barrel: `index.ts`.
