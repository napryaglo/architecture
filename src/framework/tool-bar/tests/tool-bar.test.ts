import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { Application, RelayCommand, Size, Visual } from '../../../runtime/index.js';
import { ToolBar, ToolBarPanel } from '../tool-bar.js';
import { ToolBarButton, ToolBarSeparator, ToolBarPosition } from '../tool-bar-items.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { Border } from '../../../basic/border.js';
import { HeadlessTarget } from '../../../visual-engine/index.js';

describe('ToolBar — items + overflow', () => {
    beforeEach(() => { initTestApp(); });

    test('ToolBar instantiates with an empty Items collection', () => {
        const tb = new ToolBar();
        const items = tb.Items;
        const count = items === undefined
            ? 0
            : Array.isArray(items) ? items.length : (items as { Count: number }).Count;
        assert.equal(count, 0);
    });

    test('HasOverflowItems defaults to false', () => {
        const tb = new ToolBar();
        assert.equal(tb.HasOverflowItems, false);
    });

    test('IsOverflowOpen toggles via DP', () => {
        const tb = new ToolBar();
        assert.equal(tb.IsOverflowOpen, false);
        tb.IsOverflowOpen = true;
        assert.equal(tb.IsOverflowOpen, true);
        tb.IsOverflowOpen = false;
        assert.equal(tb.IsOverflowOpen, false);
    });

    test('ToolBarButton.create populates Icon + Content + Command', () => {
        let executed = 0;
        const btn = ToolBarButton.create({
            icon: '💾',
            text: 'Save',
            showText: true,
            command: new RelayCommand(() => { executed++; }),
        });
        assert.ok(btn instanceof ToolBarButton);
        assert.ok(btn.Icon !== undefined);
        assert.ok(btn.Content !== undefined);
        assert.equal(btn.ShowText, true);
        // Command is wired but not invoked by create itself.
        assert.equal(executed, 0);
    });

    test('ToolBarButton flips Icon / Text / ShowText dynamically — Content re-stacks', () => {
        const btn = ToolBarButton.create({ icon: '💾', text: 'Save', showText: true });
        const stack0 = btn.Content;
        assert.ok(stack0 !== undefined);
        // Same stack instance is reused across rebuilds so the Icon
        // Visual's single-parent invariant holds.
        btn.ShowText = false;
        assert.equal(btn.Content, stack0, 'reused stack survives ShowText flip');
        btn.Text = 'Save As';
        assert.equal(btn.Content, stack0, 'reused stack survives Text flip');
        // Flipping Icon to undefined removes it from the stack; the
        // label still renders because showText would re-enable display
        // (toggle it on again for the next assertion).
        btn.ShowText = true;
        btn.Icon = undefined;
        assert.equal(btn.Content, stack0, 'reused stack survives Icon clear');
    });

    test('ToolBarSeparator measures to its Width + the available height', () => {
        const sep = new ToolBarSeparator();
        sep.Measure(new Size(100, 24));
        const ds = sep.DesiredSize;
        assert.equal(ds.Width, 9);
        assert.equal(ds.Height, 24);
    });
});

describe('ToolBarPanel — overflow math', () => {
    test('LastFittingIndex = -1 with no children', () => {
        const p = new ToolBarPanel();
        p.Measure(new Size(100, 24));
        // No children, no fit/no overflow — index defaults to -1 (no items).
        assert.equal(p.LastFittingIndex, -1);
    });

    test('All items fit within budget — LastFittingIndex = count - 1', () => {
        // Three 30-wide children inside a 200-wide budget → all fit.
        const p = new ToolBarPanel();
        for (let i = 0; i < 3; i++)
        {
            const sep = new ToolBarSeparator();
            sep.Width = 30;
            p.AddChild(sep);
        }
        p.Measure(new Size(200, 24));
        assert.equal(p.LastFittingIndex, 2);
    });

    test('Tight budget — last items overflow', () => {
        // Five 30-wide children in 100-wide budget → only 3 fit
        // (3*30 = 90 ≤ 100; adding the 4th would be 120 > 100).
        const p = new ToolBarPanel();
        for (let i = 0; i < 5; i++)
        {
            const sep = new ToolBarSeparator();
            sep.Width = 30;
            p.AddChild(sep);
        }
        p.Measure(new Size(100, 24));
        assert.equal(p.LastFittingIndex, 2);
    });
});

describe('ToolBar — data-driven (ItemsSource + ItemTemplate)', () => {
    beforeEach(() => { initTestApp(); });

    function collect(root: Visual, name: string): Visual[] {
        const out: Visual[] = [];
        const walk = (v: Visual): void => {
            if (v.constructor.name === name) out.push(v);
            for (const k of (v as unknown as { visualChildren: Iterable<Visual> }).visualChildren) walk(k);
        };
        walk(root);
        return out;
    }

    // Regression: with ItemsSource bound, ItemsControl.Items is a
    // CollectionView (Count + Get), NOT an ObservableCollection. The panel
    // used to gate item access on `instanceof ObservableCollection`, so a
    // CollectionView was read as an array (.length = undefined), the
    // overflow math counted 0 items, and the whole strip collapsed to its
    // padding width — every data-driven ToolBarButton arranged at 0×0.
    test('data items get real widths — the strip does not collapse to 0', () => {
        const tb = new ToolBar();
        tb.ItemTemplate = new DataTemplate(() => {
            const btn = new ToolBarButton();
            const icon = new Border();
            icon.Width = 20;
            icon.Height = 20;
            btn.Content = icon;
            return btn;
        });
        tb.ItemsSource = [{ id: 1 }, { id: 2 }, { id: 3 }];

        const target = new HeadlessTarget(600, 80, tb);
        target.Flush();

        const panels  = collect(tb, 'ToolBarPanel');
        const buttons = collect(tb, 'ToolBarButton') as ToolBarButton[];
        assert.equal(buttons.length, 3, 'three data items generated three ToolBarButtons');
        assert.ok(panels[0]!.ArrangedRect.Width > 0,
            `ToolBarPanel kept a real width (got ${panels[0]!.ArrangedRect.Width})`);
        assert.ok(buttons.every(b => b.ArrangedRect.Width > 0),
            'every data-driven button arranged with a real width, not 0×0');
    });

    // Regression: connected-bar corner rounding. The ToolBar rewrites each
    // inline button's Position DP (First/Middle/Last/Only) so the strip
    // reads as one pill-shaped group. For data-driven items the buttons
    // are nested in generated containers, so the Position scan has to
    // unwrap them — otherwise every button stays Position=None (square
    // corners), visibly different from a declaratively-authored ToolBar.
    test('data-driven buttons still get connected-bar Positions', () => {
        const tb = new ToolBar();
        tb.ItemTemplate = new DataTemplate(() => {
            const btn = new ToolBarButton();
            const icon = new Border();
            icon.Width = 20; icon.Height = 20;
            btn.Content = icon;
            return btn;
        });
        tb.ItemsSource = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const target = new HeadlessTarget(600, 80, tb);
        target.Flush();

        const buttons = collect(tb, 'ToolBarButton') as ToolBarButton[];
        assert.equal(buttons.length, 3);
        // First / Middle / Last across the three-button group.
        assert.equal(buttons[0]!.Position, ToolBarPosition.First,  'first button rounds its left');
        assert.equal(buttons[1]!.Position, ToolBarPosition.Middle, 'interior button is square');
        assert.equal(buttons[2]!.Position, ToolBarPosition.Last,   'last button rounds its right');
    });
});
