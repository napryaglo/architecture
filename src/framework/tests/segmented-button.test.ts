import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { ModifierKeys } from '../../runtime/index.js';
import {
    SegmentedButton,
    SegmentedItem,
    SegmentedPosition,
} from '../segmented-button.js';
import { SelectionMode, Selector } from '../list/selector.js';
import { TextBlock } from '../../basic/text-block.js';

const NoMods: ModifierKeys = { Ctrl: false, Shift: false, Alt: false, Meta: false };

describe('SegmentedButton defaults', () => {

    test('SelectionMode = Single by default (M3 single-select variant)', () => {
        initTestApp();
        const sb = new SegmentedButton();
        assert.equal(sb.SelectionMode, SelectionMode.Single);
    });
});

describe('SegmentedButton Position assignment', () => {

    test('1 item → Single', () => {
        initTestApp();
        const sb = new SegmentedButton();
        sb.Items = ['A'];
        const containers = (sb as unknown as { logicalChildren: SegmentedItem[] }).logicalChildren;
        assert.equal(containers[0]!.Position, SegmentedPosition.Single);
    });

    test('3 items → Start / Middle / End', () => {
        initTestApp();
        const sb = new SegmentedButton();
        sb.Items = ['A', 'B', 'C'];
        const cs = (sb as unknown as { logicalChildren: SegmentedItem[] }).logicalChildren;
        assert.equal(cs[0]!.Position, SegmentedPosition.Start);
        assert.equal(cs[1]!.Position, SegmentedPosition.Middle);
        assert.equal(cs[2]!.Position, SegmentedPosition.End);
    });

    test('2 items → Start / End (no Middle)', () => {
        initTestApp();
        const sb = new SegmentedButton();
        sb.Items = ['A', 'B'];
        const cs = (sb as unknown as { logicalChildren: SegmentedItem[] }).logicalChildren;
        assert.equal(cs[0]!.Position, SegmentedPosition.Start);
        assert.equal(cs[1]!.Position, SegmentedPosition.End);
    });

    test('5 items → Start / Middle × 3 / End', () => {
        initTestApp();
        const sb = new SegmentedButton();
        sb.Items = ['A', 'B', 'C', 'D', 'E'];
        const cs = (sb as unknown as { logicalChildren: SegmentedItem[] }).logicalChildren;
        assert.equal(cs[0]!.Position, SegmentedPosition.Start);
        assert.equal(cs[1]!.Position, SegmentedPosition.Middle);
        assert.equal(cs[2]!.Position, SegmentedPosition.Middle);
        assert.equal(cs[3]!.Position, SegmentedPosition.Middle);
        assert.equal(cs[4]!.Position, SegmentedPosition.End);
    });
});

describe('SegmentedButton item generation', () => {

    test('raw string items get wrapped in TextBlock-content SegmentedItems', () => {
        initTestApp();
        const sb = new SegmentedButton();
        sb.Items = ['Day', 'Week', 'Month'];
        const cs = (sb as unknown as { logicalChildren: SegmentedItem[] }).logicalChildren;
        assert.equal(cs.length, 3);
        for (const c of cs)
        {
            assert.ok(c instanceof SegmentedItem);
            assert.ok(c.Content instanceof TextBlock);
        }
        assert.equal((cs[0]!.Content as TextBlock).Text, 'Day');
        assert.equal((cs[1]!.Content as TextBlock).Text, 'Week');
    });

    test('pre-built SegmentedItem instances pass through unchanged', () => {
        initTestApp();
        const sb = new SegmentedButton();
        const a = new SegmentedItem('A');
        const b = new SegmentedItem('B');
        sb.Items = [a, b];
        const cs = (sb as unknown as { logicalChildren: SegmentedItem[] }).logicalChildren;
        assert.equal(cs[0], a);
        assert.equal(cs[1], b);
    });
});

describe('SegmentedButton selection — Single mode', () => {

    test('clicking a segment selects it and clears prior selection', () => {
        initTestApp();
        const sb = new SegmentedButton();
        const a = new SegmentedItem('A');
        const b = new SegmentedItem('B');
        sb.Items = [a, b];

        // Drive selection through HandleContainerClick rather than
        // raw pointer events — same path the per-item click listener
        // hits at runtime.
        sb.HandleContainerClick(a, NoMods);
        assert.equal(a.IsSelected, true);
        assert.equal(b.IsSelected, false);

        sb.HandleContainerClick(b, NoMods);
        assert.equal(a.IsSelected, false, 'selecting b clears a');
        assert.equal(b.IsSelected, true);
    });
});

describe('SegmentedButton selection — Multiple mode', () => {

    test('clicking multiple segments toggles each independently', () => {
        initTestApp();
        const sb = new SegmentedButton();
        sb.SelectionMode = SelectionMode.Multiple;
        const a = new SegmentedItem('A');
        const b = new SegmentedItem('B');
        const c = new SegmentedItem('C');
        sb.Items = [a, b, c];

        sb.HandleContainerClick(a, NoMods);
        sb.HandleContainerClick(c, NoMods);
        assert.equal(a.IsSelected, true);
        assert.equal(b.IsSelected, false);
        assert.equal(c.IsSelected, true);

        sb.HandleContainerClick(a, NoMods);
        assert.equal(a.IsSelected, false, 'second click on a clears it');
        assert.equal(c.IsSelected, true);
    });
});

describe('SegmentedItem IsSelected mirror', () => {

    test('attached Selector.IsSelected mirrors into instance DP', () => {
        initTestApp();
        const item = new SegmentedItem('A');
        Selector.SetIsSelected(item, true);
        assert.equal(item.IsSelected, true);
        Selector.SetIsSelected(item, false);
        assert.equal(item.IsSelected, false);
    });

    test('setting instance IsSelected mirrors to attached', () => {
        initTestApp();
        const item = new SegmentedItem('A');
        item.IsSelected = true;
        // Read through the attached-DP getter on Selector to confirm.
        const attached = (Selector as unknown as { GetIsSelected(v: SegmentedItem): boolean }).GetIsSelected;
        if (typeof attached === 'function')
        {
            assert.equal(attached.call(Selector, item), true);
        }
    });
});
