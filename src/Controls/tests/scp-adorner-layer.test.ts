import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    AdornerDecorator,
    AdornerLayer,
    Application,
    Rect,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { Border } from '../border.js';
import { ScrollContentPresenter } from '../scroll-content-presenter.js';
import { ScrollViewer } from '../scroll-viewer.js';

class FixedSquare extends Visual
{
    constructor(side: number)
    {
        super();
        this.Width  = side;
        this.Height = side;
    }
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
    protected override RenderOverride(_dc: DrawingContext): void {}
}

describe('ScrollContentPresenter — inner AdornerLayer (WPF v2 parity)', () => {
    beforeEach(() => { Application.current = null; });

    test('SCP exposes an AdornerLayer property of the right type', () => {
        const scp = new ScrollContentPresenter();
        assert.ok(scp.AdornerLayer instanceof AdornerLayer);
    });

    test('GetAdornerLayer walking up from content inside a ScrollViewer lands on the SCP\'s inner layer', () => {
        const sv = new ScrollViewer();
        const leaf = new FixedSquare(20);
        sv.Content = leaf;
        const host = new Border();
        host.SetChild(sv);
        host.Measure(new Size(400, 400));
        host.Arrange(new Rect(0, 0, 400, 400));

        const layer = AdornerLayer.GetAdornerLayer(leaf);
        assert.ok(layer instanceof AdornerLayer,
            'lookup should hit some AdornerLayer ancestor');
        // Locate the SCP in the SV template and verify it's THAT layer
        // — not some unrelated provider further up the chain.
        const root = sv.visualChildren[0]!;
        const scp = root.FindName('PART_ContentSite') as ScrollContentPresenter;
        assert.ok(scp instanceof ScrollContentPresenter);
        assert.equal(layer, scp.AdornerLayer,
            'lookup must land on the SCP\'s own AdornerLayer, not an outer one');
    });

    test('inner SCP layer wins over a root-level AdornerDecorator (nearest-ancestor)', () => {
        // Mirrors the platform setup: root AdornerDecorator + a
        // ScrollViewer inside. An element inside the ScrollViewer
        // should resolve to the INNER (SCP) layer, not the outer
        // decorator's.
        const outer = new AdornerDecorator();
        const sv = new ScrollViewer();
        const leaf = new FixedSquare(20);
        sv.Content = leaf;
        outer.Child = sv;
        const host = new Border();
        host.SetChild(outer);
        host.Measure(new Size(400, 400));
        host.Arrange(new Rect(0, 0, 400, 400));

        const root = sv.visualChildren[0]!;
        const scp = root.FindName('PART_ContentSite') as ScrollContentPresenter;
        const layer = AdornerLayer.GetAdornerLayer(leaf);
        assert.equal(layer, scp.AdornerLayer,
            'inner SCP layer must win over the outer AdornerDecorator');
        // And the outer decorator's layer must still be reachable
        // from outside the SV — sanity check that it's the OUTER
        // adornment scope.
        const outsideLayer = AdornerLayer.GetAdornerLayer(sv);
        assert.equal(outsideLayer, outer.AdornerLayer);
    });

    test('SCP\'s inner layer arranges at the content\'s rect — adorners share the scrolled frame', () => {
        const sv = new ScrollViewer();
        const leaf = new FixedSquare(20);
        sv.Content = leaf;
        const host = new Border();
        host.SetChild(sv);
        host.Measure(new Size(400, 400));
        host.Arrange(new Rect(0, 0, 400, 400));

        const root = sv.visualChildren[0]!;
        const scp = root.FindName('PART_ContentSite') as ScrollContentPresenter;
        // Pull the content visual back off the base ContentPresenter
        // surface; SCP appends its layer after, so [0] is the content.
        const baseChildren = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(Object.getPrototypeOf(scp)),
            'visualChildren')!.get!.call(scp) as readonly Visual[];
        const contentVisual = baseChildren[0]!;
        const layer = scp.AdornerLayer;
        // Layer's ArrangedRect should equal the content's (they sit
        // in the same scrolled frame).
        assert.equal(layer.ArrangedRect.X,      contentVisual.ArrangedRect.X);
        assert.equal(layer.ArrangedRect.Y,      contentVisual.ArrangedRect.Y);
        assert.equal(layer.ArrangedRect.Width,  contentVisual.ArrangedRect.Width);
        assert.equal(layer.ArrangedRect.Height, contentVisual.ArrangedRect.Height);
    });
});
