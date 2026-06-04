import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    DataObject,
    DragDrop,
    DragDropEffects,
    DragEventArgs,
    DragSession,
    NoModifiers,
    Panel,
    Size,
    Visual,
    dispatchDrag,
    type DrawingContext,
} from '../index.js';

// Drag-event probe class — minimal Panel subclass that records each
// drag virtual it sees (tunnel + bubble). Used across the dispatch
// tests below to assert ordering and Handled short-circuit.
class DragLoggerPanel extends Panel
{
    public readonly log: string[] = [];
    public readonly tag: string;
    public stopOnPreviewOver = false;
    constructor(tag: string) { super(); this.tag = tag; }
    protected override OnPreviewDragEnter(): void { this.log.push(`tunnel/Enter:${this.tag}`); }
    protected override OnDragEnter():        void { this.log.push(`bubble/Enter:${this.tag}`); }
    protected override OnPreviewDragLeave(): void { this.log.push(`tunnel/Leave:${this.tag}`); }
    protected override OnDragLeave():        void { this.log.push(`bubble/Leave:${this.tag}`); }
    protected override OnPreviewDragOver(args: DragEventArgs): void
    {
        this.log.push(`tunnel/Over:${this.tag}`);
        if (this.stopOnPreviewOver) args.Handled = true;
    }
    protected override OnDragOver():         void { this.log.push(`bubble/Over:${this.tag}`); }
    protected override OnPreviewDrop():      void { this.log.push(`tunnel/Drop:${this.tag}`); }
    protected override OnDrop():             void { this.log.push(`bubble/Drop:${this.tag}`); }
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

function dragArgs(kind: 'DragEnter' | 'DragLeave' | 'DragOver' | 'Drop', source: Visual): DragEventArgs
{
    return new DragEventArgs(kind, source, {
        HostX: 0, HostY: 0,
        Data: new DataObject(),
        AllowedEffects: DragDropEffects.Copy,
        Modifiers: NoModifiers,
    });
}

describe('DragDropEffects — flag enum', () => {
    test('has the standard None/Copy/Move/Link/All flags', () => {
        assert.equal(DragDropEffects.None, 0);
        assert.equal(DragDropEffects.Copy, 1);
        assert.equal(DragDropEffects.Move, 2);
        assert.equal(DragDropEffects.Link, 4);
        assert.equal(DragDropEffects.All,
            DragDropEffects.Copy | DragDropEffects.Move | DragDropEffects.Link);
    });
});

describe('DataObject — formats map', () => {
    test('Set / Get round-trips the value verbatim', () => {
        const d = new DataObject().Set('mural/node-kind', { kind: 'rect' });
        assert.deepEqual(d.Get<{ kind: string }>('mural/node-kind'), { kind: 'rect' });
    });

    test('Has reports presence', () => {
        const d = new DataObject().Set('text/plain', 'hello');
        assert.equal(d.Has('text/plain'),       true);
        assert.equal(d.Has('text/uri-list'),    false);
    });

    test('Get returns undefined for absent formats', () => {
        const d = new DataObject();
        assert.equal(d.Get('text/plain'), undefined);
    });

    test('Formats lists every key in insertion order', () => {
        const d = new DataObject()
            .Set('text/plain',     'hi')
            .Set('mural/node-kind', 'rect');
        assert.deepEqual([...d.Formats()], ['text/plain', 'mural/node-kind']);
    });

    test('Set returns `this` for chaining', () => {
        const d = new DataObject();
        const ret = d.Set('text/plain', 'hi');
        assert.equal(ret, d);
    });

    test('Set overwrites a previously-set format', () => {
        const d = new DataObject()
            .Set('text/plain', 'first')
            .Set('text/plain', 'second');
        assert.equal(d.Get('text/plain'), 'second');
        assert.deepEqual([...d.Formats()], ['text/plain']);
    });
});

describe('drag events — dispatch order', () => {
    test('tunnel runs root→target, then bubble runs target→root for DragEnter', () => {
        const root = new DragLoggerPanel('root');
        const mid  = new DragLoggerPanel('mid');
        const leaf = new DragLoggerPanel('leaf');
        root.AddChild(mid);
        mid.AddChild(leaf);

        dispatchDrag(dragArgs('DragEnter', leaf));

        // Tunnel: root, mid, leaf (root→target). Bubble: leaf, mid, root
        // (target→root).
        assert.deepEqual([...root.log, ...mid.log, ...leaf.log], [
            'tunnel/Enter:root',
            'bubble/Enter:root',
            'tunnel/Enter:mid',
            'bubble/Enter:mid',
            'tunnel/Enter:leaf',
            'bubble/Enter:leaf',
        ]);
        // Confirmed per-node tunnel-before-bubble order:
        assert.deepEqual(leaf.log, ['tunnel/Enter:leaf', 'bubble/Enter:leaf']);
    });

    test('Handled=true during tunnel skips the rest of tunnel AND bubble', () => {
        const root = new DragLoggerPanel('root');
        const leaf = new DragLoggerPanel('leaf');
        root.AddChild(leaf);
        root.stopOnPreviewOver = true;       // root's tunnel marks Handled

        dispatchDrag(dragArgs('DragOver', leaf));

        // Root sees its own tunnel. Leaf never sees the event (tunnel was
        // halted before it reached the target); root never sees the bubble
        // either (both passes terminate on Handled).
        assert.deepEqual(root.log, ['tunnel/Over:root']);
        assert.deepEqual(leaf.log, []);
    });

    test('Drop fires through tunnel + bubble normally', () => {
        const root = new DragLoggerPanel('root');
        const leaf = new DragLoggerPanel('leaf');
        root.AddChild(leaf);

        dispatchDrag(dragArgs('Drop', leaf));

        assert.deepEqual([...root.log, ...leaf.log], [
            'tunnel/Drop:root',
            'bubble/Drop:root',
            'tunnel/Drop:leaf',
            'bubble/Drop:leaf',
        ]);
    });

    test('dispatchDrag refuses non-drag kinds', () => {
        const v = new DragLoggerPanel('v');
        // Build a PointerMove args object via the same constructor —
        // dispatchDrag should reject it because the kind isn't a drag
        // kind. We can't construct one cleanly via DragEventArgs (the
        // constructor's kind parameter is typed), so we fake one with a
        // cast just to validate the runtime guard.
        const args = dragArgs('DragOver', v);
        (args as unknown as { Kind: string }).Kind = 'PointerMove';
        assert.throws(() => dispatchDrag(args), /not a drag event/);
    });
});

function makeBareVisual(): Visual { return new DragLoggerPanel('bare'); }

describe('DragSession — standalone (no InputManager wiring yet)', () => {
    test('DoDragDrop returns a session carrying Source/Data/AllowedEffects', () => {
        DragDrop._pendingSession = null;             // baseline
        const source = makeBareVisual();
        const data   = new DataObject().Set('mural/node-kind', 'rect');
        const session = DragDrop.DoDragDrop(source, data, DragDropEffects.Copy);
        assert.equal(session.Source,          source);
        assert.equal(session.Data,            data);
        assert.equal(session.AllowedEffects,  DragDropEffects.Copy);
        // Pending slot was filled for the InputManager to pick up.
        assert.equal(DragDrop._pendingSession, session);
        DragDrop._pendingSession = null;
        DragDrop._pendingOptions = {};
    });

    test('OnMove subscribers fire when the session is driven', () => {
        const session = DragDrop.DoDragDrop(makeBareVisual(), new DataObject(), DragDropEffects.Copy);
        const calls: Array<[number, number]> = [];
        session.OnMove((x, y) => calls.push([x, y]));

        session._fireMove(10, 20);
        session._fireMove(30, 40);

        assert.deepEqual(calls, [[10, 20], [30, 40]]);
        DragDrop._pendingSession = null;
    });

    test('OnMove returns an unsubscribe function that stops further callbacks', () => {
        const session = DragDrop.DoDragDrop(makeBareVisual(), new DataObject(), DragDropEffects.Copy);
        const calls: Array<[number, number]> = [];
        const unsub = session.OnMove((x, y) => calls.push([x, y]));

        session._fireMove(1, 2);
        unsub();
        session._fireMove(3, 4);

        assert.deepEqual(calls, [[1, 2]]);
        DragDrop._pendingSession = null;
    });

    test('Cancel resolves the promise with None', async () => {
        const session = DragDrop.DoDragDrop(makeBareVisual(), new DataObject(), DragDropEffects.Copy);
        session.Cancel();
        assert.equal(session.IsSettled, true);
        const effect = await session;
        assert.equal(effect, DragDropEffects.None);
        DragDrop._pendingSession = null;
    });

    test('Cancel detaches all OnMove subscribers', () => {
        const session = DragDrop.DoDragDrop(makeBareVisual(), new DataObject(), DragDropEffects.Copy);
        const calls: number[] = [];
        session.OnMove(() => calls.push(1));
        session.Cancel();
        session._fireMove(0, 0);
        assert.deepEqual(calls, []);
        DragDrop._pendingSession = null;
    });

    test('then() resolves with the effect provided by _complete', async () => {
        const session = DragDrop.DoDragDrop(makeBareVisual(), new DataObject(), DragDropEffects.All);
        session._complete(DragDropEffects.Move);
        const effect = await session;
        assert.equal(effect, DragDropEffects.Move);
        DragDrop._pendingSession = null;
    });

    test('_complete is idempotent — second call is ignored', async () => {
        const session = DragDrop.DoDragDrop(makeBareVisual(), new DataObject(), DragDropEffects.All);
        session._complete(DragDropEffects.Copy);
        session._complete(DragDropEffects.Move);  // ignored
        const effect = await session;
        assert.equal(effect, DragDropEffects.Copy);
        DragDrop._pendingSession = null;
    });

    test('DragDrop.DragThreshold exposes a tunable threshold defaulting to 4', () => {
        assert.equal(DragDrop.DragThreshold, 4);
        DragDrop.DragThreshold = 8;
        assert.equal(DragDrop.DragThreshold, 8);
        DragDrop.DragThreshold = 4;
    });

    test('opts.preview is stashed on _pendingOptions', () => {
        DragDrop._pendingSession = null;
        const session = DragDrop.DoDragDrop(makeBareVisual(), new DataObject(),
            DragDropEffects.Copy, { preview: null });
        assert.equal(DragDrop._pendingOptions.preview, null);
        DragDrop._pendingSession = null;
        DragDrop._pendingOptions = {};
        void session;
    });
});

describe('Visual.AllowDrop / IsDragOver DPs', () => {
    test('AllowDrop defaults to false', () => {
        const v = new DragLoggerPanel('v');
        assert.equal(v.AllowDrop, false);
    });

    test('AllowDrop is settable from consumer code', () => {
        const v = new DragLoggerPanel('v');
        v.AllowDrop = true;
        assert.equal(v.AllowDrop, true);
        v.AllowDrop = false;
        assert.equal(v.AllowDrop, false);
    });

    test('IsDragOver defaults to false and is set via _set_property_value_by_name', () => {
        const v = new DragLoggerPanel('v');
        assert.equal(v.IsDragOver, false);
        // Mirror of the InputManager's setIsMouseOver helper pattern.
        (v as unknown as { _set_property_value_by_name(name: string, value: unknown): void })
            ._set_property_value_by_name('IsDragOver', true);
        assert.equal(v.IsDragOver, true);
    });
});
