import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application } from '../../runtime/index.js';
import { ListBox, ListBoxItem } from '../list-box.js';
import { Border } from '../border.js';

describe('ListBox selection survives container recycle by data identity', () => {
    beforeEach(() => { Application.current = null; });

    test('recycled container picks up new item selection from _selectedData', () => {
        const lb = new ListBox();
        lb.Items = ['A', 'B', 'C', 'D'];
        lb.SelectedItem = 'B';

        const containerB = lb.Generator.ContainerFromItem('B') as ListBoxItem;
        assert.ok(containerB instanceof ListBoxItem);
        assert.equal(containerB.IsSelected, true);

        lb.Generator.Recycle(containerB);
        const recycled = lb.Generator.ClaimRecycled() as ListBoxItem;
        lb.RebindContainerForItemOverride(recycled, 'D');
        assert.equal(recycled.IsSelected, false,
            'recycled container should not carry the previous row\'s IsSelected');
    });

    test('recycled container picks up TRUE when reused for a previously selected item', () => {
        const lb = new ListBox();
        lb.Items = ['A', 'B', 'C', 'D'];
        lb.SelectedItem = 'B';

        const containerB = lb.Generator.ContainerFromItem('B') as ListBoxItem;
        lb.Generator.Recycle(containerB);
        const recycled = lb.Generator.ClaimRecycled() as ListBoxItem;
        lb.RebindContainerForItemOverride(recycled, 'B');
        assert.equal(recycled.IsSelected, true);
    });

    test('PART_Border.Background clears on rebind to a non-selected item (chrome end-to-end)', () => {
        const lb = new ListBox();
        lb.Items = ['A', 'B', 'C', 'D'];
        lb.SelectedItem = 'B';

        const containerB = lb.Generator.ContainerFromItem('B') as ListBoxItem;
        // Resolve PART_Border via the template root's namescope.
        // Default template wraps content in a PART_Border the
        // IsSelected trigger writes Background on.
        const root = containerB.visualChildren[0]!;
        const partBorder = root.FindName('PART_Border') as Border | undefined;
        assert.ok(partBorder instanceof Border,
            'PART_Border must be findable in the templated row');
        // While selected, the IsSelected trigger writes light-blue
        // Background. Snapshot it so we can verify it clears after
        // rebind.
        const selectedBg = partBorder.Background;
        assert.ok(selectedBg !== undefined,
            'selected row should have a non-undefined background from the trigger');

        lb.Generator.Recycle(containerB);
        const recycled = lb.Generator.ClaimRecycled() as ListBoxItem;
        lb.RebindContainerForItemOverride(recycled, 'D');
        assert.equal(recycled.IsSelected, false);
        const partBorderAfter = recycled.visualChildren[0]!.FindName('PART_Border') as Border | undefined;
        assert.ok(partBorderAfter instanceof Border);
        assert.equal(partBorderAfter.Background, undefined,
            'after rebind to a non-selected item the chrome background should clear');
    });
});
