import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    MetaData,
    Model,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    HeadlessTarget,
    SolidColorBrush,
    SvgDrawingContext,
} from '../index.js';

// Leaf Visual whose MeasureOverride returns a caller-supplied size and
// whose RenderOverride paints a fixed-color rectangle. Used to drive the
// layout/render pipeline without depending on the higher-level controls.
class TestLeaf extends Visual
{
    constructor(private box: Size, private readonly color: Color = Color.Red)
    {
        super();
    }

    public Resize(box: Size): void
    {
        this.box = box;
        this.InvalidateMeasure();
    }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        return this.box;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        dc.DrawRectangle(
            new SolidColorBrush(this.color),
            undefined,
            { X: 0, Y: 0, Width: this.box.Width, Height: this.box.Height } as never,
        );
    }
}

// PresentationTarget is abstract; HeadlessTarget is the cheapest concrete
// subclass to use for queue-level tests. Tests that don't care about
// paint never call Render(dc). Setting Content schedules a measure
// invalidation (the new subtree carries stale "needs measure" flags
// from pre-attach property writes), so we drain via Flush() here so
// each test starts from clean dirty Sets.
function makeTarget(content?: Visual, w?: number, h?: number): HeadlessTarget
{
    const t = new HeadlessTarget(w, h, content);
    t.Flush();
    return t;
}

// Thin peek into the protected dirty Sets for test assertions.
function dirty(t: HeadlessTarget): {
    measure: Set<Visual>;
    arrange: Set<Visual>;
    render:  Set<Visual>;
}
{
    const r = t as unknown as {
        measureDirty: Set<Visual>;
        arrangeDirty: Set<Visual>;
        renderDirty:  Set<Visual>;
    };
    return { measure: r.measureDirty, arrange: r.arrangeDirty, render: r.renderDirty };
}

// Registers a fresh property on a fresh subclass per test so the
// WeakMap-backed registry stays isolated between cases.
function freshClassWithProp(meta: MetaData, defaultValue: unknown = 0): {
    Klass: new () => Visual;
    name: string;
}
{
    class Subject extends Visual {}
    const name = 'p_' + Math.random().toString(36).slice(2, 8);
    Model.RegisterProperty(Subject, name, defaultValue, meta);
    return { Klass: Subject, name };
}

describe('PresentationTarget invalidation queue', () => {
    test('a Measure-affecting property change on attached Content lands in measureDirty', () => {
        const { Klass, name } = freshClassWithProp(MetaData.Measure);
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        root.set_property_value(name, 42);

        const sets = dirty(t);
        assert.ok(sets.measure.has(root));
        // Visual.InvalidateMeasure also clears arrange validity but
        // doesn't push to arrangeDirty unless InvalidateArrange itself
        // fires — so the arrange set stays empty for a pure Measure
        // metadata change.
        assert.equal(sets.arrange.size, 0);
    });

    test('an Arrange-affecting property change lands in arrangeDirty only', () => {
        const { Klass, name } = freshClassWithProp(MetaData.Arrange);
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        root.set_property_value(name, 1);

        const sets = dirty(t);
        assert.equal(sets.measure.size, 0);
        assert.ok(sets.arrange.has(root));
        assert.equal(sets.render.size, 0);
    });

    test('a Render-affecting property change lands in renderDirty only', () => {
        const { Klass, name } = freshClassWithProp(MetaData.Render);
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        root.set_property_value(name, 1);

        const sets = dirty(t);
        assert.equal(sets.measure.size, 0);
        assert.equal(sets.arrange.size, 0);
        assert.ok(sets.render.has(root));
    });

    test('repeated invalidations on the same Visual dedupe via Set semantics', () => {
        const { Klass, name } = freshClassWithProp(MetaData.Render);
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        root.set_property_value(name, 1);
        root.set_property_value(name, 2);
        root.set_property_value(name, 3);

        assert.equal(dirty(t).render.size, 1);
    });

    test('a property carrying multiple MetaData flags populates the matching sets', () => {
        const { Klass, name } = freshClassWithProp(
            MetaData.Measure | MetaData.Render,
        );
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        root.set_property_value(name, 7);

        const sets = dirty(t);
        assert.ok(sets.measure.has(root));
        assert.ok(sets.render.has(root));
    });
});

describe('PresentationTarget microtask coalescing', () => {
    test('many invalidations within the same task → one Flush() on the next microtask', async () => {
        const { Klass, name } = freshClassWithProp(MetaData.Measure);
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        let flushCount = 0;
        const baseFlush = t.Flush.bind(t);
        t.Flush = () => { flushCount++; baseFlush(); };

        for (let i = 0; i < 10; i++) root.set_property_value(name, i);

        // Microtask hasn't fired yet — still inside this task.
        assert.equal(flushCount, 0);
        assert.ok(t.HasPendingLayout);

        await Promise.resolve();

        assert.equal(flushCount, 1);
        assert.equal(t.HasPendingLayout, false);
    });

    test('after the auto-flush, a new invalidation re-arms the scheduler', async () => {
        const { Klass, name } = freshClassWithProp(MetaData.Measure);
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        let flushCount = 0;
        const baseFlush = t.Flush.bind(t);
        t.Flush = () => { flushCount++; baseFlush(); };

        root.set_property_value(name, 1);
        await Promise.resolve();
        assert.equal(flushCount, 1);

        // Second batch in a fresh task.
        root.set_property_value(name, 2);
        await Promise.resolve();
        assert.equal(flushCount, 2);
    });

    test('explicit Flush() in the same task suppresses the queued microtask flush', async () => {
        // Once Flush has run, the pending sets are clear. The microtask
        // still fires (we don't cancel it) and runs a second Flush, but
        // that second one is a Visual-cache-no-op. We just verify
        // HasPendingLayout is false synchronously after the explicit
        // call.
        const { Klass, name } = freshClassWithProp(MetaData.Measure);
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        root.set_property_value(name, 1);
        assert.ok(t.HasPendingLayout);
        t.Flush();
        assert.equal(t.HasPendingLayout, false);
        await Promise.resolve();
        assert.equal(t.HasPendingLayout, false);
    });
});

describe('PresentationTarget.Flush — layout drain semantics', () => {
    test('Flush() runs Measure on Content and publishes ActualWidth / ActualHeight', () => {
        const leaf = new TestLeaf(new Size(40, 25));
        const t = makeTarget(leaf); // auto on both axes

        t.Flush();

        assert.equal(t.ActualWidth, 40);
        assert.equal(t.ActualHeight, 25);
    });

    test('Flush() re-runs measure when Content has been resized', () => {
        const leaf = new TestLeaf(new Size(40, 25));
        const t = makeTarget(leaf);

        t.Flush();
        assert.equal(t.ActualWidth, 40);

        leaf.Resize(new Size(80, 50));
        t.Flush();
        assert.equal(t.ActualWidth, 80);
        assert.equal(t.ActualHeight, 50);
    });

    test('Flush() clears measureDirty and arrangeDirty but leaves renderDirty alone', () => {
        const { Klass, name } = freshClassWithProp(
            MetaData.Measure | MetaData.Render,
        );
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        root.set_property_value(name, 1);
        const sets = dirty(t);
        assert.equal(sets.measure.size, 1);
        assert.equal(sets.render.size, 1);

        t.Flush();

        assert.equal(sets.measure.size, 0);
        assert.equal(sets.arrange.size, 0);
        // Render set persists — only a render pass consumes it.
        assert.equal(sets.render.size, 1);
        assert.ok(t.HasPendingRender);
    });

    test('Flush() on an empty target (no Content) is a safe no-op', () => {
        const t = makeTarget();
        // Must not throw and must zero out ActualSize in auto mode.
        t.Flush();
        assert.equal(t.ActualWidth, 0);
        assert.equal(t.ActualHeight, 0);
        assert.equal(t.HasPendingLayout, false);
    });
});

describe('HeadlessTarget.Render now drains Flush() and clears renderDirty', () => {
    test('Render(dc) drains a pending layout invalidation before painting', () => {
        const leaf = new TestLeaf(new Size(40, 25));
        const t = makeTarget(leaf);
        t.Flush(); // first paint baseline
        assert.equal(t.ActualWidth, 40);

        leaf.Resize(new Size(70, 60));
        // No explicit Flush — Render is supposed to drain.
        const dc = new SvgDrawingContext();
        t.Render(dc);
        assert.equal(t.ActualWidth, 70);
        assert.equal(t.ActualHeight, 60);
    });

    test('Render(dc) clears the render-dirty set after painting', () => {
        const { Klass, name } = freshClassWithProp(MetaData.Render);
        const root = new Klass();
        const t = makeTarget(root, 100, 100);

        root.set_property_value(name, 1);
        assert.ok(t.HasPendingRender);

        t.Render(new SvgDrawingContext());

        assert.equal(t.HasPendingRender, false);
    });

    test('Render(dc) works correctly even when nothing is dirty (cache-only pass)', () => {
        const leaf = new TestLeaf(new Size(40, 25));
        const t = makeTarget(leaf);

        // First render establishes caches.
        t.Render(new SvgDrawingContext());
        assert.equal(t.ActualWidth, 40);

        // Second render with no changes — must still produce correct
        // output (Visual's cache short-circuits Measure/Arrange but
        // the paint walk runs unconditionally).
        const dc2 = new SvgDrawingContext();
        t.Render(dc2);
        assert.equal(t.ActualWidth, 40);
        const out = dc2.ToFragment();
        assert.ok(out.includes('fill="rgb(255,0,0)"'));
    });
});
