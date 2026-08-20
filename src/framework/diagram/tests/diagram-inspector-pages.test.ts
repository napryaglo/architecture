import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Diagram } from '../diagram.js';
import { DiagramInspector } from '../diagram-inspector.js';
import { ShapeStylePage, SizePositionPage } from '../inspector-pages.js';

describe('DiagramInspector paging', () => {
    test('exposes Style + Size/Position pages, default selection = Style', () => {
        Application.current = null; new Application();
        const insp = new DiagramInspector();
        const pages = [...insp.Pages];
        assert.equal(pages.length, 2);
        assert.ok(pages[0] instanceof ShapeStylePage);
        assert.ok(pages[1] instanceof SizePositionPage);
        assert.equal(insp.SelectedPage, pages[0]);
        assert.equal(pages[0].Title, 'Style');
        assert.equal(pages[1].Title, 'Size & Position');
    });
    test('View propagates to the pages', () => {
        Application.current = null; new Application();
        const insp = new DiagramInspector();
        const d = new Diagram();
        insp.View = d;
        for (const p of insp.Pages) assert.equal(p.View, d);
    });
});
