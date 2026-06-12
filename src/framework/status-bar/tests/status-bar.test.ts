import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { Size } from '../../../runtime/index.js';
import { StatusBar, StatusBarItem, StatusBarSeparator } from '../status-bar.js';
import { TextBlock } from '../../../basic/text-block.js';

describe('StatusBar — items + container wrapping', () => {
    beforeEach(() => { initTestApp(); });

    test('instantiates with an empty Items collection', () => {
        const sb = new StatusBar();
        const items = sb.Items;
        const count = items === undefined
            ? 0
            : Array.isArray(items) ? items.length : (items as { Count: number }).Count;
        assert.equal(count, 0);
    });

    test('pre-built StatusBarItem is its own container (composed markup)', () => {
        const sb = new StatusBar();
        assert.equal(sb.IsItemItsOwnContainerOverride(new StatusBarItem()), true);
    });

    test('pre-built StatusBarSeparator is its own container', () => {
        const sb = new StatusBar();
        assert.equal(sb.IsItemItsOwnContainerOverride(new StatusBarSeparator()), true);
    });

    test('plain string / Visual is NOT its own container — gets wrapped', () => {
        const sb = new StatusBar();
        assert.equal(sb.IsItemItsOwnContainerOverride('Ready.'), false);
        assert.equal(sb.IsItemItsOwnContainerOverride(new TextBlock('Ready.')), false);
    });

    test('GetContainerForItemOverride returns a StatusBarItem with Content set', () => {
        const sb = new StatusBar();
        const label = new TextBlock('Ready.');
        const container = sb.GetContainerForItemOverride(label);
        assert.ok(container instanceof StatusBarItem);
        assert.equal((container as StatusBarItem).Content, label);
    });

    test('AddChild accepts StatusBarItem + StatusBarSeparator (composed markup path)', () => {
        const sb = new StatusBar();
        sb.AddChild(new StatusBarItem());
        sb.AddChild(new StatusBarSeparator());
        const items = sb.Items as { Count: number };
        assert.equal(items.Count, 2);
    });

    test('AddChild rejects arbitrary Visuals', () => {
        const sb = new StatusBar();
        assert.throws(
            () => sb.AddChild(new TextBlock('nope')),
            /StatusBar only accepts StatusBarItem/,
        );
    });
});

describe('StatusBarSeparator — measure / render', () => {
    beforeEach(() => { initTestApp(); });

    test('measures to its Style-supplied Width + MinHeight (not the available height)', () => {
        // Reporting the available height back would inflate the hosting
        // StatusBar's DesiredHeight, which the outer DockPanel would
        // then stretch the StatusBar across — see comment on
        // StatusBarSeparator.MeasureOverride for the regression motive.
        const sep = new StatusBarSeparator();
        sep.Measure(new Size(100, 580));
        const ds = sep.DesiredSize;
        assert.equal(ds.Width, 9);
        assert.equal(ds.Height, 16);
    });
});

describe('StatusBarItem — content slot', () => {
    beforeEach(() => { initTestApp(); });

    test('Content DP round-trips a Visual', () => {
        const sbi = new StatusBarItem();
        const tb = new TextBlock('99%');
        sbi.Content = tb;
        assert.equal(sbi.Content, tb);
    });
});
