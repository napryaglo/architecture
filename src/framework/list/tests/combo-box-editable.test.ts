import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { ComboBox } from '../combo-box.js';
import { TextBox } from '../../../basic/text-box.js';

function mount(cb: ComboBox): HeadlessTarget
{
    const t = new HeadlessTarget(300, 200);
    t.Content = cb as never;
    t.Flush();
    return t;
}

function editField(cb: ComboBox): TextBox
{
    const box = (cb as unknown as { _selectionBox: { FindName(n: string): unknown } })._selectionBox;
    return box.FindName('PART_EditText') as TextBox;
}

describe('ComboBox — editable mode', () => {
    beforeEach(() => { initTestApp(); });

    test('typing in the field updates Text and matches an item', () => {
        const cb = new ComboBox();
        cb.IsEditable = true;
        cb.Items = ['Small', 'Medium', 'Large'];
        mount(cb);

        const field = editField(cb);
        assert.ok(field instanceof TextBox, 'PART_EditText is a TextBox');

        // Simulate the field receiving typed text.
        field.Text = 'Medium';
        assert.equal(cb.Text, 'Medium', 'Text mirrors the field');
        assert.equal(cb.SelectedIndex, 1, 'exact match selects the item');

        // A partial value matches nothing and must NOT wipe the field.
        field.Text = 'Med';
        assert.equal(cb.Text, 'Med');
        assert.equal(cb.SelectedIndex, -1, 'no exact match → cleared selection');
        assert.equal(field.Text, 'Med', 'partial typed value is preserved');
    });

    test('setting Text programmatically pushes into the field', () => {
        const cb = new ComboBox();
        cb.IsEditable = true;
        cb.Items = ['8', '10', '12'];
        mount(cb);

        cb.Text = '10';
        assert.equal(editField(cb).Text, '10', 'field reflects Text');
        assert.equal(cb.SelectedIndex, 1);
    });

    test('picking an item from selection sets Text to its display', () => {
        const cb = new ComboBox();
        cb.IsEditable = true;
        cb.Items = ['Arial', 'Inter', 'Roboto'];
        mount(cb);

        cb.SelectedIndex = 2;   // as a dropdown pick would
        assert.equal(cb.Text, 'Roboto', 'Text follows the picked item');
        assert.equal(editField(cb).Text, 'Roboto');
    });

    test('non-editable combo ignores Text/field and toggles on box click', () => {
        const cb = new ComboBox();
        cb.Items = ['x', 'y'];
        mount(cb);
        // No PART_EditText usage; box click path still toggles.
        const box = (cb as unknown as { _selectionBox: { onClick?: () => void } })._selectionBox;
        box.onClick?.();
        assert.equal(cb.IsDropDownOpen, true, 'non-editable box click opens');
    });
});
