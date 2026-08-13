import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ToolboxPage } from '../toolbox-page.js';

describe('ToolboxPage', () => {

    test('carries Id / Title and an empty Items collection', () => {
        const page = new ToolboxPage('shapes', 'Shapes');
        assert.equal(page.Id, 'shapes');
        assert.equal(page.Title, 'Shapes');
        assert.equal(page.Items.Count, 0);
    });

    // Accordion state: a section starts expanded and its IsExpanded is settable
    // so a header toggle two-way binds IsChecked to it (the palette collapse).
    test('IsExpanded defaults to true and is settable', () => {
        const page = new ToolboxPage('shapes', 'Shapes');
        assert.equal(page.IsExpanded, true);
        page.IsExpanded = false;
        assert.equal(page.IsExpanded, false);
    });
});
