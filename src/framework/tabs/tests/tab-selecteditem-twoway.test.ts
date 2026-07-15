import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    Model, MetaData, PointerButton, NoModifiers,
    DataContextBinding,
    type PointerEventInit,
} from '../../../runtime/index.js';
import { HeadlessTarget, SvgDrawingContext } from '../../../visual-engine/index.js';
import { InputManager } from '../../index.js';
import { TabControl, TabItem } from '../tabs.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { TextBlock } from '../../../basic/text-block.js';
import { initTestApp } from '../../../basic/tests/test-app.js';

// Regression: clicking a tab must WRITE BACK through a TwoWay
// `SelectedItem=$ActiveDocument` binding to the bound source. tab-click-select
// proves the DP itself moves; this proves the DataContext source moves too —
// the exact Plexus shape (shell tab strip's SelectedItem TwoWay-bound to
// DocumentsContentHostService.ActiveDocument). If the write-back is missing,
// the highlight moves but the content region (driven by ActiveDocument) never
// switches — the reported symptom.

class Doc extends Model
{
    public static readonly TitleKey = Model.RegisterProperty<string>(Doc, 'Title', '', MetaData.None);
    public get Title(): string { return this.get_property_value(Doc.TitleKey); }
    public set Title(v: string) { this.set_property_value(Doc.TitleKey, v); }
}

// Stand-in for DocumentsContentHostService: holds the ActiveDocument the tab
// strip's SelectedItem is TwoWay-bound to.
class Shell extends Model
{
    public static readonly ActiveDocumentKey = Model.RegisterProperty<Doc | undefined>(
        Shell, 'ActiveDocument', undefined, MetaData.None);
    public get ActiveDocument(): Doc | undefined { return this.get_property_value(Shell.ActiveDocumentKey); }
    public set ActiveDocument(v: Doc | undefined) { this.set_property_value(Shell.ActiveDocumentKey, v); }
}

function pointer(o: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX: 0, HostY: 0, Button: PointerButton.Primary, Buttons: 1,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0, PointerType: 'mouse', ...o,
    };
}

function click(im: InputManager, container: TabItem): void
{
    im.InjectPointerMove(container, pointer());
    im.InjectPointerDown(container, pointer());
    im.InjectPointerUp(container, pointer());
}

describe('TabItem — click writes back through a TwoWay SelectedItem binding', () => {
    beforeEach(() => { initTestApp(); });

    test('clicking a tab updates the DataContext-bound ActiveDocument', () => {
        const shell = new Shell();
        const a = new Doc(); a.Title = 'A';
        const b = new Doc(); b.Title = 'B';
        shell.ActiveDocument = a;

        const tc = new TabControl();
        tc.ItemTemplate = new DataTemplate((d) => new TextBlock((d as Doc).Title), Doc);
        tc.ItemsSource = [a, b];
        // The shell tab strip's exact binding: SelectedItem=$ActiveDocument.
        // SelectedItem BindsTwoWayByDefault, so this is a TwoWay binding.
        tc.set_property_value(TabControl.SelectedItemKey, DataContextBinding(tc, 'ActiveDocument'));
        tc.DataContext = shell;

        const target = new HeadlessTarget(600, 400);
        target.Content = tc;
        target.Flush();

        // Source → target flowed on activation.
        assert.equal(tc.SelectedItem, a, 'binding seeds SelectedItem from ActiveDocument');

        const containerB = tc.logicalChildren[1] as TabItem;
        click(new InputManager(), containerB);

        // The write-back: target → source.
        assert.equal(tc.SelectedItem, b, 'clicking tab B moves SelectedItem');
        assert.equal(shell.ActiveDocument, b, 'clicking tab B writes back to the bound ActiveDocument');
    });

    test('clicking a tab swaps the rendered content slot (SelectedContent)', () => {
        const app = initTestApp();
        // The content slot (PART_ContentSlot) presents SelectedContent — the
        // selected data row — dispatched through its DataType template. Register
        // one that renders a distinct body marker per document (mirrors Plexus'
        // DataTemplate[DiagramDocument] → canvas).
        app.Resources.Set(Doc, new DataTemplate(
            (d) => new TextBlock('BODY:' + (d as Doc).Title), Doc));

        const a = new Doc(); a.Title = 'A';
        const b = new Doc(); b.Title = 'B';

        const tc = new TabControl();
        tc.ItemTemplate = new DataTemplate((d) => new TextBlock((d as Doc).Title), Doc);
        tc.ItemsSource = [a, b];

        const target = new HeadlessTarget(600, 400);
        target.Content = tc;
        target.Flush();
        tc.SelectedItem = a;
        target.Flush();

        const svgA = svgOf(target);
        assert.ok(svgA.includes('BODY:A'), 'content slot renders the selected doc body');

        const containerB = tc.logicalChildren[1] as TabItem;
        click(new InputManager(), containerB);
        target.Flush();

        const svgB = svgOf(target);
        assert.ok(svgB.includes('BODY:B'), 'clicking tab B swaps the content slot to B');
        assert.ok(!svgB.includes('BODY:A'), 'the previous body is gone');
    });
});

function svgOf(t: HeadlessTarget): string
{
    const dc = new SvgDrawingContext();
    t.Render(dc);
    return dc.ToSvg(600, 400);
}
