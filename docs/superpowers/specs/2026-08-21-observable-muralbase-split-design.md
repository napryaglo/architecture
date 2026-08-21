# Observable / MuralBase Split — Design

**Status:** Draft for review
**Date:** 2026-08-21
**Repos touched:** Mural (core), Plexus (mechanical rename follow-on)

## Goal

Introduce a lightweight, binding-capable base class — `Observable` — that
participates in mural data binding and `DataTemplate` dispatch **without** the
per-instance overhead of the dependency-property (DP) system, and reparent the
existing full-featured `Model` onto it (renamed `MuralBase`). The result is a
clean two-tier separation of concerns:

```
Observable   — change notification only (the INotifyPropertyChanged analog)
   ▲
MuralBase    — the full dependency-property system (was: Model; the DependencyObject analog)
   ▲
Visual       — visuals, controls, framework elements
```

## Motivation (context — not in scope to build here)

A larger effort wants diagram nodes to be **typed, per-concept model objects**
so an author can write, in markup:

```
DataTemplate [ DataType = Location ] { TextBlock [ Text = $label ] }
```

For that line to resolve, `Location` must be a real class, a node must be an
*instance* of it, and its fields (`$label`) must be bindable — which is exactly
what a mural `Model` provides today. But a real model can hold **millions** of
domain objects, and a `Model` per object is prohibitive (see Background). The
resolution is a tier split: the millions stay as plain data in the TODL graph,
and only the **bounded, realized** set of nodes shown on a diagram become
binding-capable objects. Those realized objects want binding + `DataTemplate`
dispatch but *not* the full DP machinery — hence `Observable`.

This spec delivers **only** that foundational split. The node-model work, the
generated per-concept classes, containment, and container nodes are downstream
specs (see Out of Scope).

## Background: the current architecture

- **`Model`** ([src/runtime/model.ts](../../../src/runtime/model.ts)) is
  mural's dependency-property base. Per instance it allocates
  `property_values: Map<string, EffectiveValueDescriptor>`
  ([model.ts:120](../../../src/runtime/model.ts#L120)); every *set* property
  adds a Map entry plus an `EffectiveValueDescriptor` (value + source +
  lazily-created listener list + animated slot + base source). It supports the
  full WPF-style property system: effective-value resolution across
  local/animated/bound/inherited/default sources, styles, triggers, animation,
  value inheritance, and attached properties. Property **schemas** are
  per-class (a `WeakMap` of descriptor bags,
  [model.ts:52](../../../src/runtime/model.ts#L52)) — registration is one-time
  and cheap; the per-instance EVD storage is the cost.
- **`Visual extends Model`**
  ([src/visual-engine/visual.ts:193](../../../src/visual-engine/visual.ts#L193)),
  so the DP base is shared by data view-models *and* the entire visual tree.
- **Binding observes its source only when it is a `Model`.** The path engine
  gates on `instanceof Model` and subscribes via the typed-key API —
  `current.AddPropertyChangedListener(key, cb)` and `get_property_value(key)`,
  keyed by `key.descriptor.ComposedKey`
  ([binding.ts:227,246,280,322](../../../src/runtime/binding/binding.ts#L280),
  [data-context-binding.ts:41](../../../src/runtime/binding/data-context-binding.ts#L41),
  [ancestor-binding.ts:85](../../../src/runtime/binding/ancestor-binding.ts#L85)).
  A non-`Model` source gets "a plain assignment" with no reactivity
  ([binding.ts:460](../../../src/runtime/binding/binding.ts#L460)). The engine
  already narrates itself in these terms — "the same binding callback that
  delivers INotifyPropertyChanged"
  ([binding.ts:377](../../../src/runtime/binding/binding.ts#L377)).
- **`DataTemplate` auto-resolution gates on `Model` too.** `ContentControl`
  resolves a `DataTemplate` for a non-Visual **`Model`** by matching
  `DataType === value.constructor`
  ([content-control.ts:94-95,154-157](../../../src/framework/base/content-control.ts#L154-L157)).

So two independent seams — binding source observation and `DataTemplate`
dispatch — both ask *"are you a `Model`?"* Anything that wants to be bound or
templated must be a `Model`, and therefore pays the DP tax.

### Cost, quantified

A `Model` with two set properties is roughly an order of magnitude heavier than
a plain `{ id, label, description }` object, plus a `Map` allocation per
instance, plus per-write cost (descriptor lookup → EVD creation →
`OnPropertyChanged` → listener notify). At millions of instances that is GBs of
memory and slow bulk construction. The domain model must therefore never be
materialized as `Model` instances; only the bounded realized set may be.

## Design

### The layering

`Observable` becomes the root of the binding-capable hierarchy; `MuralBase` (the
renamed `Model`) extends it and adds the DP system; `Visual` extends `MuralBase`.

- **Everything bindable is an `Observable`.** Binding and `DataTemplate` dispatch
  gate on `instanceof Observable`, which both `Observable` and `MuralBase`
  satisfy with a single real runtime check (TS interfaces have no
  `instanceof`; a shared base class does — this is why the split is
  inheritance, not a bare interface).
- **`MuralBase` is an `Observable` with the full property system.** It keeps
  every current behavior; it merely *inherits* the notification contract and
  *overrides* value storage/resolution.

### `Observable` — the contract

`Observable` is a minimal **name-based** `INotifyPropertyChanged` analog. It has
**no** `PropertyKey`, **no** descriptor registry, **no** effective-value
machinery — a subclass declares real typed fields and drives notification from
its own setters:

```ts
class Observable {
  // Lazily allocated on first subscribe: property NAME → callbacks.
  private _listeners?: Map<string, PropertyChangeCallback[]>;

  // Virtual — MuralBase overrides it (widened to string | PropertyKey).
  AddPropertyChangedListener(name: string, cb: PropertyChangeCallback): void;
  RemovePropertyChangedListener(name: string, cb: PropertyChangeCallback): void;

  // Subclass setters call this after writing the backing field, on real change.
  protected notify(name: string, oldValue: unknown, newValue: unknown): void;
}
```

A subclass property is a plain field + getter + setter that calls `RaisePropertyChanged`:

```ts
class Location extends Observable {
  private _label = '';
  get label(): string { return this._label; }
  set label(v: string) {
    const old = this._label;
    if (old === v) return;
    this._label = v;
    this.notify('label', old, v);
  }
}
```

`PropertyChangeCallback` is the **existing public** binding callback arity
`(owner, name: string, oldValue, newValue)` (from
[binding/effective-value.ts:10](../../../src/runtime/binding/effective-value.ts#L10)) —
the same shape the engine already delivers for `MuralBase`, so a single callback
type serves both source kinds.

**Storage (the whole point):** value lives in the subclass's own typed field —
no value Map, no descriptor, no `ComposedKey`. The only allocation `Observable`
itself owns is `_listeners`, created on first `AddPropertyChangedListener`. An
`Observable` that is never subscribed to allocates **nothing** beyond its
declared fields.

**What `Observable` deliberately does NOT have** (all of this stays on
`MuralBase`): `PropertyKey`, the per-class descriptor registry
(`RegisterProperty`, `property_bags`, `find_descriptor`, …), the
`EffectiveValueDescriptor` store, effective-value resolution across sources,
`PropertyValueSource` arbitration, styles, triggers, animation
(`SetAnimatedValue`/`ClearAnimatedValue`), value inheritance
(`_getInheritableDescriptors`), attached properties
(`RegisterAttachedProperty`), `OverrideMetadata`, and coerce/validate
callbacks. Calling any of these on a plain `Observable` is a compile-time type
error (the members live on `MuralBase`).

### `MuralBase` — the renamed `Model`

`MuralBase` **is today's `Model`, verbatim**, with two changes:

1. It `extends Observable` instead of nothing. The **entire** property system
   stays on `MuralBase` — `PropertyKey`, the static registry (`RegisterProperty`,
   `compose_key`, `property_bags`, `find_descriptor`, …), descriptors, and the
   `property_values` EVD store are all unchanged and unmoved.
2. It **overrides** the one virtual `Observable` declares —
   `AddPropertyChangedListener` — widening the parameter to `string |
   PropertyKey`: a `PropertyKey` routes to the existing EVD listener path
   (parity, byte-for-byte); a `string` resolves via `find_descriptor` to the
   key, then the same path. `RemovePropertyChangedListener` mirrors it.
   `PropertyKey` therefore appears only in `MuralBase`'s signature, never in
   `Observable`'s. `MuralBase` does **not** use `Observable`'s `_listeners`
   registry or `notify` — its notifications flow through the EVD listeners as
   they do today.

No `MuralBase` subclass changes behavior. `Visual extends MuralBase`.

### Retargeting the gates

Every current `instanceof Model` site is reclassified by **intent**, because
the two meanings now diverge:

- *"is this bindable / observable?"* → **`instanceof Observable`**, then
  **dual-branch** inside on `instanceof MuralBase` (key path) vs plain
  `Observable` (name/getter/setter path). Sites:
  - `binding.ts` source observation (the three `instanceof Model` checks at
    ~227/246/280), its teardown, and the two-way write-back.
  - `data-context-binding.ts` first-segment subscription
    ([:41](../../../src/runtime/binding/data-context-binding.ts#L41)).
  - `ancestor-binding.ts` ancestor subscription.
  - `content-control.ts` `DataTemplate` auto-resolution (non-Visual observable →
    match `DataType === value.constructor`; the dispatch key is unchanged, only
    the type gate widens).
- *"does this have the full DP system?"* (reaches for `RegisterAttachedProperty`,
  effective-value sources, animation, inheritance, `OverrideMetadata`) →
  **`instanceof MuralBase`**. These are the framework/visual-internal sites.

This classification is per-site and is the delicate core of the change — it is
**not** a blind find/replace. Each converted site is called out in the plan with
its chosen target and a one-line justification.

### The rename sweep

`Model` → `MuralBase` across both repos, mechanically but *after* the gate
classification above:

- Mural: the class, `Model.RegisterProperty` → `MuralBase.RegisterProperty`,
  every `extends Model`, every import, and every `instanceof Model` **that was
  classified as "full-DP"** (the "bindable" ones became `instanceof Observable`).
- Plexus: every `extends Model` → `extends MuralBase` and imports
  (`NodeViewModel`, `DiagramDocument`, `OpenProject`, and all VM subclasses).

### Data flow — binding a source (dual-branch, `MuralBase`-first)

The engine widens its gate from `instanceof MuralBase` to `instanceof
Observable`, then branches on the concrete type:

- **`source instanceof MuralBase`** → the existing path, unchanged: `resolveKey`
  → `PropertyKey`, `get_property_value(key)`, `AddPropertyChangedListener(key,
  cb)`, teardown `RemovePropertyChangedListener(key, cb)`. Zero behavioral diff.
- **plain `Observable`** → the name path:
  1. The segment's property name is used directly (no key resolution).
  2. Read `(source as Record<string, unknown>)[name]` — the subclass getter.
  3. Subscribe `source.AddPropertyChangedListener(name, onChanged)`; the
     callback receives `(owner, name, old, new)` — the same arity as the
     `MuralBase` branch, so downstream target-update code is shared.
  4. Two-way write-back sets `(source as Record<string, unknown>)[name] = value`
     — the subclass setter runs and fires `RaisePropertyChanged`.
  5. Teardown calls `source.RemovePropertyChangedListener(name, onChanged)`.

### Data flow — `DataTemplate` dispatch on an `Observable`

`ContentControl` auto-resolves a `DataTemplate` for any non-Visual
**`Observable`** by matching `DataType === value.constructor`. A plain
`Observable` subclass (e.g. a future generated `Location`) therefore dispatches
to `DataTemplate [ DataType = Location ]` exactly as a `Model` subclass does
today; the "no `DataTemplate` for this type" red diagnostic
([content-control.ts:204-209](../../../src/framework/base/content-control.ts#L204)) is
preserved and now names an `Observable` type.

## Error handling & edge cases

- **MuralBase-only APIs on an `Observable`:** compile-time type error
  (`PropertyKey`, `get/set_property_value`, `RegisterProperty`, and the rest
  live on `MuralBase`). The binding engine never reaches them on a plain
  `Observable` because it branches on `instanceof MuralBase` first.
- **Inherited/attached properties, animation, styles, triggers, bound-source
  arbitration, coerce/validate:** available only on `MuralBase`. A plain
  `Observable` field has exactly one source — its own value — so no arbitration
  exists to expose.
- **Read of an unwritten `Observable` field:** returns the field's declared
  initializer (ordinary JS), the subclass's chosen default.
- **Two-way binding into an `Observable`:** the engine assigns `source[name] =
  value`, running the subclass setter, which fires `RaisePropertyChanged`; no source
  arbitration because there is only the local field.

## Testing

Written first; parity is the gate.

- **Parity (regression) suite — the acceptance bar.** The full existing mural
  suite must pass unchanged: every current binding, `DataTemplate`, style,
  trigger, animation, inheritance, and attached-property test behaves
  identically after `Model → MuralBase extends Observable`. Zero behavioral
  diff for existing `MuralBase` subclasses and `Visual`.
- **`Observable` binds.** A plain `Observable` subclass with two field
  properties: a `TextBlock [ Text = $label ]` binding reflects the initial
  value, updates when the subclass setter runs (`notify`), and two-way writes
  back through the setter.
- **`DataTemplate` dispatch on `Observable`.** `DataType = <ObservableSubclass>`
  resolves and renders; an unmatched type shows the red diagnostic naming the
  type.
- **`instanceof Observable`** is true for both an `Observable` subclass and a
  `MuralBase`/`Visual` instance; `instanceof MuralBase` is false for a plain
  `Observable`.
- **Cost.** A micro-benchmark asserts an unbound `Observable` allocates no
  value Map and no listener Map (memory floor ≈ plain object + fields), and that
  N `Observable` instances use materially less memory / construct faster than N
  `MuralBase` instances with the same properties.

Every test file lives in a `tests/` subfolder next to the code it exercises.

## Migration & rollout

1. Mural core: add `Observable`; move shared static registration onto it;
   reparent `Model → MuralBase extends Observable`; retarget the classified
   gates; run the parity suite green.
2. Mural mechanical sweep: `extends Model` / imports / classified `instanceof`
   across mural's own subclasses.
3. Publish a mural **minor** version bump to the local registry **only when
   asked**.
4. Plexus: bump the mural dependency; mechanical `Model → MuralBase` sweep;
   run Plexus suite green.

Backward compatibility: no serialized format changes; no public API removed
(`MuralBase` carries the entire former `Model` surface). Consumers that imported
`Model` update the identifier only.

## Global constraints

- Publish `@pragmatic-lab/mural` **only** to the local Verdaccio registry, never
  public npm, and **only** when the user asks. Same for commit/push.
- A fixed set of named string values is a real TypeScript `enum`
  (`PropertyValueSource` already is) — never a string-literal union.
- Every test file in a `tests/` subfolder next to its source.
- No new string type-proxies: `DataType` stays a real class `Function`.

## Out of scope (downstream specs)

- The diagram **node-model split** (document holds node data models, all Figures
  view-generated) — Phase 1.
- **Entity-backed, per-concept generated node classes** (`class Location extends
  Observable`) and the js-module emitter retarget from `ModelElement` to
  `Observable`.
- **Containment** via a `@containment` relationship member and the arch-diagram
  binding that renders it as nesting.
- **Container nodes**: the `ItemsPresenter` child-host template, drag-reparent,
  hit-test/drop-zone, v4 persistence.
- `DataTemplate [ DataType = <concept> ]` authoring surface and the
  concept-discriminator template selector (the escape hatch if placed-per-diagram
  ever grows large).

Each of the above assumes this split has landed: nodes become `Observable`
subclasses, and binding + `DataTemplate` dispatch already work on them.
