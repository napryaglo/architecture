// Step 2 / § 9 of [src/document/connectors.md](../../../document/connectors.md):
// pins the OrthogonalRouter's compute() + tangentAt() across all
// 16 (sourceSide × targetSide) combinations + waypoints + reverse +
// same-side same-axis detour.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
    LineSegment,
    PathGeometry,
    Point,
    Rect,
} from '../../../visual-engine/index.js';
import { PortSide, type ResolvedPortSide } from '../port.js';
import {
    ConnectorEnd,
    type ResolvedAnchor,
    type RouteSpec,
    RouterRegistry,
    RoutingMode,
} from '../routing/router.js';
import '../routing/orthogonal-router.js';

const ANCHOR = (x: number, y: number, side: ResolvedPortSide): ResolvedAnchor =>
    ({ x, y, side });

const SPEC = (overrides: Partial<RouteSpec> = {}): RouteSpec => ({
    sourceRect:   new Rect(0,    0,   10, 10),
    sourceAnchor: ANCHOR(0,   0,   PortSide.E),
    targetRect:   new Rect(100, 100, 10, 10),
    targetAnchor: ANCHOR(100, 100, PortSide.W),
    waypoints:    [],
    ...overrides,
});

const router = RouterRegistry.resolve(RoutingMode.Orthogonal);

// Walk the PathGeometry back to a flat list of Points for assertion.
function pointsOf(geo: PathGeometry): Point[]
{
    assert.equal(geo.Figures.length, 1, 'expected exactly one figure');
    const fig = geo.Figures[0]!;
    const out: Point[] = [fig.StartPoint];
    for (const seg of fig.Segments)
    {
        assert.ok(seg instanceof LineSegment, 'expected LineSegment');
        out.push(seg.Point);
    }
    return out;
}

function expectPoints(geo: PathGeometry, expected: readonly (readonly [number, number])[]): void
{
    const pts = pointsOf(geo);
    assert.equal(pts.length, expected.length,
        `expected ${expected.length} vertices, got ${pts.length}: ${JSON.stringify(pts)}`);
    for (let i = 0; i < expected.length; i++)
    {
        assert.equal(pts[i]!.X, expected[i]![0], `vertex ${i} X`);
        assert.equal(pts[i]!.Y, expected[i]![1], `vertex ${i} Y`);
    }
}

// Each consecutive vertex pair must share X or Y. Used for the 16-combo
// structural sweep where pinning every combo's exact polyline would bloat
// the test file; the structural property is what the orthogonality
// contract actually guarantees.
function assertOrthogonal(geo: PathGeometry): void
{
    const pts = pointsOf(geo);
    for (let i = 1; i < pts.length; i++)
    {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const horizontal = a.Y === b.Y;
        const vertical   = a.X === b.X;
        assert.ok(horizontal || vertical,
            `segment ${i - 1}→${i} is not axis-aligned: ${JSON.stringify([a, b])}`);
    }
}

const ALL_SIDES: readonly ResolvedPortSide[] = [PortSide.N, PortSide.S, PortSide.E, PortSide.W];

describe('OrthogonalRouter — structural sweep over all 16 side combinations', () => {
    for (const sSide of ALL_SIDES)
    {
        for (const tSide of ALL_SIDES)
        {
            test(`(${sSide}, ${tSide}) produces an orthogonal polyline`, () => {
                const geo = router.compute(SPEC({
                    sourceAnchor: ANCHOR(0,   0,   sSide),
                    targetAnchor: ANCHOR(100, 100, tSide),
                }));
                const pts = pointsOf(geo);
                assert.equal(pts[0]!.X, 0);  assert.equal(pts[0]!.Y, 0);
                assert.equal(pts[pts.length - 1]!.X, 100);
                assert.equal(pts[pts.length - 1]!.Y, 100);
                assertOrthogonal(geo);
            });
        }
    }
});

describe('OrthogonalRouter — pinned canonical shapes', () => {
    test('mixed axis E→S: L-shape with corner at (target.X, source.Y)', () => {
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,   0,  PortSide.E),
            targetAnchor: ANCHOR(100, 50, PortSide.S),
        }));
        expectPoints(geo, [[0, 0], [100, 0], [100, 50]]);
    });

    test('mixed axis N→W: L-shape with corner at (source.X, target.Y)', () => {
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(50, 0,   PortSide.N),
            targetAnchor: ANCHOR(0,  100, PortSide.W),
        }));
        expectPoints(geo, [[50, 0], [50, 100], [0, 100]]);
    });

    test('both X-axis facing inward (E→W, s.X<t.X): Z with midX = average', () => {
        // Natural opposite-side aligned case. Both outward sides agree
        // with the midX = (0+100)/2 = 50 bridge.
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,   0,  PortSide.E),
            targetAnchor: ANCHOR(100, 50, PortSide.W),
        }));
        expectPoints(geo, [[0, 0], [50, 0], [50, 50], [100, 50]]);
    });

    test('both Y-axis facing inward (N→S, s.Y>t.Y): Z with midY = average', () => {
        // Natural opposite-side aligned vertical case. Source below
        // target in screen coords (s.Y > t.Y), source.N exits upward
        // toward target.S which receives from below.
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,  100, PortSide.N),
            targetAnchor: ANCHOR(50, 0,   PortSide.S),
        }));
        expectPoints(geo, [[0, 100], [0, 50], [50, 50], [50, 0]]);
    });

    test('same-side E→E: Z-detour east of both endpoints (the doc § 6 edge case)', () => {
        // chooseMidX: average=50, sOK=50>0 ✓, tOK=50>100 ✗ → detour.
        // max(0,100)+STUB(20) = 120.
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,   0,  PortSide.E),
            targetAnchor: ANCHOR(100, 50, PortSide.E),
        }));
        expectPoints(geo, [[0, 0], [120, 0], [120, 50], [100, 50]]);
    });

    test('same-side N→N: Z-detour north of both endpoints', () => {
        // chooseMidY: average=50, sOK=50<0 ✗ → detour.
        // min(0,100)-STUB(20) = -20.
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,  0,   PortSide.N),
            targetAnchor: ANCHOR(50, 100, PortSide.N),
        }));
        expectPoints(geo, [[0, 0], [0, -20], [50, -20], [50, 100]]);
    });

    test('same-side W→W: Z-detour west of both endpoints', () => {
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(100, 0,  PortSide.W),
            targetAnchor: ANCHOR(0,   50, PortSide.W),
        }));
        expectPoints(geo, [[100, 0], [-20, 0], [-20, 50], [0, 50]]);
    });

    test('same-side S→S: Z-detour south of both endpoints', () => {
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,  100, PortSide.S),
            targetAnchor: ANCHOR(50, 0,   PortSide.S),
        }));
        expectPoints(geo, [[0, 100], [0, 120], [50, 120], [50, 0]]);
    });

    test('aligned horizontal (E→W same Y): single straight segment', () => {
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,   50, PortSide.E),
            targetAnchor: ANCHOR(100, 50, PortSide.W),
        }));
        expectPoints(geo, [[0, 50], [100, 50]]);
    });

    test('aligned vertical (N→S same X): single straight segment', () => {
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(50, 100, PortSide.N),
            targetAnchor: ANCHOR(50, 0,   PortSide.S),
        }));
        expectPoints(geo, [[50, 100], [50, 0]]);
    });
});

describe('OrthogonalRouter — reverse-direction (impossible Z) cases', () => {
    test('E→W with s.X > t.X falls back to source-side detour (target side gets violated, V1)', () => {
        // Source EAST of target while source faces east. Source wants
        // midX > s.X=100; target wants midX < t.X=0. Impossible.
        // chooseMidX: avg=50, sOK=50>100 ✗ → detour east → max(100,0)+20=120.
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(100, 0,  PortSide.E),
            targetAnchor: ANCHOR(0,   50, PortSide.W),
        }));
        expectPoints(geo, [[100, 0], [120, 0], [120, 50], [0, 50]]);
    });

    test('W→E with s.X < t.X falls back to source-side detour west', () => {
        // chooseMidX: avg=50, sOK=50<0 ✗ → detour west → min(0,100)-20=-20.
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,   0,  PortSide.W),
            targetAnchor: ANCHOR(100, 50, PortSide.E),
        }));
        expectPoints(geo, [[0, 0], [-20, 0], [-20, 50], [100, 50]]);
    });

    test('N→S with s.Y < t.Y (source above target with both facing away) detours north', () => {
        // Source N exits upward, target S receives from below. Source
        // ABOVE target (smaller Y) means both face away from each other.
        // chooseMidY: avg=50, sOK=50<0 ✗ → detour north → min(0,100)-20=-20.
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,  0,   PortSide.N),
            targetAnchor: ANCHOR(50, 100, PortSide.S),
        }));
        expectPoints(geo, [[0, 0], [0, -20], [50, -20], [50, 100]]);
    });
});

describe('OrthogonalRouter — waypoints', () => {
    test('axis-aligned single waypoint produces a 3-segment Z through it', () => {
        // wp on source's horizontal axis → first pair collapses to a
        // single horizontal segment; last pair forms an L into target.
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,   0,   PortSide.E),
            targetAnchor: ANCHOR(100, 100, PortSide.W),
            waypoints:    [new Point(50, 0)],
        }));
        expectPoints(geo, [[0, 0], [50, 0], [50, 100], [100, 100]]);
    });

    test('two aligned waypoints — segments collapse where possible', () => {
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,   0,   PortSide.E),
            targetAnchor: ANCHOR(100, 100, PortSide.W),
            waypoints:    [new Point(50, 0), new Point(50, 100)],
        }));
        expectPoints(geo, [[0, 0], [50, 0], [50, 100], [100, 100]]);
    });

    test('off-axis waypoint inserts an L into the source-to-waypoint pair', () => {
        // wp not on source's exit axis → first pair becomes L. Source E
        // → first segment horizontal, corner = (wp.X, s.Y) = (30, 0).
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,   0,   PortSide.E),
            targetAnchor: ANCHOR(100, 100, PortSide.W),
            waypoints:    [new Point(30, 50)],
        }));
        // Source → corner1 → wp; last pair: wp → corner2 → target.
        // wp(30,50) → t(100,100): tX=true → !tX=false → corner=(wp.X, t.Y)=(30,100).
        expectPoints(geo, [[0, 0], [30, 0], [30, 50], [30, 100], [100, 100]]);
    });

    test('every emitted polyline segment stays axis-aligned with waypoints', () => {
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(0,   0,   PortSide.N),
            targetAnchor: ANCHOR(200, 200, PortSide.S),
            waypoints:    [new Point(50, 25), new Point(150, 75), new Point(120, 180)],
        }));
        assertOrthogonal(geo);
    });
});

describe('OrthogonalRouter — degenerate source = target', () => {
    test('produces a single zero-length segment', () => {
        const geo = router.compute(SPEC({
            sourceAnchor: ANCHOR(42, 42, PortSide.E),
            targetAnchor: ANCHOR(42, 42, PortSide.E),
        }));
        expectPoints(geo, [[42, 42], [42, 42]]);
    });
});

describe('OrthogonalRouter — tangentAt', () => {
    test('L-shape E→S: source tangent East, target tangent South', () => {
        const spec = SPEC({
            sourceAnchor: ANCHOR(0,   0,  PortSide.E),
            targetAnchor: ANCHOR(100, 50, PortSide.S),
        });
        assert.equal(router.tangentAt(spec, ConnectorEnd.Source), 0);
        assert.equal(router.tangentAt(spec, ConnectorEnd.Target), Math.PI / 2);
    });

    test('Z-shape E→W (canonical): both ends tangent East', () => {
        const spec = SPEC({
            sourceAnchor: ANCHOR(0,   0,  PortSide.E),
            targetAnchor: ANCHOR(100, 50, PortSide.W),
        });
        assert.equal(router.tangentAt(spec, ConnectorEnd.Source), 0);
        assert.equal(router.tangentAt(spec, ConnectorEnd.Target), 0);
    });

    test('same-side EE Z-detour: source East, target West (last segment doubles back)', () => {
        // Polyline [(0,0), (120,0), (120,50), (100,50)]. Last segment
        // (120,50) → (100,50) travels -x = West.
        const spec = SPEC({
            sourceAnchor: ANCHOR(0,   0,  PortSide.E),
            targetAnchor: ANCHOR(100, 50, PortSide.E),
        });
        assert.equal(router.tangentAt(spec, ConnectorEnd.Source), 0);
        assert.equal(router.tangentAt(spec, ConnectorEnd.Target), Math.PI);
    });

    test('with waypoint, source tangent reads the first emitted segment', () => {
        // [(0,0), (50,0), (50,100), (100,100)] — first segment east.
        const spec = SPEC({
            sourceAnchor: ANCHOR(0,   0,   PortSide.E),
            targetAnchor: ANCHOR(100, 100, PortSide.W),
            waypoints:    [new Point(50, 0)],
        });
        assert.equal(router.tangentAt(spec, ConnectorEnd.Source), 0);
    });

    test('source = target degenerate: 0 rad', () => {
        const spec = SPEC({
            sourceAnchor: ANCHOR(7, 7, PortSide.E),
            targetAnchor: ANCHOR(7, 7, PortSide.E),
        });
        assert.equal(router.tangentAt(spec, ConnectorEnd.Source), 0);
        assert.equal(router.tangentAt(spec, ConnectorEnd.Target), 0);
    });
});

describe('RouterRegistry — orthogonal registration', () => {
    test('resolves built-in Orthogonal name', () => {
        const r = RouterRegistry.resolve(RoutingMode.Orthogonal);
        assert.ok(r !== undefined);
    });
});
