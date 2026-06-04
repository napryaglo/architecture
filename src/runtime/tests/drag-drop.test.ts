import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    DataObject,
    DragDropEffects,
    DragEventArgs,
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
