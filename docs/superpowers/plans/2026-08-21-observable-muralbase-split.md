# Observable / MuralBase Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split mural's property base into a lightweight `Observable` (change
notification only) and the DP-bearing `MuralBase` (renamed `Model`, `extends
Observable`), so data objects can bind and dispatch `DataTemplate`s without the
per-instance dependency-property overhead.

**Architecture:** `Observable` owns the per-class static registry and a light
instance store (lazily-allocated value map + listener map). `MuralBase extends
Observable` and overrides the instance side with the existing
`EffectiveValueDescriptor` system. Binding and `DataTemplate` dispatch gate on
`instanceof Observable`; the full DP system stays gated on `instanceof MuralBase`.
`Visual extends MuralBase`.

**Tech Stack:** TypeScript (strict, ESM), mural runtime + compiler; tsx/node test runner.

**Spec:** [docs/superpowers/specs/2026-08-21-observable-muralbase-split-design.md](../specs/2026-08-21-observable-muralbase-split-design.md)

## Global Constraints

- Publish `@pragmatic-lab/mural` **only** to the local Verdaccio registry
  (`http://localhost:4873`), never public npm, and **only** when the user asks.
  Commit/push only when the user asks. Work happens on branch
  `feat/observable-muralbase-split` (already created).
- A fixed set of named string values is a real TypeScript `enum`, never a
  string-literal union.
- Every test file lives in a `tests/` subfolder next to the code it exercises.
- No new string type-proxies: `DataType` stays a real class `Function`;
  `DataTemplate` dispatch stays keyed on `value.constructor`.
- The **parity gate** is absolute: after every task the full mural suite is
  green with **zero behavioral change** for existing `MuralBase`/`Visual`
  subclasses. Run `npm test` (the mural suite) at each task's verification step.
- No public API is removed — `MuralBase` carries the entire former `Model`
  surface; the only consumer-visible change is the identifier `Model` →
  `MuralBase`.

---

## File Structure

- `src/runtime/model.ts` — today's `Model`. Task 1 renames the class to
  `MuralBase` (file may stay `model.ts`); Task 2 removes the static registry
  (moved to `observable.ts`) and reparents `MuralBase extends Observable`,
  keeping the EVD instance implementation as overrides.
- `src/runtime/observable.ts` — **new**. `Observable`: the static registry +
  light instance store + notification surface.
- `src/runtime/model-internals.ts` — `resolveKey` and friends; unchanged in
  behavior, but `resolveKey`/`compose_key` lookups now resolve against
  `Observable`'s registry (inherited by `MuralBase`).
- `src/runtime/binding/binding.ts`, `data-context-binding.ts`,
  `ancestor-binding.ts` — the source-observation gates: `instanceof Model` →
  (Task 1) `instanceof MuralBase` → (Task 3) `instanceof Observable`.
- `src/framework/base/content-control.ts` — the `DataTemplate` auto-resolution
  gate: same progression.
- `src/visual-engine/visual.ts` — `class Visual extends Model` → `extends MuralBase`.
- `src/compiler/*.ts` — `Model.find_class` / descriptor lookups → `MuralBase`.
- `src/runtime/index.ts` (and any barrels) — export `Observable`; rename the
  `Model` export to `MuralBase`.
- Tests: `src/runtime/tests/observable.test.ts` (new), plus additions under
  `src/framework/base/tests/` and `src/runtime/binding/tests/`.

---

## Task 1: Mechanical rename `Model` → `MuralBase`

Pure rename, zero behavior change. Isolated so the giant diff is reviewable
against the parity suite. `Observable` does not exist yet; every current
`instanceof Model` becomes `instanceof MuralBase` (semantics unchanged — the
bindable subset is relaxed to `Observable` in Task 3).

**Files:**
- Modify: `src/runtime/model.ts` (class decl + self-references), `src/runtime/index.ts` (export), `src/visual-engine/visual.ts:193`, every file with `extends Model` / `import { Model }` / `Model.` / `instanceof Model` across `src/**` (runtime, framework, visual-engine, compiler), and `.mu`/template-facing symbol tables if `Model` is a registered symbol.
- Test: no new tests; the existing suite is the gate.

**Interfaces:**
- Produces: the identifier `MuralBase` in place of `Model` everywhere, with an
  identical public surface (`MuralBase.RegisterProperty`, `get/set_property_value`,
  `AddPropertyChangedListener`, `instanceof MuralBase`, …).

- [ ] **Step 1: Inventory every reference.** Run and save the list:
  `git grep -nE '\bModel\b' -- 'src/**/*.ts' 'src/**/*.mu'` and separately
  `git grep -n 'instanceof Model' -- src`. Confirm which `Model` tokens are the
  class (vs unrelated identifiers like `DiagramModel`, `dataModel` variables).
- [ ] **Step 2: Rename the class and its file-internal references.** In
  `src/runtime/model.ts`, `export class Model` → `export class MuralBase`, and
  every internal `Model.` static self-reference (`Model.property_bags`,
  `Model.find_descriptor`, `Model.remember_class`, `Model.compose_key`,
  `Model.inheritable_generation`, …) → `MuralBase.`.
- [ ] **Step 3: Rename the export.** In `src/runtime/index.ts` (and any barrel)
  export `MuralBase` instead of `Model`. If a compiler symbol table registers
  `Model` as a markup-visible type, rename that entry to `MuralBase`.
- [ ] **Step 4: Sweep consumers.** Across `src/**`: `extends Model` → `extends
  MuralBase` (notably `src/visual-engine/visual.ts:193`), `import { Model }` →
  `import { MuralBase }`, `Model.RegisterProperty`/`Model.RegisterAttachedProperty`/
  `Model.find_class`/`Model.HasProperty`/`Model.EnumerateProperties` → `MuralBase.*`,
  and `instanceof Model` → `instanceof MuralBase` (all sites, for now).
- [ ] **Step 5: Typecheck.** Run `npx tsc --noEmit` (or the project's typecheck
  script). Expected: clean — a missed reference surfaces as an unresolved
  `Model`.
- [ ] **Step 6: Run the full suite.** `npm test`. Expected: all green,
  identical counts to before the rename (behavior-preserving).
- [ ] **Step 7: Commit.**
  ```bash
  git add -A
  git commit -m "refactor(runtime): rename Model -> MuralBase (mechanical, no behavior change)"
  ```

---

## Task 2: Introduce `Observable`; reparent `MuralBase extends Observable`

Extract the per-class static registry and a light instance store into a new
`Observable`, and make `MuralBase` extend it while overriding the instance side
with its existing EVD implementation. `MuralBase` behavior is unchanged.

**Files:**
- Create: `src/runtime/observable.ts`
- Modify: `src/runtime/model.ts` (remove moved statics; `extends Observable`;
  keep EVD instance methods as overrides), `src/runtime/index.ts` (export
  `Observable`), `src/runtime/model-internals.ts` (ensure `resolveKey`/registry
  lookups reference `Observable`'s statics — inherited by `MuralBase`, so
  call sites keyed off a class still resolve).
- Test: `src/runtime/tests/observable.test.ts`

**Interfaces:**
- Consumes: `PropertyKey<T>`, `PropertyDescriptor` (with `.ComposedKey`, `.Name`,
  `.RootOwner`, `.DefaultValue`, `.CoerceValue`, `.ValidateValue`), `MetaData`,
  `PropertyChangeCallback` — all existing types, unchanged.
- Produces: `class Observable` with:
  - Static (moved from `MuralBase`): `RegisterProperty`, `RegisterReadOnlyProperty`,
    `compose_key`, `get_property_bag`, `peek_property_bag`, `find_descriptor`,
    `HasProperty`, `find_class`, `EnumerateProperties`, `remember_class`,
    and the `property_bags` / `class_registry` maps.
  - Instance: `get_property_value<T>(key)`, `set_property_value<T>(key, v)`,
    `AddPropertyChangedListener(key, cb)`, `RemovePropertyChangedListener(key, cb)`,
    protected virtual `OnPropertyChanged(descriptor, old, new)`.
  - `MuralBase` keeps and **overrides**: the EVD store (`property_values`),
    `ensure_effective_value_for`, `new_effective_value`, `set_via_descriptor`,
    `AddBaseValueWriteListener`, `SetAnimatedValue`/`ClearAnimatedValue`,
    `ClearValue`/`GetValueSource`, `RegisterAttachedProperty`, `OverrideMetadata`,
    and the inheritable-descriptor statics.

- [ ] **Step 1: Write the failing test** — `src/runtime/tests/observable.test.ts`:
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { Observable, MetaData } from '../index.js';

  class Loc extends Observable {
    static LabelKey = Observable.RegisterProperty<string>(Loc, 'label', '', MetaData.None);
    get label() { return this.get_property_value(Loc.LabelKey); }
    set label(v: string) { this.set_property_value(Loc.LabelKey, v); }
  }

  test('Observable stores + notifies without the EVD system', () => {
    const l = new Loc();
    assert.equal(l.label, '');                         // default before set
    const seen: string[] = [];
    l.AddPropertyChangedListener(Loc.LabelKey, (_o, _d, _old, nv) => seen.push(nv as string));
    l.label = 'Azure';
    assert.equal(l.label, 'Azure');
    assert.deepEqual(seen, ['Azure']);
  });

  test('an unbound Observable allocates no per-property EVD map', () => {
    const l = new Loc();
    // No value written, no listener attached: the light stores stay unallocated.
    assert.equal((l as unknown as { _values?: unknown })._values, undefined);
    assert.equal((l as unknown as { _listeners?: unknown })._listeners, undefined);
  });
  ```
- [ ] **Step 2: Run it — expect failure** (`Observable` not exported yet).
  `npx tsx --test src/runtime/tests/observable.test.ts` → FAIL.
- [ ] **Step 3: Create `src/runtime/observable.ts`** with the static registry
  moved verbatim from `model.ts` (the members listed under Produces) and this
  light instance implementation:
  ```ts
  export class Observable {
    // ── static registry moved from MuralBase (verbatim) ──
    //   property_bags, class_registry, get_property_bag, peek_property_bag,
    //   compose_key, find_descriptor, HasProperty, find_class,
    //   EnumerateProperties, remember_class, RegisterProperty,
    //   RegisterReadOnlyProperty.

    // ── light instance store: both maps lazily allocated ──
    private _values?: Map<string, unknown>;
    private _listeners?: Map<string, PropertyChangeCallback[]>;

    public get_property_value<T>(key: PropertyKey<T>): T {
      const d = key.descriptor;
      const stored = this._values?.get(d.ComposedKey);
      const raw = stored !== undefined ? stored : d.DefaultValue;
      return (d.CoerceValue ? d.CoerceValue(this, raw) : raw) as T;
    }

    public set_property_value<T>(key: PropertyKey<T>, value: T): void {
      const d = key.descriptor;
      if (d.ValidateValue && !d.ValidateValue(value))
        throw new Error(`Value rejected by validate_value for '${d.RootOwner.name}.${d.Name}'.`);
      const oldEff = this.get_property_value(key);
      (this._values ??= new Map()).set(d.ComposedKey, value);
      const newEff = this.get_property_value(key);
      if (oldEff !== newEff) {
        this.OnPropertyChanged(d, oldEff, newEff);
        const cbs = this._listeners?.get(d.ComposedKey);
        if (cbs) for (const cb of [...cbs]) cb(this, d, oldEff, newEff);
      }
    }

    public AddPropertyChangedListener(key: PropertyKey<unknown>, cb: PropertyChangeCallback): void {
      ((this._listeners ??= new Map()).get(key.descriptor.ComposedKey)
        ?? (this._listeners.set(key.descriptor.ComposedKey, []), this._listeners.get(key.descriptor.ComposedKey)!)).push(cb);
    }

    public RemovePropertyChangedListener(key: PropertyKey<unknown>, cb: PropertyChangeCallback): void {
      const arr = this._listeners?.get(key.descriptor.ComposedKey);
      if (!arr) return;
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    }

    protected OnPropertyChanged(_d: PropertyDescriptor, _old: unknown, _new: unknown): void { /* no-op */ }
  }
  ```
  (Match the exact `PropertyChangeCallback` arity used elsewhere —
  `(owner, descriptor, oldValue, newValue)`.)
- [ ] **Step 4: Reparent `MuralBase`.** In `model.ts`: `export class MuralBase
  extends Observable`; delete the static members now living on `Observable`;
  keep the EVD instance members, which now **override** `Observable`'s
  (`get_property_value`, `set_property_value`, `AddPropertyChangedListener`,
  `RemovePropertyChangedListener`, `OnPropertyChanged`), plus all EVD-only
  members. Keep `RegisterAttachedProperty`, `OverrideMetadata`, and the
  inheritable statics on `MuralBase`.
- [ ] **Step 5: Export `Observable`** from `src/runtime/index.ts`.
- [ ] **Step 6: Run the new test — expect pass.**
  `npx tsx --test src/runtime/tests/observable.test.ts` → PASS.
- [ ] **Step 7: Run the full suite — parity gate.** `npm test`. Expected: all
  green; `MuralBase`/`Visual` behavior identical.
- [ ] **Step 8: Commit.**
  ```bash
  git add -A
  git commit -m "feat(runtime): add Observable base; MuralBase extends Observable"
  ```

---

## Task 3: Retarget the bindable gates to `Observable`

Relax the source-observation and `DataTemplate`-dispatch gates from
`instanceof MuralBase` to `instanceof Observable`, so a plain `Observable`
binds and templates. Full-DP sites stay `instanceof MuralBase`.

**Files:**
- Modify: `src/runtime/binding/binding.ts` (the three source checks + teardown
  key handling), `src/runtime/binding/data-context-binding.ts` (first-segment
  subscription), `src/runtime/binding/ancestor-binding.ts` (ancestor
  subscription), `src/framework/base/content-control.ts` (`DataTemplate`
  auto-resolution).
- Test: `src/runtime/binding/tests/observable-source.test.ts`,
  `src/framework/base/tests/content-control-observable.test.ts`.

**Interfaces:**
- Consumes: `Observable` (Task 2), the existing `resolveKey`/`PropertyKey` path.
- Produces: binding + `DataTemplate` dispatch that treat any `Observable`
  (including every `MuralBase`/`Visual`) as an observable source.

- [ ] **Step 1: Write the failing binding test** —
  `src/runtime/binding/tests/observable-source.test.ts`: bind a `TextBlock`'s
  `Text` to `$label` on a plain `Observable` subclass instance; assert the
  target shows the initial value, updates on `set_property_value`, and (two-way)
  writes back. Expected FAIL today (source isn't a `MuralBase`, so binding
  treats it as a plain assignment — no reactivity).
- [ ] **Step 2: Write the failing DataTemplate test** —
  `src/framework/base/tests/content-control-observable.test.ts`: set a
  `ContentControl.Content` to an `Observable` subclass instance with a
  registered `DataTemplate [ DataType = ThatClass ]`; assert the template
  renders; assert an unmatched type shows the red "no DataTemplate" diagnostic.
  Expected FAIL today (auto-resolution gates on `MuralBase`).
- [ ] **Step 3: Run both — expect failure.**
- [ ] **Step 4: Retarget binding source observation.** In `binding.ts` change
  the three `if (current instanceof MuralBase)` / `if (parent instanceof
  MuralBase)` source checks (≈ lines 227/246/280) and the corresponding
  teardown to `instanceof Observable`; the calls (`AddPropertyChangedListener`,
  `get_property_value`, `RemovePropertyChangedListener`) are unchanged — they're
  on `Observable` now. Do the same in `data-context-binding.ts` (first-segment
  subscription) and `ancestor-binding.ts`.
- [ ] **Step 5: Retarget `DataTemplate` dispatch.** In `content-control.ts`, the
  "non-Visual `MuralBase` → find DataTemplate by `value.constructor`" branch
  becomes "non-Visual `Observable` → …". Keep the `value instanceof Visual`
  short-circuit ahead of it and the red-diagnostic fallback.
- [ ] **Step 6: Run the two new tests — expect pass.**
- [ ] **Step 7: Run the full suite — parity gate.** `npm test` green.
- [ ] **Step 8: Commit.**
  ```bash
  git add -A
  git commit -m "feat(binding): observe + template-dispatch any Observable source"
  ```

---

## Task 4: `Observable` cost & correctness tests

Lock in the memory/allocation win and the semantic edges, so a later refactor
can't silently reintroduce the EVD tax on `Observable`.

**Files:**
- Test: extend `src/runtime/tests/observable.test.ts`.

- [ ] **Step 1: Write the cost test.** Construct N (e.g. 10_000) `Observable`
  subclass instances with two properties, each with one property set; and N
  equivalent `MuralBase` subclass instances. Assert the `Observable` set does
  not allocate a `property_values` EVD map (it has none) and — via
  `process.memoryUsage().heapUsed` deltas around forced GC if available, else a
  structural assertion — that an unbound `Observable` carries neither `_values`
  nor `_listeners`. Keep the assertion structural (not a brittle absolute-bytes
  threshold): assert `Observable` instances lack the `property_values` field
  entirely.
- [ ] **Step 2: Write correctness edges.** Unset read returns the descriptor
  default; a coerce callback runs on read; a `validate_value` rejection throws
  and leaves the value unchanged; `RemovePropertyChangedListener` stops
  delivery; setting to an equal value fires no notification.
- [ ] **Step 3: Run — expect pass.** `npx tsx --test src/runtime/tests/observable.test.ts`.
- [ ] **Step 4: Full suite green; commit.**
  ```bash
  git add -A
  git commit -m "test(runtime): Observable cost + correctness edges"
  ```

---

## Task 5: Plexus rename + mural dependency bump

Only after Mural is published to Verdaccio (a **user-gated** step). Mechanical
rename in Plexus; the split is invisible to Plexus except the identifier.

**Files:**
- Modify (Plexus): every `extends Model` → `extends MuralBase` and
  `import { Model }` → `import { MuralBase }` (e.g. `NodeViewModel`,
  `DiagramDocument`, `OpenProject`, and all VM subclasses); `package.json`
  `@pragmatic-lab/mural` version bump.
- Test: existing Plexus suite (vitest) is the gate.

**Interfaces:**
- Consumes: the published mural with `Observable` + `MuralBase`.

- [ ] **Step 1 (user-gated): publish mural.** Ask the user; on approval, bump
  mural's version (minor), publish to Verdaccio only.
- [ ] **Step 2: Bump Plexus's mural dependency** to the new version and
  force-reinstall the tarball.
- [ ] **Step 3: Rename in Plexus.** `git grep -nE '\bModel\b' -- src` in Plexus;
  rename the mural-`Model` references to `MuralBase` (leave unrelated
  identifiers). Typecheck.
- [ ] **Step 4: Run the Plexus suite.** `npx vitest run`. Expected: green.
- [ ] **Step 5: Commit (Plexus).**
  ```bash
  git commit -am "refactor(plexus): Model -> MuralBase after mural split"
  ```

---

## Self-Review

- **Spec coverage:** `Observable` contract + light storage (Task 2), `MuralBase`
  reparent (Task 2), gate retargeting by intent (Tasks 1/3), rename sweep (Tasks
  1/5), parity gate (every task), cost test (Task 4), rollout order (Tasks
  1–5). All spec sections map to a task.
- **Placeholder scan:** none — the `Observable` class body and gate edits are
  concrete; existing-code transformations are named by member/site rather than
  reproduced, which is appropriate for a rename/extract refactor.
- **Type consistency:** `PropertyKey<T>`, `PropertyDescriptor.ComposedKey/Name/
  RootOwner/DefaultValue/CoerceValue/ValidateValue`, `PropertyChangeCallback
  (owner, descriptor, old, new)`, `MetaData` — used identically across tasks and
  matching `model.ts`.
- **Ordering:** rename-first (Task 1) isolates the mechanical churn; Observable
  and gates land against final names; Plexus (Task 5) follows a gated publish.
  The bindable `instanceof` sites are touched twice (renamed in T1, relaxed in
  T3) — intentional, each behind the parity gate.

## Execution options

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between.
2. **Inline Execution** — execute in this session with checkpoints.
