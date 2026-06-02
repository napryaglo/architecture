import {
    FocusEventArgs,
    KeyEventArgs,
    PointerEventArgs,
    TextInputEventArgs,
    WheelEventArgs,
    type KeyEventInit,
    type PointerEventInit,
    type TextInputEventInit,
    type WheelEventInit,
    buildRoute,
    dispatchFocus,
    dispatchKey,
    dispatchPointer,
    dispatchPointerDirect,
    dispatchTextInput,
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

    // Currently-focused Visual — the keyboard event source. At most one
    // per target. Set by SetFocus (from Visual.Focus() / args.SetFocus()
    // / host-side click-to-focus) and cleared by SetFocus(undefined).
    // Maintained in lock-step with the IsFocused DP on each Visual so
    // Style triggers / read-back via tb.IsFocused stay coherent.
    private focusedVisual: Visual | undefined;

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

        dispatchPointer(new PointerEventArgs('PointerMove', dispatchTarget, init, this, this));
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
        dispatchPointer(new PointerEventArgs('PointerDown', hit, init, this, this));
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
            dispatchPointer(new PointerEventArgs('PointerUp', dispatchTarget, init, this, this));
        }

        // Capture auto-releases on PointerUp — matches DOM
        // pointercancel / pointerup behaviour for setPointerCapture.
        if (captured !== undefined) this.pointerCaptures.delete(init.PointerId);

        if (hit !== null) this.updateHoverChain(hit, init);
    }

    public InjectPointerWheel(hit: Visual | null, init: WheelEventInit): void
    {
        if (hit === null) return;
        dispatchPointer(new WheelEventArgs(hit, init, this, this));
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

    // ── Focus ──────────────────────────────────────────────────────

    public GetFocusedVisual(): Visual | undefined
    {
        return this.focusedVisual;
    }

    // Move focus to `visual` (or clear focus when undefined). Refuses
    // to focus a Visual whose `Focusable` is false — the call is a
    // silent no-op in that case (matches WPF Keyboard.Focus on a non-
    // focusable element). When the target is unchanged, nothing fires.
    //
    // Sequence on a real focus change:
    //   1. Clear IsFocused on the old focused Visual (if any).
    //   2. Dispatch LostFocus on the old Visual (bubble pass).
    //   3. Set IsFocused on the new focused Visual.
    //   4. Dispatch GotFocus on the new Visual (bubble pass).
    // DP writes BEFORE dispatch so handlers see the post-change state.
    public SetFocus(visual: Visual | undefined): void
    {
        if (visual === this.focusedVisual) return;
        if (visual !== undefined && !isFocusable(visual)) return;

        const old = this.focusedVisual;
        this.focusedVisual = visual;

        if (old !== undefined)
        {
            setIsFocused(old, false);
            dispatchFocus(new FocusEventArgs('LostFocus', old));
        }
        if (visual !== undefined)
        {
            setIsFocused(visual, true);
            dispatchFocus(new FocusEventArgs('GotFocus', visual));
        }
    }

    // ── Keyboard ───────────────────────────────────────────────────

    // Dispatch KeyDown to the currently-focused Visual (and its
    // ancestors via tunnel + bubble). Returns true if any handler
    // marked the event Handled — the host adapter (HtmlTarget) uses
    // that to decide whether to preventDefault on the underlying DOM
    // event (suppress page scroll on Space, autorepeat on arrows, etc).
    // Returns false when nothing is focused, when focus is unattached
    // to a target, or when no handler claimed the key.
    public InjectKeyDown(init: KeyEventInit): boolean
    {
        const target = this.focusedVisual;
        if (target === undefined) return false;
        const args = new KeyEventArgs('KeyDown', target, init);
        dispatchKey(args);
        return args.Handled;
    }

    public InjectKeyUp(init: KeyEventInit): boolean
    {
        const target = this.focusedVisual;
        if (target === undefined) return false;
        const args = new KeyEventArgs('KeyUp', target, init);
        dispatchKey(args);
        return args.Handled;
    }

    // Dispatch TextInput to the currently-focused Visual. Separated
    // from KeyDown so handlers can subscribe only to "textual" content
    // (already composed by the IME / browser layer) without seeing
    // every arrow / function key. HtmlTarget synthesises this from
    // printable keydown events when no IME compose is in flight; the
    // browser's beforeinput / compositionend events feed it on real
    // text input.
    public InjectTextInput(init: TextInputEventInit): boolean
    {
        const target = this.focusedVisual;
        if (target === undefined) return false;
        const args = new TextInputEventArgs(target, init);
        dispatchTextInput(args);
        return args.Handled;
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

function setIsFocused(v: Visual, value: boolean): void
{
    (v as unknown as VisualWithDp).set_property_value('IsFocused', value);
}

// Read the Focusable DP without importing Visual (would cycle through
// to routed-event.ts via the type alias). Same duck-typed read pattern
// as the setters above.
interface VisualWithReadDp { get_property_value(name: string): unknown }

function isFocusable(v: Visual): boolean
{
    return (v as unknown as VisualWithReadDp).get_property_value('Focusable') === true;
}
