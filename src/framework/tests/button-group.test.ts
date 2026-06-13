import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { Size, Rect } from '../../runtime/index.js';
import { Border } from '../../basic/border.js';
import { ButtonGroup } from '../button-group.js';

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

describe('ButtonGroup hover expansion (snapped — bypasses the tween)', () => {

    test('with a lerp=1 hovered child, that child is wider and siblings shrink', () => {
        initTestApp();
        const g = new ButtonGroup();
        const a = new Border();
        const b = new Border();
        const c = new Border();
        g.AddChild(a); g.AddChild(b); g.AddChild(c);
        // Directly set _lerps for `a` to 1, bypassing the polled tween,
        // so we can pin the arranged geometry.
        ((g as unknown as { _lerps: Map<unknown, number> })._lerps).set(a, 1);
        g.Measure(new Size(500, 40));
        g.Arrange(new Rect(0, 0, g.DesiredSize.Width, 40));
        const wA = (a as unknown as { ArrangedRect: Rect }).ArrangedRect.Width;
        const wB = (b as unknown as { ArrangedRect: Rect }).ArrangedRect.Width;
        const wC = (c as unknown as { ArrangedRect: Rect }).ArrangedRect.Width;
        // a expanded to HoverWidth=120 (+40 vs base).
        // The shrink is distributed across siblings: shrink_total = 40,
        // each sibling at lerp=0 absorbs shrink = totalLerp*Δ/(n-1) = 1*40/2 = 20.
        // So b, c each → 80 - 20 = 60.
        assert.equal(wA, 120);
        assert.equal(wB, 60);
        assert.equal(wC, 60);
        // Row width pinned at resting total (3·80 + 2·spacing).
        assert.equal(wA + wB + wC, 240);
    });
});
