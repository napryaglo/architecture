import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Application, Size, Rect } from '../../runtime/index.js';
import { SvgRenderer, VISUAL_BACKREF } from '../../visual-engine/index.js';
import { RichTextBox, FlowDocument, Paragraph, Run } from '../index.js';

// Verify the editor presents a REAL hit surface through the actual
// SvgRenderer (the browser path): a non-zero, pointer-events="all"
// mural-hit pad on an outer <g> that back-references the RichTextBox, so a
// DOM click routes to it. HeadlessTarget tests bypass this (they supply the
// hit directly), so this pins the piece that only the browser exercises.
function makeDom(): { document: Document; surface: SVGSVGElement }
{
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const doc = dom.window.document;
    const surface = doc.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    doc.body.appendChild(surface);
    return { document: doc, surface };
}

describe('RichTextBox — DOM hit surface', () => {
    beforeEach(() => { Application.current = null; });

    test('renders a non-zero, backref-stamped, pointer-events pad', () => {
        const { document, surface } = makeDom();
        const renderer = new SvgRenderer(surface, { document });

        const editor = new RichTextBox();
        const doc = new FlowDocument();
        const p = new Paragraph();
        p.AddChild(new Run('hello world'));
        doc.AddChild(p);
        editor.Document = doc;
        editor.Measure(new Size(300, 100));
        editor.Arrange(new Rect(0, 0, 300, 80));
        renderer.Render(editor, undefined, null, null);

        const outer = surface.querySelector('g.mural-visual') as SVGGElement;
        assert.ok(outer, 'editor emitted an outer group');
        // The outer group back-references the editor so the DOM hit walk
        // (elementsFromPoint → ancestor → VISUAL_BACKREF) lands on it.
        assert.equal((outer as unknown as Record<symbol, unknown>)[VISUAL_BACKREF], editor);

        const hit = outer.querySelector('rect.mural-hit') as SVGRectElement;
        assert.ok(hit, 'hit pad present');
        assert.equal(hit.getAttribute('pointer-events'), 'all');
        assert.ok(Number(hit.getAttribute('width')) > 0, 'pad width covers the editor');
        assert.ok(Number(hit.getAttribute('height')) > 0, 'pad height covers the editor');

        // The editor is hit-test-visible (outer not pointer-events:none).
        assert.notEqual(outer.getAttribute('pointer-events'), 'none');
        assert.equal(editor.IsHitTestVisible, true);
    });
});
