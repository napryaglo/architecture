import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { Size, Rect, Easings, AnimationManager, ManualClock } from '../../runtime/index.js';
import { Border } from '../../basic/border.js';
import { ButtonGroup } from '../button-groups/button-group.js';

// Read a child's arranged geometry through the public getter (typed via
// cast — ArrangedRect is on Visual).
function arranged(v: object): Rect
{
    return (v as unknown as { ArrangedRect: Rect }).ArrangedRect;
}

// Set the (view-invisible) hover target directly, bypassing the routed
// PointerEnter/Leave plumbing so geometry can be pinned deterministically.
function setHover(g: ButtonGroup, child: object | undefined): void
{
    (g as unknown as { _hovered: object | undefined })._hovered = child;
    g.InvalidateArrange();
}

describe('ButtonGroup defaults', () => {

    test('BaseWidth=80, HoverWidth=120, Spacing=4, DurationMs=200', () => {
        initTestApp();
        const g = new ButtonGroup();
        assert.equal(g.BaseWidth,  80);
        assert.equal(g.HoverWidth, 120);
        assert.equal(g.Spacing,     4);
        assert.equal(g.DurationMs, 200);
    });
});

describe('ButtonGroup layout — resting', () => {

    test('empty row reports zero width', () => {
        initTestApp();
        const g = new ButtonGroup();
        g.Measure(new Size(500, 40));
        assert.equal(g.DesiredSize.Width, 0);
    });

    test('3 children at rest → 3·BaseWidth + 2·Spacing', () => {
        initTestApp();
        const g = new ButtonGroup();
        g.AddChild(new Border());
        g.AddChild(new Border());
        g.AddChild(new Border());
        g.Measure(new Size(500, 40));
        // 3 * 80 + 2 * 4 = 248
        assert.equal(g.DesiredSize.Width, 248);
    });

    test('arrange places resting children at BaseWidth, with Spacing gaps', () => {
        initTestApp();
        const g = new ButtonGroup();
        const a = new Border();
        const b = new Border();
        const c = new Border();
        g.AddChild(a); g.AddChild(b); g.AddChild(c);
        g.Measure(new Size(500, 40));
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        // Children's ArrangedRect: a@(0..80), b@(84..164), c@(168..248).
        assert.equal((a as unknown as { ArrangedRect: Rect }).ArrangedRect.X,     0);
        assert.equal((a as unknown as { ArrangedRect: Rect }).ArrangedRect.Width, 80);
        assert.equal((b as unknown as { ArrangedRect: Rect }).ArrangedRect.X,     84);
        assert.equal((c as unknown as { ArrangedRect: Rect }).ArrangedRect.X,     168);
    });
});

describe('ButtonGroup hover expansion (snapped — DurationMs=0 bypasses the tween)', () => {

    test('a hovered child is wider and siblings shrink to absorb', () => {
        initTestApp();
        const g = new ButtonGroup();
        g.DurationMs = 0;                 // instant — ArrangeChild snaps to target
        const a = new Border();
        const b = new Border();
        const c = new Border();
        g.AddChild(a); g.AddChild(b); g.AddChild(c);
        setHover(g, a);
        g.Measure(new Size(500, 40));
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        const wA = arranged(a).Width;
        const wB = arranged(b).Width;
        const wC = arranged(c).Width;
        // a expanded to HoverWidth=120 (+40 vs base); the +40 gain is
        // absorbed uniformly by the two siblings → each 80 − 20 = 60.
        assert.equal(wA, 120);
        assert.equal(wB, 60);
        assert.equal(wC, 60);
        // Row width pinned at resting total (3·80 + 2·spacing).
        assert.equal(wA + wB + wC, 240);
    });
});

describe('ButtonGroup arrange transition (§18.3 — clock-driven tween)', () => {

    test('hover interpolates child geometry over DurationMs on the animation clock', () => {
        initTestApp();
        AnimationManager.ResetForTests();
        const clock = AnimationManager.Instance.Clock as ManualClock;

        const g = new ButtonGroup();
        g.DurationMs = 100;
        g.Easing = Easings.Linear;        // linear → exact midpoint math
        const a = new Border();
        const b = new Border();
        const c = new Border();
        g.AddChild(a); g.AddChild(b); g.AddChild(c);
        g.Measure(new Size(500, 40));

        // Resting layout — every child at BaseWidth (snapped, no tween).
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        assert.equal(arranged(a).Width, 80);

        // Hover `a`. First arrange after the target change anchors the
        // tween at the displayed rect (still 80) — p = 0.
        setHover(g, a);
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        assert.equal(arranged(a).Width, 80);
        assert.equal(AnimationManager.Instance.Clock instanceof ManualClock, true);

        // Halfway through the duration → linear midpoint.
        clock.Tick(50);
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        assert.equal(arranged(a).Width, 100);   // lerp(80, 120, 0.5)
        assert.equal(arranged(b).Width, 70);     // lerp(80,  60, 0.5)
        assert.equal(arranged(c).Width, 70);

        // End of the duration → settled on target.
        clock.Tick(50);
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        assert.equal(arranged(a).Width, 120);
        assert.equal(arranged(b).Width, 60);
        assert.equal(arranged(c).Width, 60);
    });

    test('re-hovering a sibling mid-tween retargets from the current rect', () => {
        initTestApp();
        AnimationManager.ResetForTests();
        const clock = AnimationManager.Instance.Clock as ManualClock;

        const g = new ButtonGroup();
        g.DurationMs = 100;
        g.Easing = Easings.Linear;
        const a = new Border();
        const b = new Border();
        g.AddChild(a); g.AddChild(b);
        g.Measure(new Size(500, 40));
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));

        // Hover a, run halfway: a is en route 80 → 120, at 100.
        setHover(g, a);
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        clock.Tick(50);
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        assert.equal(arranged(a).Width, 100);

        // Now hover b instead. With n=2, a non-hovered child fully
        // absorbs the sibling's gain (shrink = 40/(2−1) = 40), so a's new
        // target is 80 − 40 = 40. It retargets from its CURRENT 100 over a
        // fresh 100ms window.
        setHover(g, b);
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        clock.Tick(50);
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        assert.equal(arranged(a).Width, 70);    // lerp(100, 40, 0.5)
    });
});
