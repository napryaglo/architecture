import {
    PointerEventArgs,
    WheelEventArgs,
    type PointerEventInit,
    type WheelEventInit,
    buildRoute,
    dispatchPointer,
    dispatchPointerDirect,
} from './routed-event.js';
import type { Visual } from './visual.js';

// Owns the per-target pointer state and turns raw pointer hits into
// routed-event dispatches. One InputManager per PresentationTarget;
// each target's host adapter (HtmlTarget for browser, future native
// targets) instantiates one and forwards normalised PointerEventInit
// records into the public Inject* methods.
//
// Responsibilities:
//
//   * Hover-chain diffing — when the pointer moves over a new Visual,
//     compute the route from the new leaf up to the root, diff it
//     against the previous route, and raise PointerLeave on visuals
//     dropped from the chain plus PointerEnter on visuals added. The
//     hover diff is what keeps `IsMouseOver` correct on containers as
//     the pointer crosses sibling boundaries.
//
//   * IsMouseOver maintenance — the dispatcher itself doesn't touch
//     DPs; the InputManager sets `IsMouseOver` on every Visual in the
//     new chain to `true` and on every Visual leaving the chain to
//     `false`. Triggers see the DP change and re-evaluate via the
//     existing PropertyTrigger plumbing.
//
//   * IsPressed maintenance — PointerDown sets IsPressed on the Source
//     visual; PointerUp clears it. WPF clears IsPressed even when the
//     up happens outside the visual's bounds, so the manager tracks
//     the down-Source separately from the current hover chain.
//
//   * PointerMove dispatch — fired after the hover diff so handlers
//     see a stable chain.

export class InputManager
{
    // Most-recent hover route (leaf-first), or empty when the pointer
    // is outside the target. Used to diff against the new route on
    // every move.
    private hoverRoute: Visual[] = [];

    // Visual on which the active primary-button press began. Tracked
    // so PointerUp can clear IsPressed regardless of where the pointer
    // ends up — matches WPF Button behaviour where pressing inside a
    // button then dragging outside still clears IsPressed on Up.
    //
    // Keyed off pointer ID so multi-touch presses on different visuals
    // can coexist; for v1 every browser pointer event with the same
    // pointerId shares a press target.
    private pressTargets: Map<number, Visual> = new Map();

    // Per-pointer capture. While captured, Move / Up events route to
    // the captured Visual regardless of what's actually under the
    // pointer — the same contract as WPF's Mouse.Capture / the DOM's
    // setPointerCapture. Used by drag-tracking controls (e.g. a
    // ScrollBar thumb) so the drag survives a pointer that wanders
    // outside the source visual.
    //
    // Hover state (IsMouseOver / Enter / Leave) is NOT redirected —
    // hover follows the actual hit so visual feedback stays accurate
    // even during a capture.
    private pointerCaptures: Map<number, Visual> = new Map();

    // ── Public entry points ────────────────────────────────────────

    // Pointer moved to a new (or null) Visual at the given host
    // coords. `hit === null` means the pointer left the host element
    // entirely.
    public InjectPointerMove(hit: Visual | null, init: PointerEventInit): void
    {
        this.updateHoverChain(hit, init);

        // Capture overrides hit-test for dispatch — a thumb being
        // dragged keeps receiving Move events even when the cursor
        // crosses outside its bounds.
        const captured = this.pointerCaptures.get(init.PointerId);
        const dispatchTarget = captured ?? hit;
        if (dispatchTarget === null || dispatchTarget === undefined) return;

        dispatchPointer(new PointerEventArgs('PointerMove', dispatchTarget, init, this));
    }

    public InjectPointerLeave(init: PointerEventInit): void
    {
        // Pointer left the host entirely — collapse the chain.
        this.updateHoverChain(null, init);
    }

    public InjectPointerDown(hit: Visual, init: PointerEventInit): void
    {
        // Make sure hover state is current before the down event —
        // a fast tap can race ahead of a move event.
        this.updateHoverChain(hit, init);

        this.pressTargets.set(init.PointerId, hit);
        setIsPressed(hit, true);
        dispatchPointer(new PointerEventArgs('PointerDown', hit, init, this));
    }

    public InjectPointerUp(hit: Visual | null, init: PointerEventInit): void
    {
        const pressTarget = this.pressTargets.get(init.PointerId);
        if (pressTarget !== undefined)
        {
            setIsPressed(pressTarget, false);
            this.pressTargets.delete(init.PointerId);
        }

        // Dispatch Up to the captured visual first (drag-end belongs to
        // the dragger), then the hit, then the press target as a final
        // fallback so a click outside the visual still notifies it.
        const captured = this.pointerCaptures.get(init.PointerId);
        const dispatchTarget = captured ?? hit ?? pressTarget;
        if (dispatchTarget !== undefined)
        {
            dispatchPointer(new PointerEventArgs('PointerUp', dispatchTarget, init, this));
        }

        // Capture auto-releases on PointerUp — matches DOM
        // pointercancel / pointerup behaviour for setPointerCapture.
        if (captured !== undefined) this.pointerCaptures.delete(init.PointerId);

        if (hit !== null) this.updateHoverChain(hit, init);
    }

    public InjectPointerWheel(hit: Visual | null, init: WheelEventInit): void
    {
        if (hit === null) return;
        dispatchPointer(new WheelEventArgs(hit, init, this));
    }

    // ── Pointer capture ────────────────────────────────────────────

    // Begin capturing every subsequent Move / Up for `pointerId` to
    // `visual`. Capture stays until ReleasePointerCapture is called
    // or until the matching PointerUp arrives (auto-release). Calling
    // CapturePointer again with the same id swaps the captured visual.
    public CapturePointer(visual: Visual, pointerId: number = 0): void
    {
        this.pointerCaptures.set(pointerId, visual);
    }

    public ReleasePointerCapture(pointerId: number = 0): void
    {
        this.pointerCaptures.delete(pointerId);
    }

    public GetCapturedVisual(pointerId: number = 0): Visual | undefined
    {
        return this.pointerCaptures.get(pointerId);
    }

    // ── Internals ──────────────────────────────────────────────────

    // Diff the prior hover route against the new one, fire Leave on
    // visuals dropped and Enter on visuals added, and update
    // IsMouseOver in lock-step. Visuals that stay in the route (the
    // common-ancestor prefix shared between old and new routes) are
    // left untouched — no DP write, no Enter/Leave fire.
    private updateHoverChain(hit: Visual | null, init: PointerEventInit): void
    {
        const newRoute = hit === null ? [] : buildRoute(hit);
        const oldSet   = new Set(this.hoverRoute);
        const newSet   = new Set(newRoute);

        // Leave: in old but not new. Walk leaf-first so child sees
        // Leave before its parent (matches WPF firing order).
        for (const v of this.hoverRoute)
        {
            if (newSet.has(v)) continue;
            setIsMouseOver(v, false);
            dispatchPointerDirect(new PointerEventArgs('PointerLeave', v, init));
        }

        // Enter: in new but not old. Walk leaf-first so the deepest
        // newly-entered visual fires Enter first; tunnel pass on each
        // dispatch still walks root → target as usual.
        for (const v of newRoute)
        {
            if (oldSet.has(v)) continue;
            setIsMouseOver(v, true);
            dispatchPointerDirect(new PointerEventArgs('PointerEnter', v, init));
        }

        this.hoverRoute = newRoute;
    }
}

// ── DP write helpers ───────────────────────────────────────────────

// IsMouseOver and IsPressed are DPs registered on Visual itself.
// These helpers are duck-typed so this module doesn't need to import
// Visual (which already imports things that would cycle). At runtime
// `set_property_value` is the public Model API; the property names
// are exactly the strings registered in visual.ts.
interface VisualWithDp
{
    set_property_value(name: string, value: unknown): void;
}

function setIsMouseOver(v: Visual, value: boolean): void
{
    (v as unknown as VisualWithDp).set_property_value('IsMouseOver', value);
}

function setIsPressed(v: Visual, value: boolean): void
{
    (v as unknown as VisualWithDp).set_property_value('IsPressed', value);
}
