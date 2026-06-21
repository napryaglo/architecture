import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { RadioButton } from '../toggles/radio-button.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';

// RadioButton's chrome is just template + ToggleButton wiring (covered
// indirectly by toggle-button tests). The novel surface is the
// GroupName mutual-exclusion contract — checking one radio in a group
// clears the others. These tests pin that down.
describe('RadioButton GroupName exclusivity', () => {

    test('checking one radio clears the prior selection in the same group', () => {
        initTestApp();
        const root = new StackPanel();
        const a = new RadioButton(); a.GroupName = 'g1';
        const b = new RadioButton(); b.GroupName = 'g1';
        const c = new RadioButton(); c.GroupName = 'g1';
        root.AddChild(a); root.AddChild(b); root.AddChild(c);

        a.IsChecked = true;
        assert.equal(a.IsChecked, true);
        assert.equal(b.IsChecked, false);
        assert.equal(c.IsChecked, false);

        b.IsChecked = true;
        assert.equal(a.IsChecked, false, 'checking b clears a');
        assert.equal(b.IsChecked, true);
        assert.equal(c.IsChecked, false);

        c.IsChecked = true;
        assert.equal(a.IsChecked, false);
        assert.equal(b.IsChecked, false, 'checking c clears b');
        assert.equal(c.IsChecked, true);
    });

    test('radios in different groups are independent', () => {
        initTestApp();
        const root = new StackPanel();
        const a = new RadioButton(); a.GroupName = 'g1';
        const b = new RadioButton(); b.GroupName = 'g2';
        root.AddChild(a); root.AddChild(b);

        a.IsChecked = true;
        b.IsChecked = true;
        assert.equal(a.IsChecked, true,
            'b lives in a separate group — checking it leaves a alone');
        assert.equal(b.IsChecked, true);
    });

    test('empty GroupName disables exclusivity (acts as plain toggle)', () => {
        initTestApp();
        const root = new StackPanel();
        const a = new RadioButton();
        const b = new RadioButton();
        root.AddChild(a); root.AddChild(b);

        a.IsChecked = true;
        b.IsChecked = true;
        assert.equal(a.IsChecked, true,
            'no GroupName = no group = no broadcast');
        assert.equal(b.IsChecked, true);
    });

    test('clearing a radio does NOT broadcast (only the rising edge does)', () => {
        initTestApp();
        const root = new StackPanel();
        const a = new RadioButton(); a.GroupName = 'g1';
        const b = new RadioButton(); b.GroupName = 'g1';
        root.AddChild(a); root.AddChild(b);

        a.IsChecked = true;
        b.IsChecked = true;
        assert.equal(a.IsChecked, false, 'b set true cleared a');
        assert.equal(b.IsChecked, true);

        // Clearing b doesn't restore a — radios don't memorise prior
        // selection. WPF parity: unchecking a radio leaves the group
        // with zero members; the next user click picks the new one.
        b.IsChecked = false;
        assert.equal(a.IsChecked, false);
        assert.equal(b.IsChecked, false);
    });

    test('mutual exclusion crosses nested visual containers', () => {
        initTestApp();
        const root  = new StackPanel();
        const left  = new StackPanel();
        const right = new StackPanel();
        const a = new RadioButton(); a.GroupName = 'g1';
        const b = new RadioButton(); b.GroupName = 'g1';
        left.AddChild(a);
        right.AddChild(b);
        root.AddChild(left);
        root.AddChild(right);

        a.IsChecked = true;
        b.IsChecked = true;
        assert.equal(a.IsChecked, false,
            'broadcast walks the whole visual tree, not just a direct sibling row');
        assert.equal(b.IsChecked, true);
    });
});
