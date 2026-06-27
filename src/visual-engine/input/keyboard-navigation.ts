// WPF-parity keyboard navigation (System.Windows.Input.KeyboardNavigation
// + TraversalRequest). Computes Tab order and directional focus moves
// over the Element tree and drives focus through the element's Focus()
// bridge.
//
// Scope notes vs WPF:
//   * Tab / Shift+Tab traversal, TabIndex ordering, IsTabStop opt-out,
//     and First/Last/Next/Previous/directional MoveFocus are implemented.
//   * Tab navigation wraps at the ends (WPF KeyboardNavigationMode.Cycle)
//     by default — the common behaviour for a self-contained surface.
//     Per-container TabNavigation modes (Once/Contained/Local/None) are a
//     follow-up; the enum (KeyboardNavigationMode) already exists.
//   * Tab / Shift+Tab are auto-wired by the InputManager. Arrow-key
//     directional navigation is NOT auto-wired (mural controls — Selector,
//     Slider, TreeView, … — already own arrow keys); use the MoveFocus
//     API to drive directional moves from a control or behavior.

import { Model } from '../../runtime/model.js';
import { MetaData } from '../../runtime/metadata.js';
import type { Element } from '../element.js';
import { FocusNavigationDirection, KeyboardNavigationMode } from './input-enums.js';
import { Keyboard } from './keyboard.js';

// A focus-move request — direction only, mirroring WPF's TraversalRequest.
export class TraversalRequest
{
    public readonly FocusNavigationDirection: FocusNavigationDirection;
    constructor(direction: FocusNavigationDirection)
    {
        this.FocusNavigationDirection = direction;
    }
}

interface Rect { x: number; y: number; w: number; h: number; }

export class KeyboardNavigation
{
    // Attached: per-container Tab-traversal mode (WPF parity).
    //   Continue  — flat traversal in/out of the container (default).
    //   None      — the container's descendants are skipped by Tab.
    //   Once      — Tab enters the container once (its first stop), then
    //               leaves; the rest of the container is skipped.
    //   Cycle     — Tab wraps within the container (never leaves via Tab).
    //   Contained — Tab is clamped to the container (stops at the ends).
    //   Local     — TabIndex is scoped per container (local ordering).
    public static readonly TabNavigationKey = Model.RegisterAttachedProperty<KeyboardNavigationMode>(
        KeyboardNavigation, 'TabNavigation', KeyboardNavigationMode.Continue, MetaData.None);

    public static GetTabNavigation(el: Element): KeyboardNavigationMode
    {
        return el.get_property_value(KeyboardNavigation.TabNavigationKey);
    }
    public static SetTabNavigation(el: Element, mode: KeyboardNavigationMode): void
    {
        el.set_property_value(KeyboardNavigation.TabNavigationKey, mode);
    }

    // Move keyboard focus per `request`, starting from `from` (defaults to
    // the current keyboard-focused element). Returns true when focus
    // actually moved. The new element is focused through its Focus()
    // bridge.
    public static MoveFocus(request: TraversalRequest, from?: Element): boolean
    {
        const origin = from ?? Keyboard.FocusedElement;
        const next = KeyboardNavigation.PredictFocus(request.FocusNavigationDirection, origin);
        if (next === undefined || next === origin) return false;
        next.Focus();
        return Keyboard.FocusedElement === next;
    }

    // Compute the element focus WOULD move to for `direction` from
    // `origin` (default: current focus), WITHOUT moving it. Returns
    // undefined when there's no candidate.
    public static PredictFocus(
        direction: FocusNavigationDirection,
        origin?: Element,
    ): Element | undefined
    {
        const from = origin ?? Keyboard.FocusedElement;
        const root = from === undefined ? undefined : rootOf(from);
        if (root === undefined) return undefined;

        const stops = tabStops(root);
        if (stops.length === 0) return undefined;

        switch (direction)
        {
            case FocusNavigationDirection.First: return stops[0];
            case FocusNavigationDirection.Last:  return stops[stops.length - 1];
            case FocusNavigationDirection.Next:
            case FocusNavigationDirection.Previous:
                return tabMove(root, from, direction === FocusNavigationDirection.Next);
            default:
                return directionalMove(stops, from, direction);
        }
    }
}

// Next / previous tab stop honouring per-container TabNavigation modes.
// When `from` sits inside a Cycle / Contained container the move is scoped
// to that container (wrap vs clamp at the ends); otherwise it walks the
// whole hierarchical order and wraps at the root (the default surface
// behaviour).
function tabMove(root: Element, from: Element | undefined, forward: boolean): Element | undefined
{
    if (from !== undefined)
    {
        const scope = navScopeOf(from);
        if (scope !== undefined)
        {
            const mode = tabNav(scope);
            const sStops: Element[] = [];
            appendStops(scope, sStops);
            const idx = sStops.indexOf(from);
            if (idx !== -1)
            {
                const n = sStops.length;
                const nextIdx = forward ? idx + 1 : idx - 1;
                if (nextIdx >= 0 && nextIdx < n) return sStops[nextIdx];
                // Boundary of the scope.
                if (mode === KeyboardNavigationMode.Cycle) return sStops[forward ? 0 : n - 1];
                if (mode === KeyboardNavigationMode.Contained) return from; // clamp → no move
            }
        }
    }
    const stops: Element[] = [];
    appendStops(root, stops);
    return linearMove(stops, from, forward);
}

// Nearest ANCESTOR of `from` whose TabNavigation confines traversal
// (Cycle / Contained), or undefined.
function navScopeOf(from: Element): Element | undefined
{
    let cur = from.GetVisualParent() as Element | undefined;
    while (cur !== undefined)
    {
        const m = tabNav(cur);
        if (m === KeyboardNavigationMode.Cycle || m === KeyboardNavigationMode.Contained) return cur;
        cur = cur.GetVisualParent() as Element | undefined;
    }
    return undefined;
}

function tabNav(el: Element): KeyboardNavigationMode
{
    return el.get_property_value(KeyboardNavigation.TabNavigationKey);
}

// Topmost visual ancestor of `el` (the navigation root).
function rootOf(el: Element): Element
{
    let cur = el;
    let parent = cur.GetVisualParent() as Element | undefined;
    while (parent !== undefined) { cur = parent; parent = cur.GetVisualParent() as Element | undefined; }
    return cur;
}

// All tab stops under `root` in hierarchical tab order: at each level the
// children are ordered by TabIndex (ascending; +Infinity default sorts
// last), then their subtrees are appended depth-first. Sorting PER LEVEL
// gives WPF's container-local TabIndex semantics (KeyboardNavigationMode
// .Local) and the natural order for .Continue. Per-container modes
// (None / Once) prune the walk; Cycle / Contained affect movement, not
// collection (see tabMove).
function tabStops(root: Element): Element[]
{
    const out: Element[] = [];
    appendStops(root, out);
    return out;
}

function appendStops(el: Element, out: Element[]): void
{
    // A disabled subtree can't take focus at all.
    if (el.IsEnabled === false) return;

    const mode = tabNav(el);
    if (mode === KeyboardNavigationMode.None)
    {
        // The container itself may be a stop, but its descendants are not
        // reachable by Tab.
        if (isTabStop(el)) out.push(el);
        return;
    }

    if (isTabStop(el)) out.push(el);

    const kids = sortedChildren(el);
    if (mode === KeyboardNavigationMode.Once)
    {
        // Enter the container only once: keep just the first child subtree
        // that contributes a stop.
        for (const k of kids)
        {
            const before = out.length;
            appendStops(k, out);
            if (out.length > before) break;
        }
        return;
    }

    for (const k of kids) appendStops(k, out);
}

// Children ordered by TabIndex, ties broken by document (visual) order.
function sortedChildren(el: Element): Element[]
{
    return [...el.visualChildren]
        .map((c, i) => ({ c: c as Element, i, t: (c as Element).TabIndex }))
        .sort((a, b) => (a.t - b.t) || (a.i - b.i))
        .map(x => x.c);
}

function isTabStop(el: Element): boolean
{
    return el.Focusable === true
        && el.IsTabStop === true
        && el.IsEnabled !== false
        && el.IsHitTestVisible === true;
}

// Next / previous in the linear tab order, wrapping at the ends (Cycle).
function linearMove(stops: Element[], from: Element | undefined, forward: boolean): Element | undefined
{
    const idx = from === undefined ? -1 : stops.indexOf(from);
    const n = stops.length;
    if (idx === -1) return forward ? stops[0] : stops[n - 1];
    const next = forward ? (idx + 1) % n : (idx - 1 + n) % n;
    return stops[next];
}

// Nearest tab stop in a geometric direction (Left/Right/Up/Down).
// Picks the candidate whose centre lies in the requested half-plane and
// is closest to the origin's centre (primary-axis distance weighted
// over cross-axis drift).
function directionalMove(
    stops: Element[],
    from: Element | undefined,
    direction: FocusNavigationDirection,
): Element | undefined
{
    if (from === undefined) return stops[0];
    const a = centreOf(from);
    let best: Element | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const s of stops)
    {
        if (s === from) continue;
        const b = centreOf(s);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let primary: number, cross: number;
        switch (direction)
        {
            case FocusNavigationDirection.Left:  if (dx >= 0) continue; primary = -dx; cross = Math.abs(dy); break;
            case FocusNavigationDirection.Right: if (dx <= 0) continue; primary =  dx; cross = Math.abs(dy); break;
            case FocusNavigationDirection.Up:    if (dy >= 0) continue; primary = -dy; cross = Math.abs(dx); break;
            case FocusNavigationDirection.Down:  if (dy <= 0) continue; primary =  dy; cross = Math.abs(dx); break;
            default: continue;
        }
        // Weight cross-axis drift so an element straight ahead beats one
        // off to the side at the same primary distance.
        const score = primary + cross * 2;
        if (score < bestScore) { bestScore = score; best = s; }
    }
    return best;
}

function centreOf(el: Element): { x: number; y: number }
{
    const r = absoluteRect(el);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function absoluteRect(el: Element): Rect
{
    let x = 0;
    let y = 0;
    let cur: Element | undefined = el;
    while (cur !== undefined)
    {
        x += cur.ArrangedRect.X;
        y += cur.ArrangedRect.Y;
        cur = cur.GetVisualParent() as Element | undefined;
    }
    return { x, y, w: el.ArrangedRect.Width, h: el.ArrangedRect.Height };
}
