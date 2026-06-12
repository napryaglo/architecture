import { Color, Thickness } from '../primitives.js';
import type { Visual } from '../visual.js';
import type { PropertyTransition } from './property-transition.js';
import { Storyboard } from './storyboard.js';
import {
    ColorAnimation,
    DoubleAnimation,
    FillBehavior,
    ThicknessAnimation,
    type AnimationTimeline,
} from './timeline.js';

// Engine that interprets PropertyTransition specs on a Visual.
//
// CSS-`transition`-style semantics: when a DP whose name matches one
// of the Visual's Transitions changes, fire an animation from oldValue
// → newValue over the configured Duration / Easing instead of letting
// the value snap. Concurrent writes cancel the in-flight animation
// and start a fresh one (last-write-wins).
//
// Type dispatch:
//   - number → DoubleAnimation
//   - Color → ColorAnimation
//   - Thickness → ThicknessAnimation
//   - other types → no-op (the value snaps; we log nothing because the
//     symmetric "type doesn't match" case is too noisy to flag).
//
// Brush animation is intentionally NOT routed here — Brushes live in
// visual-engine which the runtime cannot import. SolidColorBrush
// already has a dedicated animation factory wired through the scheme-
// transition path; future Brush-aware implicit transitions can ride
// the same registration pattern.
//
// Bookkeeping: one Storyboard per (visual, property name) tracked in
// a per-visual map. Cancel + clear the map slot when a new transition
// starts OR when the animation completes (HoldEnd lets the final value
// pin so a quick succession of writes doesn't drop frames).

// Per-Visual "currently-running implicit transitions" map. The key is
// the property descriptor name; the value is the active Storyboard.
// Stored in a WeakMap so detached visuals get GC'd without explicit
// teardown.
const _activeByVisual = new WeakMap<Visual, Map<string, Storyboard>>();

function getActiveMap(visual: Visual): Map<string, Storyboard>
{
    let m = _activeByVisual.get(visual);
    if (m === undefined)
    {
        m = new Map();
        _activeByVisual.set(visual, m);
    }
    return m;
}

// Cancel and unregister any in-flight implicit transition for
// (visual, propertyName). Used both by the engine itself (before
// starting a new transition) and by external callers wanting to
// short-circuit an animation (e.g., test cleanup, a control that
// wants to claim the Animated tier directly).
export function cancelImplicitTransition(visual: Visual, propertyName: string): void
{
    const m = _activeByVisual.get(visual);
    if (m === undefined) return;
    const sb = m.get(propertyName);
    if (sb === undefined) return;
    sb.Stop();
    m.delete(propertyName);
}

// Construct the right Timeline subclass for the value type. Returns
// undefined for types we don't know how to interpolate — the caller
// short-circuits to a snap in that case.
function buildTimeline(
    oldValue: unknown,
    newValue: unknown,
    transition: PropertyTransition,
): AnimationTimeline | undefined
{
    if (typeof oldValue === 'number' && typeof newValue === 'number')
    {
        const t = new DoubleAnimation();
        t.From         = oldValue;
        t.To           = newValue;
        t.Duration     = transition.Duration;
        t.Easing       = transition.Easing;
        // HoldEnd so the final value pins on the Animated tier until
        // the next write — matches CSS `transition` behaviour where
        // there's no off-by-a-frame snap at the end.
        t.FillBehavior = FillBehavior.HoldEnd;
        return t;
    }
    if (oldValue instanceof Color && newValue instanceof Color)
    {
        const t = new ColorAnimation();
        t.From         = oldValue;
        t.To           = newValue;
        t.Duration     = transition.Duration;
        t.Easing       = transition.Easing;
        t.FillBehavior = FillBehavior.HoldEnd;
        return t;
    }
    if (oldValue instanceof Thickness && newValue instanceof Thickness)
    {
        const t = new ThicknessAnimation();
        t.From         = oldValue;
        t.To           = newValue;
        t.Duration     = transition.Duration;
        t.Easing       = transition.Easing;
        t.FillBehavior = FillBehavior.HoldEnd;
        return t;
    }
    return undefined;
}

// Apply a PropertyTransition to (visual, propertyName) for a value
// change. Cancels any prior in-flight transition for the same DP,
// constructs a fresh Storyboard with the right Animation subclass,
// and Begins it. The Storyboard auto-removes itself from the active-
// map on completion.
//
// Called from Visual.OnPropertyChanged when a matching transition is
// found in this.Transitions. Returns true when an animation was
// actually started (so callers can short-circuit a snap-fall-through),
// false when the type wasn't animatable.
export function applyImplicitTransition(
    visual: Visual,
    propertyName: string,
    oldValue: unknown,
    newValue: unknown,
    transition: PropertyTransition,
): boolean
{
    // Identity check — a write that doesn't actually change the value
    // is no transition to run.
    if (Object.is(oldValue, newValue)) return false;
    // Zero duration — snap instead of starting an animation that
    // wouldn't be visible. Matches CSS's `transition: 0s` semantics.
    if (transition.Duration <= 0) return false;

    const timeline = buildTimeline(oldValue, newValue, transition);
    if (timeline === undefined) return false;

    // Cancel any in-flight animation on the same DP.
    cancelImplicitTransition(visual, propertyName);

    const sb = new Storyboard();
    sb.Add(visual, propertyName, timeline);
    // Self-cleanup on Completed: drop the active-map entry so the next
    // write can start a fresh transition without contending with a
    // stale registration. (Storyboard's HoldEnd keeps the Animated
    // tier value pinned even after the storyboard transitions to
    // Filling, which is the desired CSS-`transition`-end behaviour.)
    sb.AddCompletedListener(() =>
    {
        const m = _activeByVisual.get(visual);
        if (m === undefined) return;
        if (m.get(propertyName) === sb) m.delete(propertyName);
    });

    getActiveMap(visual).set(propertyName, sb);
    sb.Begin();
    return true;
}
