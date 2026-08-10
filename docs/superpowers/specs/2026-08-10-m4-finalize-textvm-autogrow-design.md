# M4 Finalization: Text-VM Auto-Grow + Deferred Follow-Ups — Design

**Date:** 2026-08-10
**Branch:** `feat/m4-finalize-textvm-autogrow` (off mural `main` @ 811fbe0, v0.4.1)
**Parent work:** `2026-08-10-m4-groups-ports-text-vms-design.md` (M4-C left these deferred)

## Goal

Close the four headless-actionable follow-ups the M4 unified node view-model
engine left open, so the VM engine reaches parity with the legacy Figure-based
text shapes and the legacy classes can be deleted.

## Scope

Four sub-projects, executed **sequentially** (SP1 → SP4). Each is independently
testable; SP2 depends on SP1 proving parity.

Out of scope (genuinely live-smoke, cannot be verified headless):
- **Leader clipping** — needs a rendered callout with a distant target to confirm
  the clip actually bites; no code change until confirmed.
- **`mm:`-prefix tier-aware icon key** — Plexus-side, needs a running app.

## Background

The M4 engine renders diagram items as `NodeViewModel` instances placed in a
`DiagramDocument.Nodes` collection; mural wraps each VM in a **container
`Figure`** which resolves a `[DataType=X]` `DataTemplate` to render it. Legacy
`TextShape` / `Callout` (Figure subclasses) still exist because `TextNodeVM`'s
`AutoFit = GrowShape` is inert — a bare VM has no visual tree to measure text.

---

## SP1 — Auto-Grow (container-driven measure-and-grow)

### Problem
`TextNodeVM` ctor sets `Text.AutoFit = TextAutoFit.GrowShape`
([text-node-vm.ts:35-38]) but there is no `_applyAutoFit` on the VM. The legacy
`Figure._applyAutoFit` ([figure.ts:353-364]) measures its `ShapeText` label
unconstrained (`label.Measure(∞,∞)`), reads `label.DesiredSize`, and grows the
figure. A VM cannot do this — it has no label to measure. But the **container
Figure** that hosts the VM *does* hold both the VM (via `DataContext`) and the
realized, measured template content.

### Approach
The container Figure is the single place with both halves, so
container→VM feedback during layout is the correct hook.

1. **Capability signal.** Add `public AutoSizeToContent: boolean = false;` to
   `NodeViewModel` (plain field, mirrors the existing `Parent` field).
   `TextNodeVM` sets it `true` in its constructor; `CalloutNodeVM` inherits it.

2. **Generalize `_applyAutoFit`.** When the container Figure's `DataContext` is a
   `NodeViewModel` with `AutoSizeToContent === true`:
   - locate the realized measurable part: `PART_LabelHost` if the template
     declares it, else `PART_Content`;
   - measure it unconstrained (`Measure(∞,∞)`) and read `DesiredSize`;
   - write the desired width/height back to the VM's `Width` / `Height` DPs
     (the container's own bounds already track the VM), **grow-only** and
     **conditional** — only write when the desired size exceeds the current by
     more than an epsilon (e.g. 0.5px) — to avoid a measure→write→invalidate
     loop.

   For a legacy Figure (no auto-size VM DataContext) the method keeps measuring
   its `ShapeText`. One implementation, two content sources.

3. **Re-trigger.** Run the generalized auto-fit when the VM's `Text` changes (the
   VM already raises property-changed on its text) and on initial template
   realization / attach.

### Testability (resolved first, before any SP1 implementation)
The premise is that a headless VM can't measure text — but the *container*
measures via the layout engine, and the legacy `_applyAutoFit` tests already
measure `ShapeText` headlessly, proving the harness has a text-measurement
backend.

**SP1 Task 0 is a spike:** confirm a test can realize a `[DataType=TextNodeVM]`
template inside a container Figure and get a non-zero `DesiredSize` from the
measure pass.
- If yes → tests assert the container grows the VM after a `Text` change.
- If the harness cannot realize a template headlessly → the test constructs the
  measurable content element directly, hands it to the generalized auto-fit
  entry point, and still asserts grow-only conditional write-back. The
  production wiring (part lookup + re-trigger) is then covered by a thinner test
  that stubs the realized part.

### Files
- `src/framework/diagram/node-view-model.ts` — add `AutoSizeToContent`.
- `src/framework/diagram/text-node-vm.ts` — set `AutoSizeToContent = true`.
- `src/framework/diagram/figure.ts` — generalize `_applyAutoFit` + part lookup +
  re-trigger wiring.
- Tests alongside each in `tests/`.

### Success criteria
A container hosting a `TextNodeVM` grows the VM's `Width`/`Height` to fit its
text; growth is monotonic (never shrinks) and idempotent (no oscillation);
legacy Figure auto-fit behavior is unchanged.

---

## SP2 — Delete legacy `TextShape` / `Callout`

Depends on SP1 parity being proven.

- Delete `TextShape` and `Callout` from `src/framework/diagram/text-shape.ts`
  (the whole file if nothing else lives there).
- Remove the barrel export at [index.ts:224]:
  `export { TextShape, Callout } from './diagram/text-shape.js';`
- Confirm `src/compiler/symbol-table.ts` does not register them (they are Figure
  subclasses, not VMs — expected absent).
- The shared constants (`TEXT_SHAPE_FILL`, `TEXT_SHAPE_STROKE`,
  `CALLOUT_LEADER`) and `boxEdgeToward` are already duplicated into the VM
  classes, so nothing to migrate — but **verify no remaining importer** of
  `text-shape.js` before deleting; if one exists, it's a real dependency to
  resolve, not a mechanical delete.
- Refresh the stale comments referencing the old classes in
  `node-serialization.ts` and `node-serializers-default.ts`.

### Success criteria
`text-shape.ts` gone (or emptied), no dangling imports, full suite green,
typecheck + typecheck:demos clean.

---

## SP3 — Callout listener leak on delete

`CalloutNodeVM` subscribes to its `LeaderTargetNode`'s geometry DPs
([callout-node-vm.ts:130-152]) but `DiagramDocument.DeleteNodes`
([diagram-document.ts:448-493]) never detaches it — mirroring the legacy leak.

- Add `Detach(): void` to `CalloutNodeVM`: unsubscribe the tracked target
  listener and clear `_trackedTarget` / `_onTargetMoved`.
- In `DeleteNodes`, per removed node:
  - (a) if the removed node is a `CalloutNodeVM`, call its `Detach()`;
  - (b) scan surviving nodes for any `CalloutNodeVM` whose `LeaderTargetNode` is
    a removed node and clear it (`LeaderTargetNode = undefined`, which
    re-tracks / unsubscribes the old target).
- Mirror the existing connector `DetachFromHosts` cascade already in
  `DeleteNodes`.

### Tests
- Delete a callout → its target listener is unsubscribed (moving the former
  target no longer recomputes the deleted callout's geometry).
- Delete a callout's target → the surviving callout's `LeaderTargetNode` is
  cleared and it receives no further updates from the removed node.

### Success criteria
No dangling subscription after either deletion path; existing callout tests
still green.

---

## SP4 — Deserialize id-collision guard

`_deserialize` assigns a fallback id `'n' + this._nextId++`
([diagram-document.ts:735]) for nodes with an empty persisted id, with no check
that the generated id isn't already inbound. This collides only on
merge/append of a saved doc (holding `n1`, `n2`, …) into a live doc.

- Before assigning fallback ids, pre-collect every explicit inbound id into a
  set.
- The fallback generator skips any candidate id already in that set or already
  assigned in this pass (advance the counter until free).

### Test
Merge/append a payload with two empty-id nodes into a doc already holding `n1`
and `n2` → both fallback nodes get fresh, non-colliding ids; no node is
overwritten.

### Success criteria
No id collision on the merge/append path; existing deserialize tests green.

---

## Execution & constraints

- Subagent-driven; per-task review gate; run the full suite at each SP boundary.
- **Run `typecheck:demos` before the checkpoint** (a prior checkpoint skipped it
  and latent demo errors surfaced later).
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Every test file in a `tests/` subfolder next to its source.
- Real TS enums, no string-literal unions.
- No git push; local only unless the user asks.
- On completion: full suite + typecheck + typecheck:demos green, then present the
  finishing-a-development-branch options. If the legacy deletion or auto-grow
  changes the published surface, a version bump + republish decision is the
  user's.
