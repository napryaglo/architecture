import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';

import { Border } from '../../basic/border.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { TextBlock } from '../../basic/text-block.js';
import { TopAppBar, TopAppBarVariant } from '../top-app-bar/top-app-bar.js';

describe('TopAppBar — Variant DP', () => {
    beforeEach(() => { initTestApp(); });

    test('Variant default is Small', () => {
        const bar = new TopAppBar();
        assert.equal(bar.Variant, TopAppBarVariant.Small);
    });

    test('Variant is a settable, get-roundtrips DP', () => {
        const bar = new TopAppBar();
        bar.Variant = TopAppBarVariant.CenterAligned;
        assert.equal(bar.Variant, TopAppBarVariant.CenterAligned);
        bar.Variant = TopAppBarVariant.Medium;
        assert.equal(bar.Variant, TopAppBarVariant.Medium);
        bar.Variant = TopAppBarVariant.Large;
        assert.equal(bar.Variant, TopAppBarVariant.Large);
    });
});

describe('TopAppBar — template parts', () => {
    beforeEach(() => { initTestApp(); });

    test('Default (Small) template exposes PART_NavSlot, PART_TitleText, PART_ActionsStack', () => {
        const bar = new TopAppBar();
        const root = bar.visualChildren[0];
        assert.ok(root !== undefined, 'template root should be present');
        assert.ok(root.FindName('PART_NavSlot')      instanceof Border,
            'PART_NavSlot should be a Border');
        assert.ok(root.FindName('PART_TitleText')    instanceof TextBlock,
            'PART_TitleText should be a TextBlock');
        assert.ok(root.FindName('PART_ActionsStack') instanceof StackPanel,
            'PART_ActionsStack should be a horizontal StackPanel');
    });

    test('Each Variant template carries the same three named parts', () => {
        for (const v of [TopAppBarVariant.Small, TopAppBarVariant.CenterAligned,
                         TopAppBarVariant.Medium, TopAppBarVariant.Large]) {
            const bar = new TopAppBar();
            bar.Variant = v;
            const root = bar.visualChildren[0];
            assert.ok(root !== undefined, `[${v}] template root should be present`);
            assert.ok(root.FindName('PART_NavSlot')      !== undefined,
                `[${v}] PART_NavSlot should be present`);
            assert.ok(root.FindName('PART_TitleText')    !== undefined,
                `[${v}] PART_TitleText should be present`);
            assert.ok(root.FindName('PART_ActionsStack') !== undefined,
                `[${v}] PART_ActionsStack should be present`);
        }
    });
});

describe('TopAppBar — Title DP', () => {
    beforeEach(() => { initTestApp(); });

    test('Title default is the empty string', () => {
        const bar = new TopAppBar();
        assert.equal(bar.Title, '');
        const titleText = bar.visualChildren[0].FindName('PART_TitleText') as TextBlock;
        assert.equal(titleText.Text, '');
    });

    test('Title setter pumps into PART_TitleText.Text', () => {
        const bar = new TopAppBar();
        bar.Title = 'µ-mural demos';
        const titleText = bar.visualChildren[0].FindName('PART_TitleText') as TextBlock;
        assert.equal(titleText.Text, 'µ-mural demos');
    });

    test('Title survives a Variant swap and lands in the new template part', () => {
        const bar = new TopAppBar();
        bar.Title = 'Header';
        bar.Variant = TopAppBarVariant.Large;
        const titleText = bar.visualChildren[0].FindName('PART_TitleText') as TextBlock;
        assert.equal(titleText.Text, 'Header',
            'after Variant swap the Title should re-sync into the freshly-stamped PART_TitleText');
    });
});

describe('TopAppBar — NavigationIcon DP', () => {
    beforeEach(() => { initTestApp(); });

    test('Setting NavigationIcon slots the visual into PART_NavSlot', () => {
        const bar = new TopAppBar();
        const glyph = new TextBlock('☰');
        bar.NavigationIcon = glyph;
        const navSlot = bar.visualChildren[0].FindName('PART_NavSlot') as Border;
        assert.equal(navSlot.child, glyph);
    });

    test('Clearing NavigationIcon detaches the previous child', () => {
        const bar = new TopAppBar();
        const glyph = new TextBlock('☰');
        bar.NavigationIcon = glyph;
        bar.NavigationIcon = undefined;
        const navSlot = bar.visualChildren[0].FindName('PART_NavSlot') as Border;
        assert.equal(navSlot.child, undefined);
    });

    test('NavigationIcon survives a Variant swap', () => {
        const bar = new TopAppBar();
        const glyph = new TextBlock('☰');
        bar.NavigationIcon = glyph;
        bar.Variant = TopAppBarVariant.CenterAligned;
        const navSlot = bar.visualChildren[0].FindName('PART_NavSlot') as Border;
        assert.equal(navSlot.child, glyph,
            'after Variant swap the NavigationIcon should re-slot into the new PART_NavSlot');
    });
});

describe('TopAppBar — Actions collection + markup default slot', () => {
    beforeEach(() => { initTestApp(); });

    test('Actions auto-instantiates an empty ObservableCollection<Visual>', () => {
        const bar = new TopAppBar();
        assert.ok(bar.Actions !== undefined, 'Actions should be auto-instantiated by the ctor');
        assert.equal(bar.Actions.Count, 0);
    });

    test('Actions.Add mirrors into PART_ActionsStack.visualChildren', () => {
        const bar = new TopAppBar();
        const action = new TextBlock('⋯');
        bar.Actions.Add(action);
        const stack = bar.visualChildren[0].FindName('PART_ActionsStack') as StackPanel;
        assert.equal(stack.visualChildren.length, 1);
        assert.equal(stack.visualChildren[0], action);
    });

    test('Actions.Remove pulls the visual out of PART_ActionsStack', () => {
        const bar = new TopAppBar();
        const action = new TextBlock('⋯');
        bar.Actions.Add(action);
        bar.Actions.Remove(action);
        const stack = bar.visualChildren[0].FindName('PART_ActionsStack') as StackPanel;
        assert.equal(stack.visualChildren.length, 0);
    });

    test('AddChild routes the markup body child into Actions', () => {
        const bar = new TopAppBar();
        const action = new TextBlock('⋯');
        bar.AddChild(action);
        assert.equal(bar.Actions.Count, 1);
        assert.equal(bar.Actions.Get(0), action);
        // And mirrored into the visual stack via the Subscribe listener.
        const stack = bar.visualChildren[0].FindName('PART_ActionsStack') as StackPanel;
        assert.equal(stack.visualChildren[0], action);
    });

    test('Existing Actions survive a Variant swap', () => {
        const bar = new TopAppBar();
        const action = new TextBlock('⋯');
        bar.Actions.Add(action);
        bar.Variant = TopAppBarVariant.Medium;
        const stack = bar.visualChildren[0].FindName('PART_ActionsStack') as StackPanel;
        assert.equal(stack.visualChildren.length, 1,
            'after Variant swap the action should re-mirror into the freshly-stamped PART_ActionsStack');
        assert.equal(stack.visualChildren[0], action);
    });
});
