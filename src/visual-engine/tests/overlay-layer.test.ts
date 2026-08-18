import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { Application, Color, Rect, Size, Visual } from '../../runtime/index.js';
import { Border, Canvas } from '../../basic/index.js';
import {
    HeadlessTarget,
    OverlayLayer,
    SolidColorBrush,
    SvgRenderer,
    VISUAL_BACKREF,
} from '../index.js';

function makeDom(): { document: Document; surface: SVGSVGElement }
{
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const doc = dom.window.document;
    const surface = doc.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    doc.body.appendChild(surface);
    return { document: doc, surface };
}

describe('PresentationTarget — overlay attach/detach', () => {
    beforeEach(() => { Application.current = null; });

    test('OverlayRoot is undefined until AttachOverlay is first called', () => {
        const target = new HeadlessTarget(200, 200);
        assert.equal(target.OverlayRoot, undefined);
    });

    test('AttachOverlay materialises an OverlayLayer and adds the visual as a child', () => {
        const target = new HeadlessTarget(200, 200);
        const popup = new Border();
        target.AttachOverlay(popup);

        const layer = target.OverlayRoot;
        assert.notEqual(layer, undefined);
        assert.ok(layer instanceof OverlayLayer);
        assert.deepEqual(layer!.visualChildren, [popup]);
    });

    test('DetachOverlay removes the visual; layer survives but with empty children', () => {
        const target = new HeadlessTarget(200, 200);
        const popup = new Border();
        target.AttachOverlay(popup);
        target.DetachOverlay(popup);
        assert.equal(target.OverlayRoot!.visualChildren.length, 0);
    });

    test('Overlay children share the target host (target back-pointer cascades through OverlayLayer)', () => {
        const target = new HeadlessTarget(200, 200);
        const popup = new Border();
        target.AttachOverlay(popup);
        // Invalidate from inside the overlay subtree — without target
        // wiring the host queue would never know about it.
        popup.InvalidateMeasure();
        // HasPendingLayout is true exactly when measure/arrange dirty
        // sets are non-empty. The InvalidateMeasure above pushes a
        // member into measureDirty if and only if the target back-
        // pointer is wired.
        assert.equal(target.HasPendingLayout, true);
    });
});

describe('PresentationTarget — Flush measures + arranges the overlay too', () => {
    beforeEach(() => { Application.current = null; });

    test('Overlay child is arranged at the resolved surface size', () => {
        const target = new HeadlessTarget(320, 240);
        const popup = new Border();
        target.AttachOverlay(popup);
        target.Flush();

        // OverlayLayer arranges every child at (0, 0, surfaceW, surfaceH).
        assert.equal(popup.ArrangedRect.X,      0);
        assert.equal(popup.ArrangedRect.Y,      0);
        assert.equal(popup.ArrangedRect.Width,  320);
        assert.equal(popup.ArrangedRect.Height, 240);
    });

    test('Overlay sized to host even when Content drives auto-mode height', () => {
        // Auto height: surface grows to Content.DesiredSize.Height.
        const content = new Border();
        content.Width = 200;
        content.Height = 80;
        const target = new HeadlessTarget(/*width*/ 400);    // height = auto
        target.Content = content;
        const popup = new Border();
        target.AttachOverlay(popup);
        target.Flush();

        // ActualHeight = content.DesiredSize.Height = 80.
        assert.equal(target.ActualWidth,  400);
        assert.equal(target.ActualHeight, 80);
        // Popup matches the resolved surface size, not the content size.
        assert.equal(popup.ArrangedRect.Width,  400);
        assert.equal(popup.ArrangedRect.Height, 80);
    });
});

describe('SvgRenderer — overlay paints after content (top z-order)', () => {
    beforeEach(() => { Application.current = null; });

    test('overlay <g> is appended to the surface AFTER content <g>', () => {
        const { document, surface } = makeDom();
        const renderer = new SvgRenderer(surface, { document });

        const content = new Border();
        content.Fill = new SolidColorBrush(Color.FromHex('#10b981'));
        content.Width = 100;
        content.Height = 50;
        content.Measure(new Size(100, 50));
        content.Arrange(new Rect(0, 0, 100, 50));

        const overlay = new Canvas();
        const overlayChild = new Border();
        overlayChild.Fill = new SolidColorBrush(Color.FromHex('#ef4444'));
        Canvas.SetLeft(overlayChild, 25);
        Canvas.SetTop (overlayChild, 25);
        overlayChild.Width = 50;
        overlayChild.Height = 25;
        overlay.AddChild(overlayChild);
        overlay.Measure(new Size(100, 50));
        overlay.Arrange(new Rect(0, 0, 100, 50));

        renderer.Render(content, overlay, null, null);

        // DOM order under <svg>: <defs>, then content outer, then
        // overlay outer. Overlay's outer paints last → on top.
        const directChildren = [...surface.children].filter(
            c => c.localName === 'g',
        ) as SVGGElement[];
        // Two top-level <g>s — one per root.
        assert.equal(directChildren.length, 2);
        // First is the content root, second is the overlay root —
        // back-refs identify which is which.
        const refs = directChildren.map(
            c => (c as unknown as { [k: symbol]: Visual })[VISUAL_BACKREF],
        );
        assert.equal(refs[0], content);
        assert.equal(refs[1], overlay);
    });

    test('removing the overlay reaps its DOM subtree on the next walk', () => {
        const { document, surface } = makeDom();
        const renderer = new SvgRenderer(surface, { document });

        const content = new Border();
        content.Measure(new Size(50, 50));
        content.Arrange(new Rect(0, 0, 50, 50));

        const overlay = new Canvas();
        const popup = new Border();
        overlay.AddChild(popup);
        overlay.Measure(new Size(50, 50));
        overlay.Arrange(new Rect(0, 0, 50, 50));

        renderer.Render(content, overlay, null, null);
        // Content + overlay + overlay's popup = 3 outers.
        assert.equal(surface.querySelectorAll('g.mural-visual').length, 3);

        // Drop overlay from the render pass — its DOM subtree should
        // be reaped.
        renderer.Render(content, undefined, null, null);
        const remainingRefs = [...surface.querySelectorAll('g.mural-visual')]
            .map(g => (g as unknown as { [k: symbol]: Visual })[VISUAL_BACKREF]);
        assert.equal(remainingRefs.length, 1);
        assert.ok(remainingRefs.includes(content));
        assert.ok(!remainingRefs.includes(overlay));
        assert.ok(!remainingRefs.includes(popup));
    });
});
