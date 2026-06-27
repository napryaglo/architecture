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

import type { Element } from '../element.js';
import { FocusNavigationDirection } from './input-enums.js';
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
                return linearMove(stops, from, direction === FocusNavigationDirection.Next);
            default:
                return directionalMove(stops, from, direction);
        }
    }
}

// Topmost visual ancestor of `el` (the navigation root).
function rootOf(el: Element): Element
{
    let cur = el;
    let parent = cur.GetVisualParent() as Element | undefined;
    while (parent !== undefined) { cur = parent; parent = cur.GetVisualParent() as Element | undefined; }
    return cur;
}

// All tab stops under `root` (focusable + IsTabStop + enabled + hit-test
// visible), in visual-tree document order, then stable-sorted by
// TabIndex (ascending; +Infinity default sorts last).
function tabStops(root: Element): Element[]
{
    const out: Element[] = [];
    collect(root, out);
    // Stable sort by TabIndex — Array.prototype.sort is stable in modern
    // engines, so equal TabIndex keeps document order.
    return out
        .map((el, i) => ({ el, i, t: el.TabIndex }))
        .sort((a, b) => (a.t - b.t) || (a.i - b.i))
        .map(e => e.el);
}

function collect(el: Element, out: Element[]): void
{
    if (isTabStop(el)) out.push(el);
    // Skip the subtree of a disabled / collapsed ancestor — its
    // descendants can't take focus either.
    if (el.IsEnabled === false) return;
    for (const child of el.visualChildren)
    {
        collect(child as Element, out);
    }
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
