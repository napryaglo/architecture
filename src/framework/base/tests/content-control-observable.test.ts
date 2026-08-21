import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Visual } from '../../../runtime/index.js';
import { Observable } from '../../../runtime/observable.js';
import { SolidColorBrush, FontWeight } from '../../../visual-engine/index.js';
import { Border, ContentPresenter, ControlTemplate, DataTemplate, TextBlock } from '../../../basic/index.js';
import { ContentControl } from '../content-control.js';

// A leaf Visual the DataTemplate produces so we can assert the template
// rendered (the presenter's child is a Leaf, not the red diagnostic).
class Leaf extends Visual
{
    protected override RenderOverride(): void { }
}

function borderTemplate(): ControlTemplate
{
    return new ControlTemplate(_tp => {
        const border = new Border();
        border.SetChild(new ContentPresenter());
        return border;
    });
}

// A plain (non-MuralBase) Observable used as Content. DataTemplate dispatch
// keys on value.constructor, which works for any object — the only gate to
// widen was the type annotation on the Content slot.
class PlainVM extends Observable
{
    private _text: string;
    constructor(text: string) { super(); this._text = text; }
    public get text(): string { return this._text; }
}

class OrphanVM extends Observable {}

describe('ContentControl dispatches a DataTemplate for a plain Observable', () => {
    test('a registered DataTemplate for the Observable subtype renders', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();
        cc.Resources.Set(PlainVM, new DataTemplate(() => new Leaf(), PlainVM));

        // Assigned WITHOUT a cast — this only typechecks once Content's slot
        // is widened MuralBase → Observable (the type-only part of Task 3).
        cc.Content = new PlainVM('hi');

        const border    = cc.visualChildren[0] as Border;
        const presenter = border.visualChildren[0] as ContentPresenter;
        const rendered  = presenter.visualChildren[0];
        assert.ok(rendered instanceof Leaf, 'template produced a Leaf');
    });

    test('an unmatched Observable type yields the red diagnostic', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();

        cc.Content = new OrphanVM();

        const border    = cc.visualChildren[0] as Border;
        const presenter = border.visualChildren[0] as ContentPresenter;
        const err       = presenter.visualChildren[0] as TextBlock;

        assert.ok(err instanceof TextBlock, 'diagnostic is a TextBlock');
        assert.equal(err.Text, 'can not resolve template for: OrphanVM');
        assert.equal(err.FontWeight, FontWeight.Bold);
        const fg = err.Foreground as SolidColorBrush;
        assert.ok(fg instanceof SolidColorBrush);
        assert.deepEqual(fg.Color, Color.Red);
    });
});
