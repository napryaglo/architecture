# Observable / MuralBase Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split mural's property base into a lightweight `Observable` (change
notification only) and the DP-bearing `MuralBase` (renamed `Model`, `extends
Observable`), so data objects can bind and dispatch `DataTemplate`s without the
per-instance dependency-property overhead.

**Architecture:** `Observable` is a minimal name/setter-based
`INotifyPropertyChanged` analog — a lazily-allocated `name → callbacks` listener
map, a virtual `AddPropertyChangedListener(name, cb)`, and a protected
`RaisePropertyChanged(name, old, new)` that subclass setters call. It has **no** `PropertyKey`,
**no** registry, **no** descriptors. The entire dependency-property system
(`PropertyKey`, the per-class registry, `RegisterProperty`, descriptors, the
`EffectiveValueDescriptor` store) lives on `MuralBase`, which `extends Observable`
and **overrides** `AddPropertyChangedListener` (widened to `string | PropertyKey`)
to route through its EVD listeners. Binding and `DataTemplate` dispatch gate on
`instanceof Observable` but **dual-branch**, `MuralBase`-first: a `MuralBase`
source uses the existing `PropertyKey` path (unchanged); a plain `Observable`
source reads via its getter (`source[name]`), subscribes by name, and writes via
its setter (`source[name] = v`). `Visual extends MuralBase`.

**Tech Stack:** TypeScript (strict, ESM), mural runtime + compiler; tsx/node test runner.

**Spec:** [docs/superpowers/specs/2026-08-21-observable-muralbase-split-design.md](../specs/2026-08-21-observable-muralbase-split-design.md)

## Global Constraints

- Publish `@pragmatic-tech-ai/mural` **only** to the local Verdaccio registry
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
  `MuralBase` (file stays `model.ts`); Task 2 reparents `MuralBase extends
  Observable`, **keeps** the entire property system (registry, `PropertyKey`,
  descriptors, EVD store) here, and overrides the virtual
  `AddPropertyChangedListener` (widened to `string | PropertyKey`).
- `src/runtime/observable.ts` — **new**. `Observable`: the minimal name/setter
  INPC — `_listeners: Map<string, cb[]>` (lazy), virtual
  `AddPropertyChangedListener(name, cb)` / `RemovePropertyChangedListener(name,
  cb)`, protected `RaisePropertyChanged(name, old, new)`. No `PropertyKey`, no registry, no
  descriptors.
- `src/runtime/binding/binding.ts`, `data-context-binding.ts`,
  `ancestor-binding.ts` — the source-observation gates: `instanceof Model` →
  (Task 1) `instanceof MuralBase` → (Task 3) `instanceof Observable`, then
  **dual-branch** inside — `MuralBase` keeps the `PropertyKey` path, plain
  `Observable` uses the name/getter/setter path.
- `src/framework/base/content-control.ts` — the `DataTemplate` auto-resolution
  gate: same progression (dispatch still keys on `value.constructor`).
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

## Task 2: Introduce `Observable` (name/setter INPC); reparent `MuralBase extends Observable`

> **REWORK NOTE.** A first attempt (commit `fa3dd48`) put the `PropertyKey`
> registry + a value/listener store *on* `Observable`. That is superseded:
> `Observable` is a minimal name/setter `INotifyPropertyChanged`; the **entire**
> property system stays on `MuralBase`. This task describes the corrected target
> and reworks `fa3dd48` — move the registry/`PropertyKey`/descriptors **back**
> to `MuralBase`, rewrite `observable.ts`, rewrite `observable.test.ts`.

`Observable` gets **only** change notification keyed by property *name*, driven
by subclass getters/setters. `MuralBase extends Observable` keeps every current
member (registry, `PropertyKey`, descriptors, EVD store) and **overrides** the
virtual `AddPropertyChangedListener`. `MuralBase`/`Visual` behavior is unchanged
— byte-for-byte identical to `fa3dd48`'s `model.ts`/`visual.ts`.

**Files:**
- Create: `src/runtime/observable.ts` (rewrite the `fa3dd48` version).
- Modify: `src/runtime/model.ts` (move the static registry, `RegisterProperty`/
  `RegisterReadOnlyProperty`, `register_inheritable`, and the `PropertyKey`
  class **back** here from `observable.ts`; `extends Observable`; **override**
  `AddPropertyChangedListener`/`RemovePropertyChangedListener` widened to
  `string | PropertyKey`), `src/runtime/index.ts` (export both `Observable` and
  `PropertyKey`; `PropertyKey` re-homes to `model.ts`), and any file importing
  `PropertyKey` from `observable.js` → point back at `model.js` (or keep the
  `index.js` barrel import).
- Retain from `fa3dd48`: `MuralBase extends Observable`, and the
  `command.ts` `_listeners → _canExecuteListeners` collision rename.
- Test: `src/runtime/tests/observable.test.ts` (rewrite to the name/setter API).

**Interfaces:**
- Consumes: `PropertyChangeCallback` from `binding/effective-value.js` — the
  **public** arity `(owner: object, name: string, oldValue, newValue)`,
  unchanged.
- Produces: `class Observable` with:
  - `AddPropertyChangedListener(name: string, cb: PropertyChangeCallback): void`
    — **virtual** (a plain method `MuralBase` overrides).
  - `RemovePropertyChangedListener(name: string, cb: PropertyChangeCallback): void`.
  - `protected notify(name: string, oldValue: unknown, newValue: unknown): void`
    — subclass setters call this; it fires `(this, name, old, new)` to the
    name's listeners. No `PropertyKey`, no descriptors, no registry.
  - A single lazily-allocated `private _listeners?: Map<string,
    PropertyChangeCallback[]>` keyed by property **name**.
- Produces (`MuralBase`): unchanged public surface (`RegisterProperty`,
  `get/set_property_value(key)`, the whole EVD system), plus its
  `AddPropertyChangedListener(nameOrKey: string | PropertyKey, cb)` override —
  a `PropertyKey` routes to the existing EVD listener path (parity); a `string`
  resolves via `find_descriptor(this.constructor, name)` to the key, then the
  same EVD path.

- [ ] **Step 1: Rewrite the failing test** — `src/runtime/tests/observable.test.ts`:
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { Observable } from '../index.js';

  // A plain Observable subclass: real typed field + getter/setter + notify.
  class Loc extends Observable {
    private _label = '';
    get label(): string { return this._label; }
    set label(v: string) {
      const old = this._label;
      if (old === v) return;
      this._label = v;
      this.notify('label', old, v);
    }
  }

  test('Observable notifies by name on setter change', () => {
    const l = new Loc();
    assert.equal(l.label, '');
    const seen: Array<[string, unknown]> = [];
    l.AddPropertyChangedListener('label', (_o, name, _old, nv) => seen.push([name, nv]));
    l.label = 'Azure';
    assert.equal(l.label, 'Azure');
    assert.deepEqual(seen, [['label', 'Azure']]);
  });

  test('setting an equal value fires nothing', () => {
    const l = new Loc();
    let fired = 0;
    l.AddPropertyChangedListener('label', () => { fired++; });
    l.label = '';            // equal to default; setter guards
    assert.equal(fired, 0);
  });

  test('an unsubscribed Observable allocates no listener map', () => {
    const l = new Loc();
    assert.equal((l as unknown as { _listeners?: unknown })._listeners, undefined);
  });

  test('RemovePropertyChangedListener stops delivery', () => {
    const l = new Loc();
    let fired = 0;
    const cb = (): void => { fired++; };
    l.AddPropertyChangedListener('label', cb);
    l.RemovePropertyChangedListener('label', cb);
    l.label = 'x';
    assert.equal(fired, 0);
  });
  ```
- [ ] **Step 2: Run it — expect failure** (Observable is still the `fa3dd48`
  PropertyKey shape). `npx tsx --test src/runtime/tests/observable.test.ts` → FAIL.
- [ ] **Step 3: Rewrite `src/runtime/observable.ts`** to the minimal INPC:
  ```ts
  import type { PropertyChangeCallback } from './binding/effective-value.js';

  // Minimal INotifyPropertyChanged analog. Change notification keyed by
  // property NAME, driven by subclass getters/setters that call `RaisePropertyChanged`.
  // No PropertyKey, no descriptor registry, no effective-value machinery —
  // those all live on MuralBase (model.ts), which extends this class.
  export class Observable {
    // Lazily allocated on first subscribe: name → callbacks. An Observable
    // that is never subscribed to allocates nothing beyond its own fields.
    private _listeners?: Map<string, PropertyChangeCallback[]>;

    // Virtual: MuralBase overrides this (widened to string | PropertyKey)
    // to route through its EVD listeners instead.
    public AddPropertyChangedListener(name: string, callback: PropertyChangeCallback): void {
      const listeners = (this._listeners ??= new Map());
      let arr = listeners.get(name);
      if (arr === undefined) { arr = []; listeners.set(name, arr); }
      arr.push(callback);
    }

    public RemovePropertyChangedListener(name: string, callback: PropertyChangeCallback): void {
      const arr = this._listeners?.get(name);
      if (arr === undefined) return;
      const i = arr.indexOf(callback);
      if (i >= 0) arr.splice(i, 1);
    }

    // Subclass setters call this AFTER writing the backing field, only on a
    // real change. Fires (owner, name, old, new) — the same public callback
    // arity the binding engine consumes for MuralBase.
    protected notify(name: string, oldValue: unknown, newValue: unknown): void {
      const cbs = this._listeners?.get(name);
      if (cbs) for (const cb of [...cbs]) cb(this, name, oldValue, newValue);
    }
  }
  ```
- [ ] **Step 4: Move the property system back to `MuralBase`.** In `model.ts`:
  move the `PropertyKey` class, the static registry (`property_bags`,
  `class_registry`, `get_property_bag`, `peek_property_bag`, `compose_key`,
  `find_descriptor`, `HasProperty`, `find_class`, `EnumerateProperties`,
  `remember_class`, `register_inheritable`, `RegisterProperty`,
  `RegisterReadOnlyProperty`) **back** from `observable.ts` to `MuralBase`
  (restore its `MuralBase.`-qualified self-references). Keep `extends
  Observable` and the full EVD instance implementation.
- [ ] **Step 5: Override the notification surface on `MuralBase`.** Give
  `MuralBase` an override:
  ```ts
  public override AddPropertyChangedListener(
    nameOrKey: string | PropertyKey<unknown>,
    callback: PropertyChangeCallback,
  ): void {
    const key = typeof nameOrKey === 'string'
      ? new PropertyKey(MuralBase.find_descriptor(this.constructor, nameOrKey)!)
      : nameOrKey;
    // …existing EVD listener-attach body, keyed by key.descriptor…
  }
  ```
  and the matching `RemovePropertyChangedListener` override. The existing
  key-based EVD path is preserved verbatim for `PropertyKey` callers (parity);
  the `string` branch is the new name→descriptor resolution. `PropertyKey`
  appears only in `MuralBase`'s signature, never in `Observable`'s.
- [ ] **Step 6: Fix imports/exports.** `src/runtime/index.ts` exports
  `Observable` (from `observable.js`) and `PropertyKey` (now from `model.js`).
  Repoint any `import { PropertyKey } from './observable.js'` introduced by
  `fa3dd48` back to `./model.js` (or the barrel).
- [ ] **Step 7: Typecheck.** `npx tsc --noEmit` → clean.
- [ ] **Step 8: Run the new test — expect pass.**
  `npx tsx --test src/runtime/tests/observable.test.ts` → PASS.
- [ ] **Step 9: Run the full suite — parity gate.** `npm test`. Expected: all
  green, matching the pre-rework baseline count plus the new `observable.test.ts`
  cases; `MuralBase`/`Visual` behavior identical.
- [ ] **Step 10: Commit.**
  ```bash
  git add -A
  git commit -m "refactor(runtime): Observable is name/setter INPC; property system stays on MuralBase"
  ```

---

## Task 3: Dual-branch the bindable gates for `Observable`

Widen the source-observation and `DataTemplate`-dispatch gates from
`instanceof MuralBase` to `instanceof Observable`, then **dual-branch** inside,
`MuralBase`-first: a `MuralBase` source keeps the existing `PropertyKey` path
(read `get_property_value(key)`, subscribe `AddPropertyChangedListener(key)`,
teardown by key) **unchanged**; a plain `Observable` source uses the name path
(read `source[name]` via getter, subscribe `AddPropertyChangedListener(name)`,
two-way write `source[name] = value` via setter). `DataTemplate` dispatch still
keys on `value.constructor`.

**Files:**
- Modify: `src/runtime/binding/binding.ts` (the three source checks + teardown +
  read + two-way write), `src/runtime/binding/data-context-binding.ts`
  (first-segment subscription), `src/runtime/binding/ancestor-binding.ts`
  (ancestor subscription), `src/framework/base/content-control.ts` (`DataTemplate`
  auto-resolution gate `instanceof MuralBase` → `instanceof Observable`).
- Test: `src/runtime/binding/tests/observable-source.test.ts`,
  `src/framework/base/tests/content-control-observable.test.ts`.

**Interfaces:**
- Consumes: `Observable` (Task 2) with name-based
  `AddPropertyChangedListener(name, cb)` and subclass getters/setters;
  `MuralBase` with the `PropertyKey` path unchanged.
- Produces: binding + `DataTemplate` dispatch that treat any `Observable`
  (including every `MuralBase`/`Visual`) as an observable source, branching on
  `instanceof MuralBase` for which read/subscribe/write mechanism to use.

- [ ] **Step 1: Write the failing binding test** —
  `src/runtime/binding/tests/observable-source.test.ts`: define a plain
  `Observable` subclass with a `label` field + getter/setter + `RaisePropertyChanged('label',
  …)`; bind a `TextBlock`'s `Text` to `$label` on an instance; assert the target
  shows the initial value, updates when the setter runs, and (two-way) that a
  target edit writes back through the setter. Expected FAIL today (source isn't
  a `MuralBase`, so binding treats it as a plain assignment — no reactivity).
- [ ] **Step 2: Write the failing DataTemplate test** —
  `src/framework/base/tests/content-control-observable.test.ts`: set a
  `ContentControl.Content` to an `Observable` subclass instance with a
  registered `DataTemplate [ DataType = ThatClass ]`; assert the template
  renders; assert an unmatched type shows the red "no DataTemplate" diagnostic.
  Expected FAIL today (auto-resolution gates on `MuralBase`).
- [ ] **Step 3: Run both — expect failure.**
- [ ] **Step 4: Dual-branch binding source observation.** In `binding.ts`, the
  three source checks (≈ lines 227/246/280) and their teardown widen from
  `instanceof MuralBase` to `instanceof Observable`, then branch:
  - `source instanceof MuralBase` → the **existing** code verbatim: `resolveKey`
    → `PropertyKey`, `get_property_value(key)`, `AddPropertyChangedListener(key,
    cb)`, teardown `RemovePropertyChangedListener(key, cb)`. Zero change — parity.
  - else (plain `Observable`) → the name path: read `(source as Record<string,
    unknown>)[name]`; subscribe `source.AddPropertyChangedListener(name, cb)`;
    teardown `source.RemovePropertyChangedListener(name, cb)`; the callback keys
    off the `name` argument it already receives.
  Do the same branch in `data-context-binding.ts` and `ancestor-binding.ts`.
- [ ] **Step 5: Dual-branch the two-way write-back.** Where a two-way binding
  writes the source (the `MuralBase` `set_property_value(key, v)` path), add the
  else-branch `(source as Record<string, unknown>)[name] = value` so the
  subclass setter runs (which fires `RaisePropertyChanged`). Keep `MuralBase` on
  `set_property_value(key, v)`.
- [ ] **Step 6: Widen `DataTemplate` dispatch.** In `content-control.ts`, the
  "non-Visual `MuralBase` → find DataTemplate by `value.constructor`" gate
  becomes "non-Visual `Observable` → …". Keep the `value instanceof Visual`
  short-circuit ahead of it and the red-diagnostic fallback. Dispatch key is
  still `value.constructor` — unchanged.
- [ ] **Step 7: Run the two new tests — expect pass.**
- [ ] **Step 8: Run the full suite — parity gate.** `npm test` green.
- [ ] **Step 9: Commit.**
  ```bash
  git add -A
  git commit -m "feat(binding): observe + template-dispatch any Observable source (dual-branch)"
  ```

---

## Task 4: `Observable` cost & correctness tests

Lock in the memory/allocation win and the semantic edges, so a later refactor
can't silently reintroduce the EVD tax on `Observable`.

**Files:**
- Test: extend `src/runtime/tests/observable.test.ts`.

- [ ] **Step 1: Write the cost test.** Construct N (e.g. 10_000) plain
  `Observable` subclass instances (two fields each, one written) and N
  equivalent `MuralBase` subclass instances (two registered DPs, one set).
  Assert the structural win (not a brittle absolute-bytes threshold): every
  `Observable` instance lacks the `property_values` EVD field entirely (it is
  `undefined` — the field lives only on `MuralBase`), and an `Observable` that
  was written-to-but-never-subscribed still has `_listeners === undefined`.
  Where `process.memoryUsage().heapUsed` deltas around a forced GC are
  available, additionally assert the N-`Observable` footprint is materially
  below the N-`MuralBase` footprint; otherwise the structural assertions stand
  alone.
- [ ] **Step 2: Write correctness edges** (all name/setter semantics — no
  descriptor default, no coerce, no validate on `Observable`; those are
  `MuralBase`-only): an unwritten field reads its declared initializer; a
  setter that receives an equal value fires **no** notification (the setter's
  own `old === v` guard); `notify` fires exactly once per real change with the
  `(owner, name, old, new)` arity; `RemovePropertyChangedListener` stops
  delivery; two independent names notify independently (a listener on `a` never
  sees a change to `b`); subscribing the same callback twice delivers twice
  (no dedup — matches array semantics).
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
  `@pragmatic-tech-ai/mural` version bump.
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
- **Type consistency:** `Observable` exposes name-based
  `AddPropertyChangedListener(name, cb)` + protected `RaisePropertyChanged(name, old, new)`;
  `PropertyKey<T>` and the descriptor registry stay on `MuralBase`;
  `PropertyChangeCallback` is the public `(owner, name, old, new)` arity from
  `binding/effective-value.js` — used identically across tasks and matching
  `model.ts`. `MuralBase.AddPropertyChangedListener` overrides the virtual with
  a `string | PropertyKey` param (the only place `PropertyKey` meets the
  notification surface).
- **Ordering:** rename-first (Task 1) isolates the mechanical churn; Observable
  and gates land against final names; Plexus (Task 5) follows a gated publish.
  The bindable `instanceof` sites are touched twice (renamed in T1, relaxed in
  T3) — intentional, each behind the parity gate.

## Execution options

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between.
2. **Inline Execution** — execute in this session with checkpoints.
