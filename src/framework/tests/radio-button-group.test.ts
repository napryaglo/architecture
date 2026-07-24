import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { Model, ModifierKeys } from '../../runtime/index.js';
import { RadioButtonGroup, RadioButtonItem } from '../toggles/radio-button-group.js';
import { SelectionMode, Selector } from '../list/selector.js';
import { TextBlock } from '../../basic/text-block.js';

const NoMods: ModifierKeys = { Ctrl: false, Shift: false, Alt: false, Meta: false };

// Reach the realised container list the same way the SegmentedButton
// tests do — logicalChildren holds the per-item RadioButtonItem rows.
function rows(g: RadioButtonGroup): RadioButtonItem[]
{
    return (g as unknown as { logicalChildren: RadioButtonItem[] }).logicalChildren;
}

describe('RadioButtonGroup defaults', () => {

    test('SelectionMode = Single (a radio group is single-select)', () => {
        initTestApp();
        const g = new RadioButtonGroup();
        assert.equal(g.SelectionMode, SelectionMode.Single);
    });
});

describe('RadioButtonGroup item generation', () => {

    test('raw string items wrap in TextBlock-content RadioButtonItems', () => {
        initTestApp();
        const g = new RadioButtonGroup();
        g.Items = ['Small', 'Medium', 'Large'];
        const cs = rows(g);
        assert.equal(cs.length, 3);
        for (const c of cs)
        {
            assert.ok(c instanceof RadioButtonItem);
            assert.ok(c.Content instanceof TextBlock);
        }
        assert.equal((cs[0]!.Content as TextBlock).Text, 'Small');
        assert.equal((cs[1]!.Content as TextBlock).Text, 'Medium');
    });

    test('data-model items are handed to Content raw (rendered via DataTemplate, not stringified)', () => {
        initTestApp();
        // A bare view-model — no registered DataTemplate here, but the row
        // must still receive the MODEL as Content so a ContentControl can
        // resolve one from the app's resource chain at render time. The
        // failure this guards against is stringifying to "[object Object]".
        class OptionModel extends Model {}
        const g = new RadioButtonGroup();
        const vm = new OptionModel();
        g.Items = [vm];
        const row = rows(g)[0]!;
        assert.equal(row.Content, vm, 'the model is slotted as Content unchanged');
    });

    test('pre-built RadioButtonItem instances pass through unchanged', () => {
        initTestApp();
        const g = new RadioButtonGroup();
        const a = new RadioButtonItem('A');
        const b = new RadioButtonItem('B');
        g.Items = [a, b];
        const cs = rows(g);
        assert.equal(cs[0], a);
        assert.equal(cs[1], b);
    });
});

describe('RadioButtonGroup selection', () => {

    test('clicking a row selects it and clears the prior selection', () => {
        initTestApp();
        const g = new RadioButtonGroup();
        const a = new RadioButtonItem('A');
        const b = new RadioButtonItem('B');
        g.Items = [a, b];

        // Drive selection through HandleContainerClick — the same path the
        // per-row pointer-up handler hits at runtime.
        g.HandleContainerClick(a, NoMods);
        assert.equal(a.IsSelected, true);
        assert.equal(b.IsSelected, false);

        g.HandleContainerClick(b, NoMods);
        assert.equal(a.IsSelected, false, 'selecting b clears a');
        assert.equal(b.IsSelected, true);
    });

    test('SelectedIndex / SelectedItem / SelectedValue track the clicked row', () => {
        initTestApp();
        const g = new RadioButtonGroup();
        g.Items = ['Small', 'Medium', 'Large'];
        const cs = rows(g);

        g.HandleContainerClick(cs[1]!, NoMods);
        assert.equal(g.SelectedIndex, 1);
        assert.equal(g.SelectedItem, 'Medium');
        assert.equal(g.SelectedValue, 'Medium');
    });

    test('setting SelectedItem programmatically selects the matching row', () => {
        initTestApp();
        const g = new RadioButtonGroup();
        g.Items = ['Small', 'Medium', 'Large'];
        const cs = rows(g);

        g.SelectedItem = 'Large';
        assert.equal(cs[2]!.IsSelected, true);
        assert.equal(cs[0]!.IsSelected, false);
        assert.equal(g.SelectedIndex, 2);
    });
});

describe('RadioButtonItem IsSelected mirror', () => {

    test('attached Selector.IsSelected mirrors into the instance DP', () => {
        initTestApp();
        const item = new RadioButtonItem('A');
        Selector.SetIsSelected(item, true);
        assert.equal(item.IsSelected, true);
        Selector.SetIsSelected(item, false);
        assert.equal(item.IsSelected, false);
    });

    test('setting instance IsSelected mirrors to the attached DP', () => {
        initTestApp();
        const item = new RadioButtonItem('A');
        item.IsSelected = true;
        assert.equal(Selector.GetIsSelected(item), true);
    });
});
