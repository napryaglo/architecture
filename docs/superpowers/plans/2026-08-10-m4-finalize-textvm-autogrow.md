# M4 Finalization: Text-VM Auto-Grow + Deferred Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four headless-actionable follow-ups the M4 unified node view-model engine left open, reaching parity with legacy Figure text shapes and deleting them.

**Architecture:** VM-side auto-grow (`TextNodeVM._applyAutoFit` measures its own `ShapeText`, mirroring `Figure._applyAutoFit`) unblocks deleting legacy `TextShape`/`Callout`; then a callout listener-leak fix and a deserialize id-collision guard. Sequential: SP1 → SP2 → SP3 → SP4.

**Tech Stack:** TypeScript, mural framework (`src/framework/diagram`), Vitest. Spec: `docs/superpowers/specs/2026-08-10-m4-finalize-textvm-autogrow-design.md`.

## Global Constraints

- Every test file lives in a `tests/` subfolder next to its source (e.g. `src/framework/diagram/tests/foo.test.ts`).
- Real TypeScript `enum`s, never string-literal unions (existing `TextAutoFit`, `TextPlacement` apply).
- No git push — local commits only.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Run the full suite (`npx vitest run`) at each SP boundary; run `npm run typecheck` and `npm run typecheck:demos` before completion.
- Branch: `feat/m4-finalize-textvm-autogrow` (already created off `main` @ 811fbe0).

---

### Task 1: TextNodeVM auto-grow (`_applyAutoFit`)

**Files:**
- Modify: `src/framework/diagram/text-node-vm.ts`
- Test: `src/framework/diagram/tests/m4-textvm-autogrow.test.ts` (create)

**Interfaces:**
- Consumes: `TextAutoFit` (from `./shape-text.js`), `Size` (from visual-engine), `DiagramSettings.ShapeLabelMargin()` (from `./diagram-settings.js`), `TextNodeVM.Text` (existing `ShapeText` DP), `TextNodeVM.Width`/`Height` (inherited DPs), the existing `_onLabelChanged` handler.
- Produces: `TextNodeVM._applyAutoFit(): void` (private) called from `_onLabelChanged` and the constructor. Behavior identical to `Figure._applyAutoFit` ([figure.ts:353-364]).

- [ ] **Step 1: Write the failing test**

Create `src/framework/diagram/tests/m4-textvm-autogrow.test.ts`:

```ts
import { describe, test, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { initTestApp } from '../../../test-utils/init-test-app.js'
import { TextNodeVM } from '../text-node-vm.js'

describe('TextNodeVM — GrowShape auto-fit', () => {
    beforeEach(() => { initTestApp(); })

    test('long text grows Width/Height past the 120x44 default', () => {
        const vm = new TextNodeVM()
        const w0 = vm.Width, h0 = vm.Height
        vm.LabelText = 'A very long label that should not fit inside the default text box footprint'
        assert.ok(vm.Width > w0, `expected Width to grow from ${w0}, got ${vm.Width}`)
        assert.ok(vm.Height >= h0, `expected Height not to shrink from ${h0}, got ${vm.Height}`)
    })

    test('grow-only: a shorter label does not shrink the box', () => {
        const vm = new TextNodeVM()
        vm.LabelText = 'A very long label that grows the box well beyond its default width'
        const wGrown = vm.Width
        vm.LabelText = 'x'
        assert.equal(vm.Width, wGrown, 'grow-only: must not shrink')
    })

    test('idempotent: re-measuring the same text does not oscillate', () => {
        const vm = new TextNodeVM()
        vm.LabelText = 'Stable label content for idempotence'
        const w1 = vm.Width, h1 = vm.Height
        vm.LabelText = 'Stable label content for idempotence'
        assert.equal(vm.Width, w1)
        assert.equal(vm.Height, h1)
    })
})
```

Confirm the `initTestApp` import path matches the one used by `src/framework/diagram/tests/shape-text.test.ts` (copy its exact import specifier); adjust if the harness helper lives elsewhere.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/framework/diagram/tests/m4-textvm-autogrow.test.ts`
Expected: FAIL — `Width` stays 120 (no `_applyAutoFit` yet), first assertion fails.

- [ ] **Step 3: Implement `_applyAutoFit` on TextNodeVM**

In `src/framework/diagram/text-node-vm.ts`:

Add `Size` and `DiagramSettings` imports (verify exact specifiers against `figure.ts` — `Size` comes from the visual-engine barrel, `DiagramSettings` from `./diagram-settings.js`):

```ts
import { Size } from '../../visual-engine/index.js';
import { DiagramSettings } from './diagram-settings.js';
```

`TextAutoFit` is already imported. Change the `_onLabelChanged` handler to also run auto-fit, and add the method (mirror [figure.ts:346-364] verbatim, against `this.Text`):

```ts
    private readonly _onLabelChanged = (): void => { this._refreshLabelFields(); this._applyAutoFit(); };

    // TextAutoFit.GrowShape: grow this node so the label's natural size fits
    // (plus a margin). Grow-only — never shrinks. Mirrors Figure._applyAutoFit
    // against the VM's own ShapeText (a standalone ShapeText measures headlessly).
    private _applyAutoFit(): void
    {
        const label = this.Text;
        if (label === undefined || label.AutoFit !== TextAutoFit.GrowShape) return;
        label.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
        const d = label.DesiredSize;
        const margin = DiagramSettings.ShapeLabelMargin();
        const needW = d.Width  + margin * 2;
        const needH = d.Height + margin * 2;
        if (needW > this.Width)  this.Width  = needW;
        if (needH > this.Height) this.Height = needH;
    }
```

At the end of the constructor, after `this._refreshLabelFields();`, add:

```ts
        this._applyAutoFit();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/framework/diagram/tests/m4-textvm-autogrow.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Run the existing text-VM tests to confirm no regression**

Run: `npx vitest run src/framework/diagram/tests/m4-text-node-vm.test.ts src/framework/diagram/tests/field.test.ts`
Expected: PASS. If a fixed-size expectation now fails because the box auto-grew, that test was asserting the old inert behavior — update it to the grown size only if it is genuinely testing default dims of an empty/short label (an empty label measures ~0 so defaults hold); otherwise investigate.

- [ ] **Step 6: Commit**

```bash
git add src/framework/diagram/text-node-vm.ts src/framework/diagram/tests/m4-textvm-autogrow.test.ts
git commit -m "feat(diagram): TextNodeVM auto-grow via _applyAutoFit (mirrors Figure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: CalloutNodeVM inherits auto-grow; leader still tracks

**Files:**
- Test: `src/framework/diagram/tests/m4-callout-autogrow.test.ts` (create)
- Modify (only if the test reveals a gap): `src/framework/diagram/callout-node-vm.ts`

**Interfaces:**
- Consumes: `CalloutNodeVM` (extends `TextNodeVM`, inherits `_applyAutoFit`), `CalloutNodeVM.LeaderTargetNode`, `CalloutNodeVM.LeaderGeometry`, `TextNodeVM.LabelText`.
- Produces: no new API — verifies inheritance. `CalloutNodeVM.OnPropertyChanged` already recomputes the leader on `Width`/`Height` change ([callout-node-vm.ts:116-124]).

- [ ] **Step 1: Write the failing test**

Create `src/framework/diagram/tests/m4-callout-autogrow.test.ts`:

```ts
import { describe, test, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { initTestApp } from '../../../test-utils/init-test-app.js'
import { CalloutNodeVM } from '../callout-node-vm.js'
import { TextNodeVM } from '../text-node-vm.js'

describe('CalloutNodeVM — inherits auto-grow, leader follows', () => {
    beforeEach(() => { initTestApp(); })

    test('a long label grows the callout box', () => {
        const c = new CalloutNodeVM()
        const w0 = c.Width
        c.LabelText = 'A callout label long enough to force the box to grow wider'
        assert.ok(c.Width > w0, `expected grow from ${w0}, got ${c.Width}`)
    })

    test('leader geometry recomputes after the box auto-grows', () => {
        const c = new CalloutNodeVM()
        c.Left = 0; c.Top = 0
        const target = new TextNodeVM()
        target.Left = 400; target.Top = 300
        c.LeaderTargetNode = target
        const before = c.LeaderGeometry
        assert.ok(before !== undefined, 'leader present with a target')
        c.LabelText = 'Grow the callout so its edge point moves and the leader is recomputed'
        assert.ok(c.LeaderGeometry !== undefined, 'leader still present after grow')
    })
})
```

Match the `initTestApp` import specifier to Task 1.

- [ ] **Step 2: Run test to verify current behavior**

Run: `npx vitest run src/framework/diagram/tests/m4-callout-autogrow.test.ts`
Expected: PASS immediately if inheritance works as designed (Task 1 gave `CalloutNodeVM` `_applyAutoFit` for free, and the leader recompute already rides `Width`/`Height` changes). If the first test FAILS, `CalloutNodeVM`'s constructor overrides Width/Height after auto-fit — investigate and fix in `callout-node-vm.ts` (do not weaken the test).

- [ ] **Step 3: Commit**

```bash
git add src/framework/diagram/tests/m4-callout-autogrow.test.ts
git commit -m "test(diagram): CalloutNodeVM inherits auto-grow, leader tracks grown box

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: SP1 boundary — full suite + typecheck**

Run: `npx vitest run`
Expected: all green (prior counts + new tests).
Run: `npm run typecheck && npm run typecheck:demos`
Expected: 0 errors.

---

### Task 3: Delete legacy `TextShape` / `Callout`

**Files:**
- Delete/empty: `src/framework/diagram/text-shape.ts`
- Modify: `src/framework/index.ts` (remove barrel export at line ~224)
- Modify (comment refresh only): `src/framework/diagram/node-serialization.ts`, `src/framework/diagram/node-serializers-default.ts`
- Delete if now dead: `src/framework/diagram/tests/text-shape.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TextShape` and `Callout` no longer exist or are exported.

- [ ] **Step 1: Find every remaining importer of `text-shape.js` / `TextShape` / `Callout`**

Run a search for `text-shape`, `TextShape`, and `Callout` (word-boundary, excluding `CalloutNodeVM`) across `src/` and `demo/`.
Expected references: the barrel export ([index.ts:224]), the legacy test file, and the historical comments in the two serializer files. If a **non-comment, non-test** importer exists in production code, STOP — that is a real dependency the spec assumed absent; report it before deleting.

- [ ] **Step 2: Confirm the compiler symbol table does not register them**

Search `src/compiler/symbol-table.ts` for `TextShape` / `Callout`. Expected: absent (they are Figure subclasses, not markup-facing VMs). If present, remove those registrations as part of this task.

- [ ] **Step 3: Delete the classes**

Delete `src/framework/diagram/text-shape.ts` entirely if nothing else lives in it. If the file also holds still-used exports (it should not — constants are duplicated into the VMs), delete only the `TextShape` and `Callout` class declarations and their now-unused private helpers, leaving the still-imported symbols.

Delete `src/framework/diagram/tests/text-shape.test.ts` (it exercises the removed classes).

- [ ] **Step 4: Remove the barrel export**

In `src/framework/index.ts`, delete:
```ts
export { TextShape, Callout } from './diagram/text-shape.js';
```

- [ ] **Step 5: Refresh stale comments**

In `src/framework/diagram/node-serialization.ts` and `node-serializers-default.ts`, update the comments that reference `TextShape`/`Callout` as the produced types to reference `TextNodeVM`/`CalloutNodeVM` (these are comment-only edits; do not change logic).

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm run typecheck:demos`
Expected: 0 errors (no dangling imports of the deleted symbols).
Run: `npx vitest run`
Expected: green (minus the deleted `text-shape.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(diagram): delete legacy TextShape/Callout (superseded by Text/CalloutNodeVM)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Callout listener-leak fix on delete

**Files:**
- Modify: `src/framework/diagram/callout-node-vm.ts` (add `Detach`)
- Modify: `src/framework/diagram/diagram-document.ts` (`DeleteNodes` cascade)
- Test: `src/framework/diagram/tests/m4-callout-delete-detach.test.ts` (create)

**Interfaces:**
- Consumes: `CalloutNodeVM._retrackTarget`/`_trackedTarget`/`_onTargetMoved` (existing private state), `TARGET_TRACK`, `resolveKey`, `DiagramDocument.DeleteNodes`, `DiagramDocument.Nodes`.
- Produces: `CalloutNodeVM.Detach(): void` (public — unsubscribes the tracked target and clears `_trackedTarget`). `DeleteNodes` calls `Detach()` on each removed callout and clears `LeaderTargetNode` on any surviving callout whose target was removed.

- [ ] **Step 1: Write the failing test**

Create `src/framework/diagram/tests/m4-callout-delete-detach.test.ts`:

```ts
import { describe, test, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { initTestApp } from '../../../test-utils/init-test-app.js'
import { DiagramDocument } from '../diagram-document.js'
import { CalloutNodeVM } from '../callout-node-vm.js'
import { TextNodeVM } from '../text-node-vm.js'

describe('CalloutNodeVM — detach on delete', () => {
    beforeEach(() => { initTestApp(); })

    test('deleting a callout stops it tracking its target', () => {
        const doc = new DiagramDocument()
        const target = new TextNodeVM(); target.Id = 't'; target.Left = 200; target.Top = 200
        const callout = new CalloutNodeVM(); callout.Id = 'c'
        doc.AddNode(target); doc.AddNode(callout)
        callout.LeaderTargetNode = target
        const g0 = callout.LeaderGeometry
        assert.ok(g0 !== undefined)

        doc.DeleteNodes([callout])
        // Moving the (surviving) target must no longer recompute the deleted
        // callout's geometry — its listener was detached.
        const before = callout.LeaderGeometry
        target.Left = 900
        assert.equal(callout.LeaderGeometry, before, 'detached: no recompute after delete')
    })

    test('deleting a target clears the surviving callout leader', () => {
        const doc = new DiagramDocument()
        const target = new TextNodeVM(); target.Id = 't'; target.Left = 200; target.Top = 200
        const callout = new CalloutNodeVM(); callout.Id = 'c'
        doc.AddNode(target); doc.AddNode(callout)
        callout.LeaderTargetNode = target
        assert.ok(callout.LeaderGeometry !== undefined)

        doc.DeleteNodes([target])
        assert.equal(callout.LeaderTargetNode, undefined, 'target ref cleared')
        assert.equal(callout.LeaderGeometry, undefined, 'leader removed')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/framework/diagram/tests/m4-callout-delete-detach.test.ts`
Expected: FAIL — first test: deleted callout still recomputes (listener leak); second test: surviving callout still points at removed target.

- [ ] **Step 3: Add `Detach` to CalloutNodeVM**

In `src/framework/diagram/callout-node-vm.ts`, add a public method that unsubscribes the tracked target (mirror the removal branch of `_retrackTarget`):

```ts
    /** Release the target-geometry subscription. Called by the document when
     *  this callout is deleted so it stops tracking a node it no longer draws. */
    public Detach(): void
    {
        const prev = this._trackedTarget;
        if (prev !== undefined)
        {
            for (const name of TARGET_TRACK)
            {
                const key = resolveKey(prev, undefined, name);
                prev.RemovePropertyChangedListener(key, this._onTargetMoved);
            }
            this._trackedTarget = undefined;
        }
    }
```

- [ ] **Step 4: Wire the cascade into `DeleteNodes`**

In `src/framework/diagram/diagram-document.ts`, inside `DeleteNodes`, within the `if (removed > 0)` block (after the connector cascade, before setting `this.Status`), add the callout cleanup. Detach removed callouts and clear survivors that pointed at a removed node:

```ts
            // Callout cleanup: detach any removed callout from its target, and
            // clear the leader on any surviving callout whose target was removed
            // (mirrors the connector DetachFromHosts cascade above).
            for (const item of items)
            {
                if (item instanceof CalloutNodeVM) item.Detach();
            }
            for (let i = 0; i < this.Nodes.Count; i++)
            {
                const n = this.Nodes.Get(i);
                if (n instanceof CalloutNodeVM
                    && n.LeaderTargetNode !== undefined
                    && items.includes(n.LeaderTargetNode as unknown))
                {
                    n.LeaderTargetNode = undefined;
                }
            }
```

Verify `CalloutNodeVM` is imported in `diagram-document.ts`; it already imports `NodeViewModel`, `TextNodeVM`, `ShapeNodeVM` — add `CalloutNodeVM` from `./callout-node-vm.js` if not present.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/framework/diagram/tests/m4-callout-delete-detach.test.ts`
Expected: PASS (both).

- [ ] **Step 6: Run existing callout/diagram-document tests**

Run: `npx vitest run src/framework/diagram/tests/diagram-document-connectors.test.ts src/framework/diagram/tests/m3-connector-vm.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/framework/diagram/callout-node-vm.ts src/framework/diagram/diagram-document.ts src/framework/diagram/tests/m4-callout-delete-detach.test.ts
git commit -m "fix(diagram): detach callout leader listeners on node delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Deserialize id-collision guard

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (`_deserialize`)
- Test: `src/framework/diagram/tests/m4-deserialize-id-guard.test.ts` (create)

**Interfaces:**
- Consumes: `DiagramDocument.load`/`toJSON` round-trip (or a direct `_deserialize` payload), `this._nextId`.
- Produces: fallback id generation in `_deserialize` skips any id already present among the payload's explicit ids or already generated in this pass.

- [ ] **Step 1: Write the failing test**

Create `src/framework/diagram/tests/m4-deserialize-id-guard.test.ts`. Use the same serialized-diagram shape the existing serialize tests use (check `src/framework/diagram/tests/m2-serialize-resize.test.ts` for the exact `load`/`toJSON` API and the `SerializedDiagram` shape). The test builds a payload with an explicit `id:'n1'` node plus an empty-id node while the target doc's `_nextId` is low, loads it, and asserts no two nodes share an id and none was dropped:

```ts
import { describe, test, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { initTestApp } from '../../../test-utils/init-test-app.js'
import { DiagramDocument } from '../diagram-document.js'

describe('DiagramDocument._deserialize — id-collision guard', () => {
    beforeEach(() => { initTestApp(); })

    test('an empty-id node does not collide with an explicit "n1"', () => {
        const doc = new DiagramDocument()
        // Two shape nodes: one explicit id 'n1', one empty id. Fallback for the
        // empty one must NOT regenerate 'n1'.
        doc.load({
            nodes: [
                { type: 'shape', id: 'n1', left: 0,  top: 0, w: 60, h: 40, data: { kind: 'rectangle', d: '' } },
                { type: 'shape', id: '',   left: 80, top: 0, w: 60, h: 40, data: { kind: 'rectangle', d: '' } },
            ],
            connectors: [],
        } as unknown as Parameters<DiagramDocument['load']>[0])

        const ids = doc.Nodes.ToArray().map((n) => (n as { Id?: string }).Id)
        assert.equal(ids.length, 2, 'both nodes present')
        assert.equal(new Set(ids).size, 2, `ids must be unique, got ${JSON.stringify(ids)}`)
        assert.ok(ids.includes('n1'), 'explicit id preserved')
    })
})
```

Adjust the `load` call to the real public entry point (`load`, `LoadFrom`, or `_deserialize` via a test seam) and the exact `SerializedDiagram`/`SerializedNodeV2` field names by reading `node-serialization.ts` and an existing serialize test. Keep the assertion intent: two unique ids, `n1` preserved.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/framework/diagram/tests/m4-deserialize-id-guard.test.ts`
Expected: FAIL — the empty-id node regenerates `'n1'`, so `new Set(ids).size === 1`.

- [ ] **Step 3: Add the guard in `_deserialize`**

In `src/framework/diagram/diagram-document.ts` `_deserialize`, before the node loop, collect the explicit inbound ids and add a collision-skipping generator. Replace the fallback assignment on line 735:

Before the `for (const n of payload.nodes ?? [])` loop, add:

```ts
        // Ids already claimed by explicit records (or generated below) — the
        // fallback generator must skip these so an empty-id node never collides
        // with an inbound 'nN'.
        const claimedIds = new Set<string>();
        for (const n of payload.nodes ?? [])
        {
            if (n.id !== '') claimedIds.add(n.id);
        }
        const nextFreeId = (): string => {
            let candidate = 'n' + this._nextId++;
            while (claimedIds.has(candidate)) candidate = 'n' + this._nextId++;
            claimedIds.add(candidate);
            return candidate;
        };
```

Change line 735 from:

```ts
            const id = n.id !== '' ? n.id : 'n' + this._nextId++;
```

to:

```ts
            const id = n.id !== '' ? n.id : nextFreeId();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/framework/diagram/tests/m4-deserialize-id-guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Run existing serialize/deserialize tests**

Run: `npx vitest run src/framework/diagram/tests/m2-serialize-resize.test.ts src/framework/diagram/tests/m3-connector-vm.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/framework/diagram/diagram-document.ts src/framework/diagram/tests/m4-deserialize-id-guard.test.ts
git commit -m "fix(diagram): guard deserialize fallback ids against collision with explicit ids

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final gate

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 2: Typecheck (both)**

Run: `npm run typecheck && npm run typecheck:demos`
Expected: 0 errors.

- [ ] **Step 3: Report**

Summarize commits, note that legacy `TextShape`/`Callout` are gone, and surface the version-bump/republish decision (the published surface changed — `TextShape`/`Callout` removed from the barrel) to the user. Do not push. Present finishing-a-development-branch options.

## Self-Review

- **Spec coverage:** SP1 → Tasks 1-2; SP2 → Task 3; SP3 → Task 4; SP4 → Task 5; boundary gates → Task 6. All spec sub-projects covered.
- **Placeholder scan:** the two id-guard/`load` API adjustments (Task 5 Step 1/3) and the `initTestApp` import specifier are explicitly flagged as "verify against existing test X" rather than left blank — the intent and fallback are concrete.
- **Type consistency:** `_applyAutoFit` (private, both Task 1 and referenced by Task 2 inheritance), `Detach` (public, Task 4), `nextFreeId` (local, Task 5) are named consistently across tasks. `TARGET_TRACK`/`resolveKey`/`_trackedTarget`/`_onTargetMoved` match [callout-node-vm.ts].
