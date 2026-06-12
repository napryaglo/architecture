import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';

import { Border } from '../../basic/border.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { TextBlock } from '../../basic/text-block.js';
import { NavigationBar }  from '../navigation/navigation-bar.js';
import { NavigationItem } from '../navigation/navigation-item.js';
import { NavigationRail } from '../navigation/navigation-rail.js';
import { Selector } from '../list/selector.js';

describe('NavigationItem — DP shape', () => {
    beforeEach(() => { initTestApp(); });

    test('Icon / Label default to undefined / empty', () => {
        const ni = new NavigationItem();
        assert.equal(ni.Icon, undefined);
        assert.equal(ni.Label, '');
    });

    test('Label setter pumps into PART_LabelText.Text', () => {
        const ni = new NavigationItem();
        ni.Label = 'Home';
        const root = ni.visualChildren[0];
        const label = root.FindName('PART_LabelText') as TextBlock;
        assert.equal(label.Text, 'Home');
    });

    test('Icon setter slots into PART_IconSlot', () => {
        const ni = new NavigationItem();
        const glyph = new TextBlock('★');
        ni.Icon = glyph;
        // PART_IconSlot is a ContentPresenter; the slotted Visual is its
        // single visual child.
        const root = ni.visualChildren[0];
        const slot = root.FindName('PART_IconSlot');
        assert.ok(slot !== undefined);
        assert.equal(slot.visualChildren[0], glyph);
    });

    test('IsSelected mirrors Selector.IsSelected attached DP', () => {
        const ni = new NavigationItem();
        ni.IsSelected = true;
        assert.equal(Selector.GetIsSelected(ni), true);
        ni.IsSelected = false;
        assert.equal(Selector.GetIsSelected(ni), false);
    });
});

describe('NavigationRail — items + selection', () => {
    beforeEach(() => { initTestApp(); });

    test('Composed markup path: nested NavigationItems land in Items', () => {
        const rail = new NavigationRail();
        const a = new NavigationItem(); a.Label = 'Home';
        const b = new NavigationItem(); b.Label = 'Search';
        rail.AddChild(a);
        rail.AddChild(b);
        assert.equal(rail.Items.Count, 2);
        assert.equal(rail.Items.Get(0), a);
        assert.equal(rail.Items.Get(1), b);
    });

    test('Data-driven path: string items get wrapped in NavigationItem containers with Label', () => {
        const rail = new NavigationRail();
        rail.Items.Add('Home');
        rail.Items.Add('Search');
        const containers = rail.logicalChildren as readonly NavigationItem[];
        assert.equal(containers.length, 2);
        assert.ok(containers[0] instanceof NavigationItem);
        assert.equal(containers[0].Label, 'Home');
        assert.equal(containers[1].Label, 'Search');
    });

    test('Setting SelectedIndex flips IsSelected on the container', () => {
        const rail = new NavigationRail();
        const a = new NavigationItem(); a.Label = 'Home';
        const b = new NavigationItem(); b.Label = 'Search';
        rail.AddChild(a);
        rail.AddChild(b);
        rail.SelectedIndex = 1;
        assert.equal(a.IsSelected, false);
        assert.equal(b.IsSelected, true);
    });

    test('Header / Footer DPs slot into PART_HeaderSlot / PART_FooterSlot', () => {
        const rail = new NavigationRail();
        const header = new TextBlock('H');
        const footer = new TextBlock('F');
        rail.Header = header;
        rail.Footer = footer;
        const root = rail.visualChildren[0];
        const headerSlot = root.FindName('PART_HeaderSlot');
        const footerSlot = root.FindName('PART_FooterSlot');
        assert.equal(headerSlot.visualChildren[0], header);
        assert.equal(footerSlot.visualChildren[0], footer);
    });
});

describe('NavigationBar — items + selection', () => {
    beforeEach(() => { initTestApp(); });

    test('Composed markup path: nested NavigationItems land in Items', () => {
        const bar = new NavigationBar();
        const a = new NavigationItem(); a.Label = 'Home';
        const b = new NavigationItem(); b.Label = 'Search';
        const c = new NavigationItem(); c.Label = 'Library';
        bar.AddChild(a);
        bar.AddChild(b);
        bar.AddChild(c);
        assert.equal(bar.Items.Count, 3);
        assert.equal(bar.Items.Get(2), c);
    });

    test('SelectedIndex flips IsSelected (same Selector base as Rail)', () => {
        const bar = new NavigationBar();
        const a = new NavigationItem(); a.Label = 'Home';
        const b = new NavigationItem(); b.Label = 'Search';
        bar.AddChild(a);
        bar.AddChild(b);
        bar.SelectedIndex = 0;
        assert.equal(a.IsSelected, true);
        assert.equal(b.IsSelected, false);
    });
});
