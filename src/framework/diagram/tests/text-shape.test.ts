import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { Shape } from '../../../basic/shapes/shape.js';
import { Figure } from '../figure.js';
import { TextAutoFit } from '../shape-text.js';
import { TextShape, Callout } from '../text-shape.js';
import { DiagramDocument, type DiagramStorage } from '../diagram-document.js';

// § diagram-text Slice 8 — text shapes. A TextShape is an auto-growing text
// box (a preconfigured Figure); a Callout adds a leader that points at a
// target Figure and follows it. Both persist.

class MemoryStorage implements DiagramStorage
{
    private readonly _map = new Map<string, string>();
    public GetItem(key: string): string | null { return this._map.get(key) ?? null; }
    public SetItem(key: string, value: string): void { this._map.set(key, value); }
}

function leaderOf(c: Callout): Shape | undefined
{
    return (c as unknown as { _leader?: Shape })._leader;
}

describe('TextShape — annotation box', () => {
    beforeEach(() => { initTestApp(); });

    test('is a Figure preconfigured as an auto-growing text box', () => {
        const t = new TextShape();
        assert.ok(t instanceof Figure, 'reuses the whole Figure machinery');
        assert.equal(t.Kind, 'text', 'identified for serialization');
        assert.equal(t.Text.AutoFit, TextAutoFit.GrowShape, 'grows to its label');
        assert.ok(t.Geometry !== undefined, 'has a box geometry');
    });

    test('grows to contain a long label', () => {
        const t = new TextShape();
        const w0 = t.Width;
        t.LabelText = 'A fairly long annotation that will not fit the default box width';
        assert.ok(t.Width > w0, 'the box widened to fit the text');
    });
});

describe('Callout — leader to a target', () => {
    beforeEach(() => { initTestApp(); });

    function scene(): { callout: Callout; target: Figure }
    {
        const callout = new Callout();
        callout.Left = 0; callout.Top = 0; callout.Width = 100; callout.Height = 40;
        const target = new Figure();
        target.Left = 300; target.Top = 0;   // default 80×80 → centre (340, 40)
        return { callout, target };
    }

    test('a Callout is a TextShape identified as a callout', () => {
        const c = new Callout();
        assert.ok(c instanceof TextShape);
        assert.equal(c.Kind, 'callout');
        assert.equal(c.LeaderTargetNode, undefined, 'no leader until targeted');
    });

    test('targeting a Figure draws a leader that reaches toward it', () => {
        const { callout, target } = scene();
        assert.equal(leaderOf(callout)?.Geometry, undefined, 'no geometry while untargeted');
        callout.LeaderTargetNode = target;
        const geo = leaderOf(callout)?.Geometry;
        assert.ok(geo !== undefined, 'leader geometry appears');
        // The leader reaches out to the target centre (~x=340 in local coords).
        assert.ok(geo!.GetBounds().Right > callout.Width, 'leader extends past the box toward the target');
    });

    test('the leader follows the target as it moves', () => {
        const { callout, target } = scene();
        callout.LeaderTargetNode = target;
        const before = leaderOf(callout)!.Geometry!.GetBounds().Right;
        target.Left = 500;                         // move the target further away
        const after = leaderOf(callout)!.Geometry!.GetBounds().Right;
        assert.ok(after > before, 'leader re-drew to the new target position');
    });

    test('clearing the target removes the leader', () => {
        const { callout, target } = scene();
        callout.LeaderTargetNode = target;
        assert.ok(leaderOf(callout)!.Geometry !== undefined);
        callout.LeaderTargetNode = undefined;
        assert.equal(leaderOf(callout)!.Geometry, undefined, 'leader cleared');
    });
});

describe('Text shapes — persistence', () => {
    beforeEach(() => { initTestApp(); });

    test('a TextShape round-trips as a TextShape with its label', () => {
        const doc = new DiagramDocument(new MemoryStorage());
        const t = new TextShape();
        t.Id = 't1'; t.LabelText = 'note';
        doc.Nodes.Add(t);
        doc.Save();
        doc.Load();
        const reloaded = doc.Nodes.Get(0);
        assert.ok(reloaded instanceof TextShape, 'reconstructed as a TextShape');
        assert.equal((reloaded as TextShape).LabelText, 'note');
    });

    test('a Callout round-trips with its leader target re-wired', () => {
        const doc = new DiagramDocument(new MemoryStorage());
        // M2: geometry nodes (Figure.fromKind/ShapeNodeVM) reload as ShapeNodeVM,
        // which can't be stored in LeaderTargetNode (typed Figure | undefined).
        // Use a TextShape as the leader target — it always reloads as a Figure
        // (TextShape branch in _deserialize), so the leader re-wiring still works.
        const target = new TextShape(); target.Id = 'n1'; target.LabelText = 'anchor'; doc.Nodes.Add(target);
        const callout = new Callout(); callout.Id = 'c1'; callout.LabelText = 'see this';
        callout.LeaderTargetNode = target;
        doc.Nodes.Add(callout);
        doc.Save();
        doc.Load();
        const rt = doc.Nodes.Get(0) as Figure;
        const rc = doc.Nodes.Get(1);
        assert.ok(rc instanceof Callout, 'reconstructed as a Callout');
        assert.ok(rt instanceof TextShape, 'target reloaded as TextShape (a Figure)');
        assert.equal((rc as Callout).LeaderTargetNode, rt, 'leader re-wired to the reloaded target');
    });
});
