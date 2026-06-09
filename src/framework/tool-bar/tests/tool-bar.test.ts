import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application, RelayCommand, Size } from '../../../runtime/index.js';
import { ToolBar, ToolBarPanel } from '../tool-bar.js';
import { ToolBarButton, ToolBarSeparator } from '../tool-bar-items.js';

describe('ToolBar — items + overflow', () => {
    beforeEach(() => { Application.current = null; });

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
