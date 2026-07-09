import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';

import { Border } from '../../basic/border.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { BottomAppBar } from '../bottom-app-bar/bottom-app-bar.js';

describe('BottomAppBar — template parts', () => {
    beforeEach(() => { initTestApp(); });

    test('Default template exposes PART_ActionsStack + PART_FabSlot', () => {
        const bar = new BottomAppBar();
        const root = bar.visualChildren[0];
        assert.ok(root !== undefined, 'template root should be present');
        assert.ok(root.FindName('PART_ActionsStack') instanceof StackPanel,
            'PART_ActionsStack should be a horizontal StackPanel');
        assert.ok(root.FindName('PART_FabSlot') instanceof Border,
            'PART_FabSlot should be a Border');
    });
});

describe('BottomAppBar — Actions collection + markup default slot', () => {
    beforeEach(() => { initTestApp(); });

    test('Actions auto-instantiates an empty ObservableCollection<Visual>', () => {
        const bar = new BottomAppBar();
        assert.ok(bar.Actions !== undefined, 'Actions should be auto-instantiated by the ctor');
        assert.equal(bar.Actions.Count, 0);
    });

    test('Actions.Add mirrors into PART_ActionsStack.visualChildren', () => {
        const bar = new BottomAppBar();
        const action = new Border();
        bar.Actions.Add(action);
        const stack = bar.visualChildren[0].FindName('PART_ActionsStack') as StackPanel;
        assert.equal(stack.visualChildren.length, 1);
        assert.equal(stack.visualChildren[0], action);
    });

    test('Actions.Remove pulls the visual out of PART_ActionsStack', () => {
        const bar = new BottomAppBar();
        const action = new Border();
        bar.Actions.Add(action);
        bar.Actions.Remove(action);
        const stack = bar.visualChildren[0].FindName('PART_ActionsStack') as StackPanel;
        assert.equal(stack.visualChildren.length, 0);
    });

    test('AddChild routes the markup body child into Actions', () => {
        const bar = new BottomAppBar();
        const action = new Border();
        bar.AddChild(action);
        assert.equal(bar.Actions.Count, 1);
        assert.equal(bar.Actions.Get(0), action);
        const stack = bar.visualChildren[0].FindName('PART_ActionsStack') as StackPanel;
        assert.equal(stack.visualChildren[0], action);
    });
});

describe('BottomAppBar — FloatingAction DP', () => {
    beforeEach(() => { initTestApp(); });

    test('FloatingAction default is undefined; slot starts empty', () => {
        const bar = new BottomAppBar();
        assert.equal(bar.FloatingAction, undefined);
        const slot = bar.visualChildren[0].FindName('PART_FabSlot') as Border;
        assert.equal(slot.child, undefined);
    });

    test('Setting FloatingAction slots the visual into PART_FabSlot', () => {
        const bar = new BottomAppBar();
        const fab = new Border();
        bar.FloatingAction = fab;
        const slot = bar.visualChildren[0].FindName('PART_FabSlot') as Border;
        assert.equal(slot.child, fab);
    });

    test('Clearing FloatingAction detaches the previous child', () => {
        const bar = new BottomAppBar();
        const fab = new Border();
        bar.FloatingAction = fab;
        bar.FloatingAction = undefined;
        const slot = bar.visualChildren[0].FindName('PART_FabSlot') as Border;
        assert.equal(slot.child, undefined);
    });
});
