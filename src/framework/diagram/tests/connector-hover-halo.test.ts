// Regression for the connector hover-halo coordinate bug.
//
// HoverHaloAdorner paints the hovered connector's route by handing the
// connector's own Geometry to a plain Shape. The connector renders its
// route in ABSOLUTE canvas coordinates and is arranged at Size.Zero, so
// Shape.fitTransform short-circuits (degenerate slot) and the route paints
// 1:1. The halo must do the same. It previously arranged the halo Shape at
// the full adorner-layer extent — a non-degenerate slot — so for a route
// with real 2-D bounds (a connector WITH waypoints) Shape.fitTransform
// uniform-scaled the geometry up to fill the whole layer: the halo painted
// huge and off-position (correct shape, wrong size/place). Axis-aligned
// routes have zero-area bounds and dodged the fit, which is why only
// waypoint connectors showed the bug.
//
// These tests pin the contract on a real waypoint route: at a degenerate
// slot no fit transform is pushed; at a non-zero slot one IS (the old
// behaviour) — proving the geometry is genuinely 2-D and the slot choice
// is what matters.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    Point,
    Rect,
    Size,
    type DrawingContext,
} from '../../../runtime/index.js';
import type { Brush, Pen } from '../../../visual-engine/index.js';
import type { Transform } from '../../../visual-engine/drawing/transform.js';
import { Shape } from '../../../basic/shapes/shape.js';
import { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { RoutingMode } from '../routing/router.js';
import '../routing/straight-router.js';

class CapturingContext implements DrawingContext
{
    public transforms: Transform[] = [];
    public geoms:      unknown[]    = [];
    DrawGeometry(_b: Brush | undefined, _p: Pen | undefined, g: unknown): void { this.geoms.push(g); }
    DrawRectangle(): void { throw new Error('not used'); }
    DrawText():      void { throw new Error('not used'); }
    PushTransform(t: Transform): void { this.transforms.push(t); }
    PushClip():      void { /* no-op */ }
    Pop():           void { /* no-op */ }
}

function newApplication(): void
{
    Application.current = null;
    new Application();
}

// A connector whose route bends through a waypoint, so its geometry has
// real width AND height (unlike a straight axis-aligned route).
function waypointConnector(): Connector
{
    const c = new Connector();
    c.RoutingMode = RoutingMode.Straight;
    c.Source = new ConnectorEndpoint({ FreePoint: new Point(0,   0) });
    c.Target = new ConnectorEndpoint({ FreePoint: new Point(200, 0) });
    c.Waypoints = [new Point(100, 120)];
    return c;
}

// Mirror HoverHaloAdorner's render path: a plain Shape painting the
// connector's Geometry, measured unbounded, arranged at the given slot.
function renderHalo(c: Connector, slot: Rect): CapturingContext
{
    const halo = new Shape();
    halo.Geometry = c.Geometry;
    halo.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
    halo.Arrange(slot);
    const dc = new CapturingContext();
    halo.Render(dc);
    return dc;
}

describe('connector hover halo — paints route verbatim, never fit-scaled', () => {

    test('a waypoint route has 2-D bounds', () => {
        newApplication();
        const g = waypointConnector().Geometry;
        assert.ok(g !== undefined, 'route geometry computed synchronously');
        const b = g.GetBounds();
        assert.ok(b.Width > 0 && b.Height > 0, 'bounds span both axes');
    });

    test('halo at Size.Zero (the fix) paints the route 1:1 — no fit transform', () => {
        newApplication();
        const c = waypointConnector();
        const dc = renderHalo(c, new Rect(0, 0, 0, 0));
        assert.equal(dc.transforms.length, 0, 'no scaling for a degenerate slot');
        assert.equal(dc.geoms.length, 1);
        assert.equal(dc.geoms[0], c.Geometry, 'same geometry instance, painted as-authored');
    });

    test('halo at a full-layer slot WOULD fit-scale the same route (the old bug)', () => {
        newApplication();
        const c = waypointConnector();
        const dc = renderHalo(c, new Rect(0, 0, 800, 600));
        assert.equal(dc.transforms.length, 1, 'non-degenerate slot scales 2-D geometry to fill it');
    });
});
