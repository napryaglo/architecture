import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Model } from '../../../runtime/index.js';
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { TabControl, TabItem } from '../tabs.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { TextBlock } from '../../../basic/text-block.js';

// A minimal document-like data row.
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

describe('TabControl — data-driven (ItemsSource) path', () => {
    beforeEach(() => { initTestApp(); });

    test('SelectedItem exposes the DATA row (Tag), not the TabItem container', () => {
        const tc = new TabControl();
        tc.ItemTemplate = new DataTemplate((d) => new TextBlock((d as Doc).Title), Doc);
        const a = new Doc(); a.Title = 'A';
        const b = new Doc(); b.Title = 'B';
        tc.ItemsSource = [a, b];
        layout(tc);

        tc.SelectedItem = a;
        assert.equal(tc.SelectedItem, a, 'SelectedItem is the data row');
        assert.ok(!(tc.SelectedItem instanceof TabItem), 'not the container');
    });

    test('SelectedContent tracks the selected row so the content area can dispatch it', () => {
        const tc = new TabControl();
        tc.ItemTemplate = new DataTemplate((d) => new TextBlock((d as Doc).Title), Doc);
        const a = new Doc(); a.Title = 'A';
        const b = new Doc(); b.Title = 'B';
        tc.ItemsSource = [a, b];
        layout(tc);

        tc.SelectedItem = a;
        assert.equal(tc.SelectedContent, a, 'body payload is the selected row');
        tc.SelectedItem = b;
        assert.equal(tc.SelectedContent, b, 'body follows the selection');
    });

    test('each tab wraps in a TabItem whose header renders through ItemTemplate', () => {
        const headerTmpl = new DataTemplate((d) => new TextBlock((d as Doc).Title), Doc);
        const tc = new TabControl();
        tc.ItemTemplate = headerTmpl;
        const a = new Doc(); a.Title = 'A';
        tc.ItemsSource = [a];
        layout(tc);

        const container = tc.logicalChildren[0];
        assert.ok(container instanceof TabItem, 'row wrapped in a TabItem');
        assert.equal(container.Tag, a, 'Tag carries the data row');
        assert.equal(container.Header, a, 'Header is the data row (rendered via HeaderTemplate)');
        assert.equal(container.HeaderTemplate, headerTmpl, 'ItemTemplate copied onto the tab HeaderTemplate');
    });
});
