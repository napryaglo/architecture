import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { Point } from '../../../visual-engine/index.js';
import { Key, KeyEventArgs, ModifierKeys } from '../../../runtime/index.js';
import { Canvas } from '../../../basic/panels/canvas.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { ShapeText } from '../shape-text.js';
import { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { pointAlongPolyline, nearestTOnPolyline } from '../connector-route.js';
import { DiagramDocument, type DiagramStorage } from '../diagram-document.js';

// § diagram-text Slice 5 — connector labels. A Connector owns a first-class
// ShapeText that rides its route at an arc-length fraction (LabelPosition,
// 0.5 = midpoint), is draggable along the path, and persists.

class MemoryStorage implements DiagramStorage
{
    private readonly _map = new Map<string, string>();
    public GetItem(key: string): string | null { return this._map.get(key) ?? null; }
    public SetItem(key: string, value: string): void { this._map.set(key, value); }
}

describe('connector-route — polyline geometry (pure)', () => {
    const P = (x: number, y: number): Point => new Point(x, y);

    test('pointAlongPolyline finds the arc-length midpoint of one segment', () => {
        const r = pointAlongPolyline([P(0, 0), P(100, 0)], 0.5);
        assert.deepEqual([r.point.X, r.point.Y], [50, 0]);
        assert.equal(r.tangent, 0);
    });

    test('pointAlongPolyline measures by arc length across bends', () => {
        // Two 100-unit legs → total 200; t=0.5 lands exactly on the corner.
        const pts = [P(0, 0), P(100, 0), P(100, 100)];
        assert.deepEqual(pointAlongPolyline(pts, 0.5).point, P(100, 0));
        // t=0.75 → 150 units → halfway down the second (vertical) leg.
        assert.deepEqual(pointAlongPolyline(pts, 0.75).point, P(100, 50));
    });

    test('pointAlongPolyline clamps t and tolerates degenerate input', () => {
        const pts = [P(0, 0), P(10, 0)];
        assert.deepEqual(pointAlongPolyline(pts, -1).point, P(0, 0));
        assert.deepEqual(pointAlongPolyline(pts, 2).point, P(10, 0));
        assert.deepEqual(pointAlongPolyline([], 0.5).point, Point.Zero);
    });

    test('nearestTOnPolyline projects a cursor onto the route', () => {
        const pts = [P(0, 0), P(100, 0)];
        assert.equal(nearestTOnPolyline(pts, P(50, 10)), 0.5);
        assert.equal(nearestTOnPolyline(pts, P(30, -5)), 0.3);
        // Off the ends clamps to the segment (t stays in [0,1]).
        assert.equal(nearestTOnPolyline(pts, P(-40, 0)), 0);
        assert.equal(nearestTOnPolyline(pts, P(140, 0)), 1);
    });
});

describe('Connector label — model + sugar', () => {
    beforeEach(() => { initTestApp(); });

    test('a Connector seeds a first-class ShapeText label', () => {
        const c = new Connector();
        assert.ok(c.Text instanceof ShapeText, 'Connector.Text is a ShapeText');
    });

    // F2 on a selected connector begins editing its label — the keyboard
    // equivalent of double-clicking it (Connector.OnPointerDown). Previously F2
    // only handled selected figures, so a selected connector did nothing.
    test('F2 on a selected connector begins editing its label', () => {
        const diagram = new Diagram();
        const c = new Connector();
        diagram.SelectConnector(c);
        const keyArgs = new KeyEventArgs('KeyDown', diagram, {
            Key: Key.F2, KeyText: 'F2', Code: 'F2', Modifiers: ModifierKeys.None, IsRepeat: false,
        });
        (diagram as unknown as { OnKeyDown(a: KeyEventArgs): void }).OnKeyDown(keyArgs);
        assert.equal(keyArgs.Handled, true, 'F2 is consumed');
        assert.equal(c.Text.IsEditing, true, 'F2 puts the connector label into edit mode');
    });

    test('LabelText is sugar over Text.Content; LabelPosition defaults to the midpoint', () => {
        const c = new Connector();
        assert.equal(c.LabelPosition, 0.5, 'default rides the midpoint');
        c.LabelText = 'yes';
        assert.equal(c.Text.Content, 'yes');
        c.Text.Content = 'no';
        assert.equal(c.LabelText, 'no');
    });

    test('an empty label is non-hit-testable (clicks fall through to the route)', () => {
        const c = new Connector();
        assert.equal(c.Text.IsHitTestVisible, false, 'empty label ignores the pointer');
        c.LabelText = 'edge';
        assert.equal(c.Text.IsHitTestVisible, true, 'a captioned label catches the pointer');
    });
});

describe('Connector label — route positioning', () => {
    beforeEach(() => { initTestApp(); });

    function wired(): Connector
    {
        const a = new Figure(); a.Left = 0;   a.Top = 0;
        const b = new Figure(); b.Left = 240; b.Top = 0;
        const c = new Connector();
        c.Source = new ConnectorEndpoint({ Node: a });
        c.Target = new ConnectorEndpoint({ Node: b });
        return c;
    }

    test('a wired connector computes a route the label can ride', () => {
        const c = wired();
        assert.ok(c.CurrentRoutePoints !== undefined && c.CurrentRoutePoints.length >= 2,
            'CurrentRoutePoints is a polyline');
    });

    test('moving LabelPosition slides the label along the route', () => {
        const c = wired();
        c.LabelText = 'x';
        c.LabelPosition = 0.2;
        const left1 = Canvas.GetLeft(c.Text);
        c.LabelPosition = 0.8;
        const left2 = Canvas.GetLeft(c.Text);
        assert.notEqual(left1, left2, 'the label re-places at the new arc fraction');
    });

    test('a double-click on the connector begins editing its label', () => {
        const c = wired();
        // Duck-typed PointerEventArgs — OnPointerDown's double-click path only
        // reads IsDoubleClick + Handled.
        const args = { IsDoubleClick: true, Handled: false };
        (c as unknown as { OnPointerDown(a: unknown): void }).OnPointerDown(args);
        assert.equal(args.Handled, true, 'the gesture is consumed');
        assert.equal(c.Text.IsEditing, true, 'the midpoint label enters edit mode');
    });
});

describe('Connector label — persistence', () => {
    beforeEach(() => { initTestApp(); });

    test('label text + position round-trip through Save/Load', () => {
        const doc = new DiagramDocument(new MemoryStorage());
        const a = doc.CreateNode('rectangle', 0, 0)!;
        const b = doc.CreateNode('rectangle', 240, 0)!;
        const c = doc.CreateConnector(
            new ConnectorEndpoint({ Node: a }),
            new ConnectorEndpoint({ Node: b }))!;
        c.LabelText     = 'depends on';
        c.LabelPosition = 0.3;
        doc.Save();
        doc.Load();
        const reloaded = doc.Connectors.Get(0)!;
        assert.equal(reloaded.LabelText, 'depends on', 'label content restored');
        assert.equal(reloaded.LabelPosition, 0.3, 'label position restored');
    });

    test('a label-less connector persists no label fields', () => {
        const doc = new DiagramDocument(new MemoryStorage());
        const a = doc.CreateNode('rectangle', 0, 0)!;
        const b = doc.CreateNode('rectangle', 240, 0)!;
        doc.CreateConnector(
            new ConnectorEndpoint({ Node: a }),
            new ConnectorEndpoint({ Node: b }));
        doc.Save();
        doc.Load();
        const reloaded = doc.Connectors.Get(0)!;
        assert.equal(reloaded.LabelText, '', 'stays uncaptioned');
        assert.equal(reloaded.LabelPosition, 0.5, 'stays at the midpoint default');
    });
});
