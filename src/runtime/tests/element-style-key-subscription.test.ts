import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    Application,
    Element,
    MetaData,
    MuralBase,
    Panel,
    ResourceDictionary,
    Setter,
    Size,
    Style,
    type DrawingContext,
} from '../index.js';
import { resolveKey } from '../model-internals.js';
import { HeadlessTarget } from '../../visual-engine/index.js';

// § 3a (notification-primitives design) — Element.subscribe_styles uses
// per-key STYLE-channel subscriptions instead of a coarse Subscribe. This is
// exercised on the APPLICATION.Resources path, which is the one the Libraries
// panel storm hit: a library merges a big string-keyed presentation dict into
// Application.Resources and populates it, and under the old coarse subscription
// every string-keyed Set woke every element to re-resolve a Function-keyed
// style it can't affect. resolve_implicit_style calls
// this.TryFindResource(this.constructor); counting those calls is a direct
// measure of the style work a resource change caused.
//
// (An element's OWN Resources dict still uses the coarse line-238 subscription
// on purpose — it drives _refresh_styles_subtree + DynamicResource and is not
// the hot path; see the design's "out of scope".)

class Widget extends Element
{
    static { MuralBase.RegisterProperty(Widget, 'Bias', 0, MetaData.None); }
    public get Bias(): number { return this.get_property_value(resolveKey(this, undefined, 'Bias')); }
    public set Bias(v: number) { this.set_property_value(resolveKey(this, undefined, 'Bias'), v); }
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
    protected override RenderOverride(_dc: DrawingContext): void { }
}
class TestPanel extends Panel { }

// Count implicit-style resolutions (TryFindResource keyed by the widget's own
// constructor) after mount.
function countImplicitResolves(w: Widget): { n: number }
{
    const c = { n: 0 };
    const real = w.TryFindResource.bind(w);
    (w as unknown as { TryFindResource: (k: unknown) => unknown }).TryFindResource =
        (key: unknown) => { if (key === w.constructor) c.n++; return real(key as never); };
    return c;
}

// Mount a Widget inside a panel under a HeadlessTarget so it attaches into the
// app tree (subscribe_styles wires the Application.Resources per-key sub).
function mountWidget(): Widget
{
    const root = new TestPanel();
    const w = new Widget();
    root.AddChild(w);
    const target = new HeadlessTarget(200, 200);
    target.Content = root;
    return w;
}

describe('§ 3a — per-key style subscription avoids Application.Resources churn work', () =>
{
    beforeEach(() => { Application.current = null; new Application(); });

    test('string-key churn does zero implicit-style work; a real type-key Style still re-resolves', () =>
    {
        const app = Application.current!;
        const w = mountWidget();
        const c = countImplicitResolves(w);

        // 25 unrelated STRING-keyed Sets on Application.Resources. Old coarse
        // Subscribe: each wakes resolve_implicit_style. With 3a: the per-key
        // wrapper sees no change to the Widget-keyed value and stays quiet.
        for (let i = 0; i < 25; i++) app.Resources.Set(`unrelated-${i}`, i);
        assert.equal(c.n, 0, 'string-key churn caused zero implicit-style re-resolution');
        assert.equal(w.Bias, 0, 'and no style applied');

        // A real implicit style for Widget → the type-key subscription fires once.
        app.Resources.Set(Widget, new Style(Widget, [new Setter(Widget, 'Bias', 88)]));
        assert.equal(c.n, 1, 'the type-key change re-resolved exactly once');
        assert.equal(w.Bias, 88, 'the implicit style applied');
    });

    test('a non-participating merged dict on Application.Resources causes zero style work (§ 3b)', () =>
    {
        const app = Application.current!;
        const w = mountWidget();
        const c = countImplicitResolves(w);

        // A keyed-only presentation dict merged into app resources, opted out of
        // styling. Its churn forwards to the app dict's general channel only, so
        // no element does any style work for it.
        const dict = new ResourceDictionary();
        dict.StyleParticipating = false;
        app.Resources.AddMergedDictionary(dict);
        for (let i = 0; i < 25; i++) dict.Set(`cls-${i}`, i);
        assert.equal(c.n, 0, 'non-participating merged churn did zero style work');
        assert.equal(w.Bias, 0);
    });
});
