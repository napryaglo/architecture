import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    Model, PointerButton, NoModifiers,
    type PointerEventInit,
} from '../../../runtime/index.js';
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { InputManager } from '../../index.js';
import { TabControl, TabItem } from '../tabs.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { TextBlock } from '../../../basic/text-block.js';
import { initTestApp } from '../../../basic/tests/test-app.js';

// Regression: a TabItem must drive selection on click. It mirrors ListBoxItem's
// IsSelected DP but historically did NOT wire pointer clicks to the owning
// Selector, so clicking a tab changed nothing — a `SelectedItem=$ActiveDocument`
// tab strip (the document tabs) could only switch programmatically, never on
// click. TabItem.OnPointerUp now routes HandleContainerClick.

class Doc extends Model
{
    public static readonly TitleKey = Model.RegisterProperty<string>(Doc, 'Title', '', undefined);
    public get Title(): string { return this.get_property_value(Doc.TitleKey); }
    public set Title(v: string) { this.set_property_value(Doc.TitleKey, v); }
}

function layout(tc: TabControl): void
{
    const target = new HeadlessTarget(600, 400);
    target.Content = tc;
    target.Flush();
}

function pointer(o: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX: 0, HostY: 0, Button: PointerButton.Primary, Buttons: 1,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0, PointerType: 'mouse', ...o,
    };
}

// Move → Down → Up on a container, the sequence a real click produces
// (Move sets IsMouseOver, which OnPointerUp's press-here-release-here gate needs).
function click(im: InputManager, container: TabItem): void
{
    im.InjectPointerMove(container, pointer());
    im.InjectPointerDown(container, pointer());
    im.InjectPointerUp(container, pointer());
}

describe('TabItem — click drives selection', () => {
    beforeEach(() => { initTestApp(); });

    test('clicking a tab sets SelectedItem to its data row', () => {
        const tc = new TabControl();
        tc.ItemTemplate = new DataTemplate((d) => new TextBlock((d as Doc).Title), Doc);
        const a = new Doc(); a.Title = 'A';
        const b = new Doc(); b.Title = 'B';
        tc.ItemsSource = [a, b];
        layout(tc);
        tc.SelectedItem = a;

        const containerB = tc.logicalChildren[1] as TabItem;
        click(new InputManager(), containerB);

        assert.equal(tc.SelectedItem, b, 'clicking tab B selects its data row');
        assert.ok(containerB.IsSelected, 'the clicked tab reports IsSelected');
    });

    test('clicking back to the first tab switches selection again', () => {
        const tc = new TabControl();
        tc.ItemTemplate = new DataTemplate((d) => new TextBlock((d as Doc).Title), Doc);
        const a = new Doc(); a.Title = 'A';
        const b = new Doc(); b.Title = 'B';
        tc.ItemsSource = [a, b];
        layout(tc);
        tc.SelectedItem = b;

        const im = new InputManager();
        click(im, tc.logicalChildren[0] as TabItem);

        assert.equal(tc.SelectedItem, a, 'clicking tab A selects it');
    });
});
