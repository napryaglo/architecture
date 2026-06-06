import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    DataObject,
    DragDropEffects,
    DragEventArgs,
    DragSession,
    NoModifiers,
    ObservableCollection,
    Rect,
    Size,
    Visual,
} from '../../runtime/index.js';
import { Canvas } from '../canvas.js';
import { DataTemplate } from '../data-template.js';
import { ItemsControl } from '../items-control.js';
import { ListReorderBehavior } from '../list-reorder-behavior.js';

// Stand-in row visual whose ArrangedRect we can stamp directly so the
// reorder math has predictable container midpoints to compare against.
class StubRow extends Visual
{
    public stampRect(r: Rect): void { this['_arrangedRect'] = r; }
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
}

function buildItemsControl(items: readonly unknown[]): { ic: ItemsControl; rows: StubRow[]; coll: ObservableCollection<unknown> } {
    const ic   = new ItemsControl();
    const coll = new ObservableCollection<unknown>();
    for (const v of items) coll.Add(v);
    ic.Items = coll;
    // Bypass the full container-generation machinery — stamp explicit
    // logicalChildren by reusing the private `_containers` slot the
    // ItemsControl reads in its logicalChildren getter. Each container
    // is given a known ArrangedRect so the cursor-to-index math has a
    // deterministic input.
    const rows: StubRow[] = [];
    for (let i = 0; i < items.length; i++)
    {
        const r = new StubRow();
        r.stampRect(new Rect(0, i * 20, 100, 20));
        rows.push(r);
    }
    (ic as unknown as { _containers: Visual[] })._containers = rows;
    return { ic, rows, coll };
}

function dropArgs(hostY: number, fromIndex: number, format = 'mural/reorder/from-index'): DragEventArgs
{
    const data = new DataObject().Set(format, fromIndex);
    return new DragEventArgs('Drop', new StubRow(), {
        HostX: 0, HostY: hostY,
        Data: data,
        AllowedEffects: DragDropEffects.Move,
        Modifiers: NoModifiers,
    });
}

describe('ListReorderBehavior — receiver-side drop logic', () => {
    test('AllowDrop is set when the behavior attaches', () => {
        const { ic } = buildItemsControl(['a', 'b', 'c']);
        ic.AddBehavior(new ListReorderBehavior());
        assert.equal(ic.AllowDrop, true);
    });

    test('drop above row 1 midpoint moves the source there', () => {
        const { ic, coll } = buildItemsControl(['a', 'b', 'c']);
        ic.AddBehavior(new ListReorderBehavior());
        // Row midpoints (height 20 each, top y = i*20) live at 10, 30,
        // 50. Drop at hostY=25 lands ABOVE row 1's midpoint, so insertion
        // index is 1. Moving from index 2 ('c') → insertion 1 yields
        // ['a','c','b'].
        ic.FireRoutedListeners('Drop', dropArgs(25, 2));
        assert.deepEqual(snapshot(coll), ['a', 'c', 'b']);
    });

    test('drop below the last row appends to end', () => {
        const { ic, coll } = buildItemsControl(['a', 'b', 'c']);
        ic.AddBehavior(new ListReorderBehavior());
        // Beyond the last midpoint (50) — insertion index is 3 (end).
        // Moving from index 0 ('a') → insertion adjusted to 2 after the
        // removal index-shift; result ['b','c','a'].
        ic.FireRoutedListeners('Drop', dropArgs(200, 0));
        assert.deepEqual(snapshot(coll), ['b', 'c', 'a']);
    });

    test('dragging onto its own slot is a no-op', () => {
        const { ic, coll } = buildItemsControl(['a', 'b', 'c']);
        ic.AddBehavior(new ListReorderBehavior());
        // hostY=15 → insertion before row 1 (above midpoint 30) → 1.
        // Source from=0 → target 1 → no-op (the gap immediately after
        // the source row).
        ic.FireRoutedListeners('Drop', dropArgs(15, 0));
        assert.deepEqual(snapshot(coll), ['a', 'b', 'c']);
    });

    test('drop with no matching format key is ignored', () => {
        const { ic, coll } = buildItemsControl(['a', 'b', 'c']);
        ic.AddBehavior(new ListReorderBehavior());
        // No format set → behavior bails out without mutating Items.
        const args = new DragEventArgs('Drop', new StubRow(), {
            HostX: 0, HostY: 25,
            Data: new DataObject(),
            AllowedEffects: DragDropEffects.Move,
            Modifiers: NoModifiers,
        });
        ic.FireRoutedListeners('Drop', args);
        assert.deepEqual(snapshot(coll), ['a', 'b', 'c']);
    });

    test('DragOver sets Effect=Move when the format key is present', () => {
        const { ic } = buildItemsControl(['a', 'b']);
        ic.AddBehavior(new ListReorderBehavior());
        const args = new DragEventArgs('DragOver', new StubRow(), {
            HostX: 0, HostY: 5,
            Data: new DataObject().Set('mural/reorder/from-index', 0),
            AllowedEffects: DragDropEffects.Move,
            Modifiers: NoModifiers,
        });
        ic.FireRoutedListeners('DragOver', args);
        assert.equal(args.Effect, DragDropEffects.Move);
    });
});

function snapshot<T>(c: ObservableCollection<T>): T[] {
    const out: T[] = [];
    for (let i = 0; i < c.Count; i++) out.push(c.Get(i)!);
    return out;
}

// Pins backlog 8.5: InsertionAdornerTemplate DP — when set, the
// behavior materializes the template at the insertion gap on the
// host's overlay layer. The framework computes the gap position from
// the same midpoint math the drop logic already uses.
describe('ListReorderBehavior — insertion-line adorner (8.5)', () => {
    // Stub PresentationTarget that records what gets attached / detached
    // on its overlay. Pluggable directly into the ItemsControl's
    // `target` field bypassing the renderer; the behavior reads
    // `host['target']` and calls AttachOverlay / DetachOverlay on it.
    class StubTarget {
        public readonly attached: Visual[] = [];
        public readonly detached: Visual[] = [];
        public AttachOverlay(v: Visual): void { this.attached.push(v); }
        public DetachOverlay(v: Visual): void { this.detached.push(v); }
    }

    function lineTemplate(): DataTemplate {
        return new DataTemplate(() => {
            const line = new (class extends Visual {
                protected override MeasureOverride(_a: Size): Size { return new Size(0, 2); }
            })();
            return line;
        });
    }

    function dragOverArgs(hostY: number, session: DragSession): DragEventArgs {
        const data = session.Data;
        data.Set('mural/reorder/from-index', 0);
        return new DragEventArgs('DragOver', new StubRow(), {
            HostX: 0, HostY: hostY,
            Data: data,
            AllowedEffects: DragDropEffects.Move,
            Modifiers: NoModifiers,
            Session: session,
        });
    }

    test('Without a template, no overlay attachment happens', () => {
        const { ic } = buildItemsControl(['a', 'b', 'c']);
        const target = new StubTarget();
        (ic as unknown as { _target: StubTarget })._target = target;
        ic.AddBehavior(new ListReorderBehavior());

        const session = new DragSession(undefined, new DataObject(), DragDropEffects.Move);
        ic.FireRoutedListeners('DragOver', dragOverArgs(10, session));
        assert.equal(target.attached.length, 0);
        session.Cancel();
    });

    test('First valid DragOver materializes the template and attaches it to the overlay', () => {
        const { ic } = buildItemsControl(['a', 'b', 'c']);
        (ic as unknown as { _arrangedRect: Rect })._arrangedRect = new Rect(0, 0, 100, 60);
        const target = new StubTarget();
        (ic as unknown as { _target: StubTarget })._target = target;
        const beh = new ListReorderBehavior();
        beh.InsertionAdornerTemplate = lineTemplate();
        ic.AddBehavior(beh);

        const session = new DragSession(undefined, new DataObject(), DragDropEffects.Move);
        // hostY = 10 → cursor in row 0 (which spans y 0..20). midpoint = 10.
        // hostY < midpoint? No (10 < 10 false), but boundary case.
        // Try hostY = 5 → midpoint of row 0 = 10. 5 < 10 → insertion index 0.
        ic.FireRoutedListeners('DragOver', dragOverArgs(5, session));
        assert.equal(target.attached.length, 1);
        // Attached value is the Canvas wrapper; the produced template
        // visual is its child. Canvas.Top steers the child within the
        // wrapper so the OverlayLayer's full-surface arrange slot
        // doesn't squash the positioning.
        const wrapper = target.attached[0]!;
        const adorner = wrapper.visualChildren[0]!;
        // Adorner at gap before row 0 → y = top of row 0 = 0.
        assert.equal(Canvas.GetTop(adorner), 0);
        // Adorner width follows the host's arranged width.
        assert.equal(adorner.Width, 100);
        session.Cancel();
    });

    test('Subsequent DragOvers re-use the same adorner and shift Canvas.Top', () => {
        const { ic } = buildItemsControl(['a', 'b', 'c']);
        (ic as unknown as { _arrangedRect: Rect })._arrangedRect = new Rect(0, 0, 100, 60);
        const target = new StubTarget();
        (ic as unknown as { _target: StubTarget })._target = target;
        const beh = new ListReorderBehavior();
        beh.InsertionAdornerTemplate = lineTemplate();
        ic.AddBehavior(beh);

        const session = new DragSession(undefined, new DataObject(), DragDropEffects.Move);
        ic.FireRoutedListeners('DragOver', dragOverArgs(5, session));      // gap before row 0
        const wrapper = target.attached[0]!;
        const adorner = wrapper.visualChildren[0]!;
        const before = Canvas.GetTop(adorner);
        ic.FireRoutedListeners('DragOver', dragOverArgs(35, session));     // mid row 1 → gap between 1 and 2 = y 40
        assert.equal(target.attached.length, 1, 'still one adorner attached');
        const after = Canvas.GetTop(adorner);
        assert.notEqual(after, before);
        session.Cancel();
    });

    test('DragLeave tears down the adorner', () => {
        const { ic } = buildItemsControl(['a', 'b']);
        (ic as unknown as { _arrangedRect: Rect })._arrangedRect = new Rect(0, 0, 100, 40);
        const target = new StubTarget();
        (ic as unknown as { _target: StubTarget })._target = target;
        const beh = new ListReorderBehavior();
        beh.InsertionAdornerTemplate = lineTemplate();
        ic.AddBehavior(beh);

        const session = new DragSession(undefined, new DataObject(), DragDropEffects.Move);
        ic.FireRoutedListeners('DragOver', dragOverArgs(5, session));
        assert.equal(target.attached.length, 1);

        ic.FireRoutedListeners('DragLeave', new DragEventArgs('DragLeave', ic, {
            HostX: 0, HostY: 100,
            Data: session.Data,
            AllowedEffects: DragDropEffects.Move,
            Modifiers: NoModifiers,
            Session: session,
        }));
        assert.equal(target.detached.length, 1, 'adorner detached on DragLeave');
        session.Cancel();
    });
});
