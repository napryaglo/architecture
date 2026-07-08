import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { FontFamilyPicker, FontSizePicker, DEFAULT_FONT_FAMILIES } from '../font-pickers.js';

function mount(v: unknown): void
{
    const t = new HeadlessTarget(300, 200);
    t.Content = v as never;
    t.Flush();
}

describe('FontFamilyPicker', () => {
    beforeEach(() => { initTestApp(); });

    test('is editable and seeded with the default font list', () => {
        const p = new FontFamilyPicker();
        mount(p);
        assert.equal(p.IsEditable, true);
        assert.equal((p.Items ?? []).length, DEFAULT_FONT_FAMILIES.length);
        p.Text = 'Georgia';
        assert.equal(p.Text, 'Georgia');
        assert.equal(p.SelectedItem, 'Georgia', 'exact match selects the family');
    });
});

describe('FontSizePicker — Value ↔ Text sync', () => {
    beforeEach(() => { initTestApp(); });

    test('defaults to 14 and seeds the field', () => {
        const p = new FontSizePicker();
        mount(p);
        assert.equal(p.Value, 14);
        assert.equal(p.Text, '14');
    });

    test('setting Value formats the field and matches the preset', () => {
        const p = new FontSizePicker();
        mount(p);
        p.Value = 24;
        assert.equal(p.Text, '24');
        assert.equal(p.SelectedItem, '24');
    });

    test('typing a size parses into Value', () => {
        const p = new FontSizePicker();
        mount(p);
        p.Text = '36';
        assert.equal(p.Value, 36);
    });

    test('typing an arbitrary (non-preset) size still parses', () => {
        const p = new FontSizePicker();
        mount(p);
        p.Text = '13';
        assert.equal(p.Value, 13);
        assert.equal(p.SelectedIndex, -1, 'non-preset value has no selected item');
    });
});
