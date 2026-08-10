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

## SP1 — Auto-Grow (VM-side, mirrors `Figure._applyAutoFit`)

### Problem
`TextNodeVM` ctor sets `Text.AutoFit = TextAutoFit.GrowShape`
([text-node-vm.ts:35-38]) but there is no `_applyAutoFit` on the VM, so the mode
is inert. The legacy `Figure._applyAutoFit` ([figure.ts:353-364]) measures its
`ShapeText` label unconstrained (`label.Measure(∞,∞)`), reads
`label.DesiredSize`, and grows the figure.

### Approach (revised after investigation)
The original design assumed a VM "has no visual tree to measure text" and routed
the fix through the container Figure. Investigation disproved that premise: a
standalone `ShapeText` measures its content headlessly under `initTestApp()`
(see [shape-text.test.ts:312-322] — `new ShapeText(); st.Content='x';
st.Measure(...)` yields a content-hugging size, and `ShapeText` applies its own
default template in its constructor). Crucially, the **VM already owns that exact
object**: `TextNodeVM.Text` is the `ShapeText` the `[DataType=TextNodeVM]`
template slots into `PART_LabelHost` via `Content=$Text`.

So the VM can measure its own `ShapeText` directly — the same call the legacy
Figure makes — with **no container hook, no `figure.ts` change, no cross-layer
coupling**:

1. Add a private `_applyAutoFit()` to `TextNodeVM` that mirrors
   `Figure._applyAutoFit` verbatim against `this.Text`:
   - return early unless `this.Text?.AutoFit === TextAutoFit.GrowShape`;
   - `this.Text.Measure(new Size(∞, ∞))`, read `DesiredSize`;
   - `needW = d.Width + margin*2`, `needH = d.Height + margin*2` using
     `DiagramSettings.ShapeLabelMargin()`;
   - **grow-only**: `if (needW > this.Width) this.Width = needW;` likewise
     Height. Grow-only + this being the sole caller path (never called from a
     Width/Height change) prevents oscillation.
2. Call `_applyAutoFit()` from the existing `_onLabelChanged` handler (fires on
   `ShapeText.Document`/`Content` change) and once at the end of the constructor
   — exactly the trigger points the Figure uses.
3. `CalloutNodeVM` inherits `_applyAutoFit` for free; its existing
   `OnPropertyChanged` already recomputes the leader when `Height`/`Width`
   change, so the leader follows the grown box.

No `NodeViewModel.AutoSizeToContent` field and no `figure.ts` edits are needed.

### MVVM note
These are framework diagram classes (`src/framework/diagram`), not demo
`*-vm.mts` files, so the demo-scoped MVVM rules do not apply. `TextNodeVM`
already holds the `ShapeText` DP and calls `resolveFields` on it; measuring it is
consistent with existing behavior.

### Testability (already de-risked)
The confirming test IS the SP1 acceptance test: construct a `TextNodeVM`, set a
long `LabelText`, assert `Width`/`Height` grew past the 120×44 default; set a
shorter text, assert it did **not** shrink (grow-only). No template realization
or container needed. `initTestApp()` provides the text-measurement backend the
standalone `ShapeText` tests already rely on.

### Files
- `src/framework/diagram/text-node-vm.ts` — add `_applyAutoFit`, wire into
  `_onLabelChanged` + ctor.
- `src/framework/diagram/tests/*.test.ts` — grow-only auto-fit test.

### Success criteria
A `TextNodeVM` grows its `Width`/`Height` to fit its text; growth is monotonic
(never shrinks) and idempotent (no oscillation); a `CalloutNodeVM` grows the
same way and its leader still tracks. Legacy Figure auto-fit behavior is
untouched.

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
