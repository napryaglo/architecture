// Step 6 / § 9 of [src/document/connectors.md](../../../document/connectors.md):
// pins the Connector skeleton — DPs, the 5 endpoint-resolution paths
// from § 3.2, source/target reactivity, and routing-mode dispatch.
// Caps, hit-test widen, and edit interaction land in later steps.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { PathGeometry, Point } from '../../../visual-engine/index.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { AnchorClip, Connector } from '../connector.js';
import { Figure } from '../figure.js';
import { Port, PortSide } from '../port.js';
import { RoutingMode } from '../routing/router.js';
// Side-effect imports — register the routers under their RoutingMode names.
import '../routing/straight-router.js';
import '../routing/orthogonal-router.js';
import '../routing/bezier-router.js';

// ── Fixtures ──────────────────────────────────────────────────────────

function makeFigure(left: number, top: number, w: number, h: number, ports?: readonly Port[]): Figure
{
    const f = new Figure();
    f.Left   = left;
    f.Top    = top;
    f.Width  = w;
    f.Height = h;
    if (ports !== undefined) f.ExplicitPorts = ports;
    return f;
}

function startOf(conn: Connector): Point
{
    const g = conn.Geometry as PathGeometry;
    return g.Figures[0]!.StartPoint;
}

// ── Path 1 — free-floating endpoints ──────────────────────────────────

describe('Connector resolution path 1 — FreePoint endpoints', () => {
    test('Straight route between two FreePoint endpoints', () => {
        const src = new ConnectorEndpoint({ FreePoint: new Point(0,   0) });
        const tgt = new ConnectorEndpoint({ FreePoint: new Point(100, 50) });
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = src;
        c.Target = tgt;
        assert.ok(c.Geometry !== undefined, 'expected Geometry after both endpoints set');
        const fig = (c.Geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.StartPoint.X, 0);
        assert.equal(fig.StartPoint.Y, 0);
    });

    test('Geometry stays undefined while only one endpoint is set', () => {
        const c = new Connector();
        c.Source = new ConnectorEndpoint({ FreePoint: new Point(0, 0) });
        assert.equal(c.Geometry, undefined);
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(100, 100) });
        assert.ok(c.Geometry !== undefined);
    });

    test('FreePoint changes re-route on the next OnPropertyChanged', () => {
        const src = new ConnectorEndpoint({ FreePoint: new Point(0, 0) });
        const tgt = new ConnectorEndpoint({ FreePoint: new Point(100, 0) });
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = src;
        c.Target = tgt;
        const before = startOf(c);
        src.FreePoint = new Point(50, 50);
        const after = startOf(c);
        assert.notEqual(before.X, after.X);
        assert.equal(after.X, 50);
        assert.equal(after.Y, 50);
    });
});

// ── Path 2 — named lookup ────────────────────────────────────────────

describe('Connector resolution path 2 — named port lookup', () => {
    test('PortName resolves against ExplicitPorts', () => {
        // 'out' port at bbox (1, 0.5) → diagram-host (180, 140).
        const fig = makeFigure(100, 100, 80, 80, [
            new Port({ Name: 'in',  Side: PortSide.W, X: 0, Y: 0.5 }),
            new Port({ Name: 'out', Side: PortSide.E, X: 1, Y: 0.5 }),
        ]);
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = new ConnectorEndpoint({ Node: fig, PortName: 'out' });
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(300, 200) });
        const start = startOf(c);
        assert.equal(start.X, 180);
        assert.equal(start.Y, 140);
    });

    test('unknown PortName falls through to subsequent paths (eventually auto-pick)', () => {
        const fig = makeFigure(100, 100, 80, 80, [
            new Port({ Name: 'in', Side: PortSide.W, X: 0, Y: 0.5 }),
        ]);
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = new ConnectorEndpoint({ Node: fig, PortName: 'nonexistent' });
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(300, 140) });
        // Falls through to path 4: only port available is 'in' at (100, 140).
        const start = startOf(c);
        assert.equal(start.X, 100);
        assert.equal(start.Y, 140);
    });
});

// ── Path 3 — positional (PortSide, PortIndex) lookup ─────────────────

describe('Connector resolution path 3 — positional (PortSide, PortIndex) lookup', () => {
    test('bucket-sort within a side picks the X-ordered index 0', () => {
        // Emit order intentionally scrambled — bucket-sort by X ascending
        // means index 0 is the LEFTMOST N-side port (X=0.25).
        const fig = makeFigure(100, 100, 80, 80, [
            new Port({ Side: PortSide.N, X: 0.75, Y: 0 }),
            new Port({ Side: PortSide.N, X: 0.25, Y: 0 }),
            new Port({ Side: PortSide.N, X: 0.50, Y: 0 }),
        ]);
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = new ConnectorEndpoint({
            Node: fig, PortSide: PortSide.N, PortIndex: 0,
        });
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(300, 200) });
        const start = startOf(c);
        // Index 0 → X=0.25 → diagram-host (100 + 0.25*80, 100) = (120, 100).
        assert.equal(start.X, 120);
        assert.equal(start.Y, 100);
    });

    test('positional lookup is stable under scrambled provider emit order', () => {
        // Two figures with identical port SETS but in different emit
        // orders. Looking up (N, 1) must land on the X=0.5 port for
        // BOTH — bucketing sorts independent of insertion order.
        const portsA = [
            new Port({ Side: PortSide.N, X: 0.25, Y: 0 }),
            new Port({ Side: PortSide.N, X: 0.50, Y: 0 }),
            new Port({ Side: PortSide.N, X: 0.75, Y: 0 }),
        ];
        const portsB = [
            new Port({ Side: PortSide.N, X: 0.75, Y: 0 }),
            new Port({ Side: PortSide.N, X: 0.25, Y: 0 }),
            new Port({ Side: PortSide.N, X: 0.50, Y: 0 }),
        ];
        const figA = makeFigure(100, 100, 80, 80, portsA);
        const figB = makeFigure(100, 100, 80, 80, portsB);
        const free = (): ConnectorEndpoint => new ConnectorEndpoint({ FreePoint: new Point(300, 200) });
        const mkConnector = (fig: Figure): Connector => {
            const c = new Connector();
            c.RoutingMode = RoutingMode.Straight;
            c.Source = new ConnectorEndpoint({ Node: fig, PortSide: PortSide.N, PortIndex: 1 });
            c.Target = free();
            return c;
        };
        const sA = startOf(mkConnector(figA));
        const sB = startOf(mkConnector(figB));
        assert.equal(sA.X, sB.X);
        assert.equal(sA.Y, sB.Y);
        assert.equal(sA.X, 140);   // X=0.5 → 100 + 0.5*80 = 140
    });
});

// ── Path 3 → 4 fallthrough ───────────────────────────────────────────

describe('Connector resolution path 3 → 4 fallthrough — index out of range', () => {
    test('out-of-range PortIndex falls through to closest-port pick', () => {
        const fig = makeFigure(100, 100, 80, 80, [
            new Port({ Side: PortSide.N, X: 0.5, Y: 0   }),   // (140, 100)
            new Port({ Side: PortSide.E, X: 1,   Y: 0.5 }),   // (180, 140)
        ]);
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = new ConnectorEndpoint({
            Node: fig, PortSide: PortSide.N, PortIndex: 99,
        });
        // Target far east → closest is E-side port.
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(500, 140) });
        const start = startOf(c);
        assert.equal(start.X, 180);
        assert.equal(start.Y, 140);
    });
});

// ── Path 4 — auto-pick closest ───────────────────────────────────────

describe('Connector resolution path 4 — closest-port auto-pick', () => {
    test('picks the port closest to the other endpoint', () => {
        const fig = makeFigure(100, 100, 80, 80, [
            new Port({ Side: PortSide.N, X: 0.5, Y: 0   }),   // (140, 100)
            new Port({ Side: PortSide.S, X: 0.5, Y: 1   }),   // (140, 180)
            new Port({ Side: PortSide.E, X: 1,   Y: 0.5 }),   // (180, 140)
            new Port({ Side: PortSide.W, X: 0,   Y: 0.5 }),   // (100, 140)
        ]);
        // Source connector with no port addressing → path 4 auto-picks.
        // Target far south → closest port is S-side at (140, 180).
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = new ConnectorEndpoint({ Node: fig });
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(140, 500) });
        const start = startOf(c);
        assert.equal(start.X, 140);
        assert.equal(start.Y, 180);
    });
});

// ── Path 5 — geometric clip (bbox) ───────────────────────────────────

describe('Connector resolution path 5 — bbox geometric clip', () => {
    test('empty ExplicitPorts triggers bbox clip from centroid toward other', () => {
        // ExplicitPorts = [] makes Figure.Ports return an empty array,
        // skipping paths 2-4. Default Figure.Kind = '' falls through
        // the kind→provider table to the BoundingBox fallback BUT
        // explicit empty wins per Figure.Ports precedence.
        const fig = makeFigure(100, 100, 80, 80, []);
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.AnchorClip  = AnchorClip.Bbox;
        c.Source = new ConnectorEndpoint({ Node: fig });
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(500, 200) });
        // Centroid (140, 140). Line to (500, 200): dx=360, dy=60.
        // Exit through right edge x=180 (t = 40/360 ≈ 0.111).
        // y = 140 + (1/9) * 60 = 146.666...
        const start = startOf(c);
        assert.equal(start.X, 180);
        assert.ok(Math.abs(start.Y - 146.6666666) < 1e-6);
    });

    test('AnchorClip.Geometry throws (v1 limitation)', () => {
        const fig = makeFigure(100, 100, 80, 80, []);
        const c = new Connector();
        c.AnchorClip = AnchorClip.Geometry;
        c.Source = new ConnectorEndpoint({ Node: fig });
        // Geometry compute happens synchronously on Target set —
        // the throw fires from there.
        assert.throws(
            () => { c.Target = new ConnectorEndpoint({ FreePoint: new Point(500, 200) }); },
            (err: Error) => {
                assert.match(err.message, /AnchorClip\.Geometry/);
                return true;
            },
        );
    });
});

// ── Source-move reactivity ───────────────────────────────────────────

describe('Connector reactivity — source / target node moves', () => {
    test('bumping source Figure.Left re-routes', () => {
        const fig = makeFigure(100, 100, 80, 80, []);  // path 5
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = new ConnectorEndpoint({ Node: fig });
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(500, 200) });
        const before = startOf(c).X;
        fig.Left = 200;
        const after = startOf(c).X;
        // Right edge shifts from 180 to 280.
        assert.equal(before, 180);
        assert.equal(after,  280);
    });

    test('bumping target Figure.Top re-routes', () => {
        const fig = makeFigure(300, 100, 80, 80, []);
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = new ConnectorEndpoint({ FreePoint: new Point(0, 50) });
        c.Target = new ConnectorEndpoint({ Node: fig });
        // Target end point is on the figure's left edge initially.
        const before = (c.Geometry as PathGeometry).Figures[0]!.Segments[0]!;
        const beforeEnd = (before as { Point: Point }).Point;
        fig.Top = 200;
        const after = (c.Geometry as PathGeometry).Figures[0]!.Segments[0]!;
        const afterEnd = (after as { Point: Point }).Point;
        assert.notEqual(beforeEnd.Y, afterEnd.Y);
    });

    test('replacing Source.Node detaches old node listeners and attaches new', () => {
        const figA = makeFigure(100, 100, 80, 80, []);
        const figB = makeFigure(300, 300, 80, 80, []);
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        const src = new ConnectorEndpoint({ Node: figA });
        c.Source = src;
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(500, 200) });
        const beforeSwap = startOf(c).X;     // resolved against figA centroid → exit x=180

        src.Node = figB;                     // ConnectorEndpoint's Node DP swap
        const afterSwap = startOf(c).X;      // resolved against figB centroid → exit x=380
        assert.notEqual(beforeSwap, afterSwap);
        assert.equal(beforeSwap, 180);
        assert.equal(afterSwap,  380);

        // After swap, mutating figA should NOT trigger re-route.
        figA.Left = 999;
        assert.equal(startOf(c).X, afterSwap);
    });
});

// ── Routing mode dispatch ────────────────────────────────────────────

describe('Connector — routing mode dispatch', () => {
    test('switching RoutingMode re-routes via the new router', () => {
        const src = new ConnectorEndpoint({ FreePoint: new Point(0, 0) });
        const tgt = new ConnectorEndpoint({ FreePoint: new Point(100, 50) });
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = src;
        c.Target = tgt;
        // Straight: 1 segment.
        const straightSegs = (c.Geometry as PathGeometry).Figures[0]!.Segments.length;
        assert.equal(straightSegs, 1);

        c.RoutingMode = RoutingMode.Orthogonal;
        // Orthogonal with two free-floating endpoints: both have
        // path-1 derived sides. For source(0,0) → target(100,50) the
        // toward-target dominant cardinal is E (X-axis dominates the
        // 100-vs-50 magnitude); target's side faces "back from line"
        // = W. Both X-axis with sY≠tY → Z-shape, 3 segments.
        const orthogonalSegs = (c.Geometry as PathGeometry).Figures[0]!.Segments.length;
        assert.equal(orthogonalSegs, 3);
    });

    test('RoutingMode = Bezier emits cubic segments', () => {
        const src = new ConnectorEndpoint({ FreePoint: new Point(0, 0) });
        const tgt = new ConnectorEndpoint({ FreePoint: new Point(100, 50) });
        const c = new Connector();
        c.RoutingMode = RoutingMode.Bezier;
        c.Source = src;
        c.Target = tgt;
        const segs = (c.Geometry as PathGeometry).Figures[0]!.Segments;
        // One cubic per knot pair, and no waypoints → 1 cubic.
        assert.equal(segs.length, 1);
        assert.equal(segs[0]!.constructor.name, 'CubicBezierSegment');
    });
});

// ── Waypoints ────────────────────────────────────────────────────────

describe('Connector — waypoints', () => {
    test('Waypoints DP flows into the route compute', () => {
        const src = new ConnectorEndpoint({ FreePoint: new Point(0,   0) });
        const tgt = new ConnectorEndpoint({ FreePoint: new Point(200, 0) });
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = src;
        c.Target = tgt;
        assert.equal((c.Geometry as PathGeometry).Figures[0]!.Segments.length, 1);

        c.Waypoints = [new Point(100, 50)];
        // One waypoint → 2 segments through the polyline.
        assert.equal((c.Geometry as PathGeometry).Figures[0]!.Segments.length, 2);
    });
});
