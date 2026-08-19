import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Rect, Size } from '../../../runtime/index.js';
import { Border } from '../../../basic/index.js';
import { Diagram } from '../diagram.js';
import { AlignmentGuidesAdorner } from '../behaviors/alignment-guides-adorner.js';

// Regression: the adorner computed guides but rendered NOTHING because each
// pool Border was constructed with Width = 0 / Height = 0. Visual.Arrange treats
// an explicit size (even 0) as authoritative over the arrange rect, so every
// guide line collapsed to 0×0 — invisible. Found via a live Playwright repro
// (guides published, zero blue DOM). The fix leaves Width/Height unset so the
// Stretch default fills the arrange rect.
describe('AlignmentGuidesAdorner rendering', () => {
    test('guide lines arrange to non-zero size (not pinned to 0×0)', () => {
        Application.current = null;
        new Application();
        const diagram = new Diagram();
        const host = new Border();
        host.Width = 400; host.Height = 300;
        host.Measure(new Size(400, 300));
        host.Arrange(new Rect(0, 0, 400, 300));

        const adorner = new AlignmentGuidesAdorner(host, diagram);
        diagram._setAlignmentGuides([
            { axis: 'x' as const, position: 120, movingEdge: 'min' as const, otherEdge: 'min' as const, otherRect: new Rect(0, 0, 10, 10) },
            { axis: 'y' as const, position: 80,  movingEdge: 'min' as const, otherEdge: 'min' as const, otherRect: new Rect(0, 0, 10, 10) },
        ]);

        adorner.Measure(new Size(400, 300));
        adorner.Arrange(new Rect(0, 0, 400, 300));

        const pool = (adorner as unknown as { _pool: { RenderSize: Size }[] })._pool;
        // pool[0] ↔ guides[0] (vertical line at x=120): thickness × full height.
        assert.ok(pool[0].RenderSize.Width > 0 && pool[0].RenderSize.Height > 0,
            `vertical guide must have non-zero size, got ${pool[0].RenderSize.Width}×${pool[0].RenderSize.Height}`);
        assert.ok(Math.abs(pool[0].RenderSize.Height - 300) < 1, 'vertical guide spans the adorner height');
        // pool[1] ↔ guides[1] (horizontal line at y=80): full width × thickness.
        assert.ok(pool[1].RenderSize.Width > 0 && pool[1].RenderSize.Height > 0,
            `horizontal guide must have non-zero size, got ${pool[1].RenderSize.Width}×${pool[1].RenderSize.Height}`);
        assert.ok(Math.abs(pool[1].RenderSize.Width - 400) < 1, 'horizontal guide spans the adorner width');
        // an unused slot stays collapsed
        assert.equal(pool[5].RenderSize.Width, 0, 'unused slot stays 0-width');
    });
});
