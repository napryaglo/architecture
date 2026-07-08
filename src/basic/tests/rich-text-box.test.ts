import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';
import { Rect, Size } from '../../runtime/index.js';
import { HeadlessTarget, SvgDrawingContext } from '../../visual-engine/index.js';
import { RichTextBox, RichTextBlock, FlowDocument, Paragraph, Run } from '../index.js';

// The edit shell reuses the whole RichTextBlock core; these pin the two
// things the shell adds — it is a RichTextBlock, and it is focusable — and
// that a Document still renders through the shared path.
describe('RichTextBox — edit shell', () =>
{
    beforeEach(() => { initTestApp(); });

    test('is a focusable RichTextBlock', () =>
    {
        const rtb = new RichTextBox();
        assert.ok(rtb instanceof RichTextBlock, 'shares the display core');
        assert.equal(rtb.Focusable, true, 'opts into keyboard focus');
    });

    test('renders its Document through the shared core', () =>
    {
        const rtb = new RichTextBox();
        const doc = new FlowDocument();
        const p = new Paragraph();
        p.AddChild(new Run('editable'));
        doc.AddChild(p);
        rtb.Document = doc;

        rtb.Measure(new Size(300, 100));
        rtb.Arrange(new Rect(0, 0, rtb.DesiredSize.Width, rtb.DesiredSize.Height));
        const dc = new SvgDrawingContext();
        rtb.Render(dc);
        assert.ok(dc.ToSvg(300, 100).includes('editable'), 'document painted');
    });

    test('can take focus when attached', () =>
    {
        const rtb = new RichTextBox();
        const doc = new FlowDocument();
        const p = new Paragraph();
        p.AddChild(new Run('x'));
        doc.AddChild(p);
        rtb.Document = doc;

        const target = new HeadlessTarget(200, 60);
        target.Content = rtb as never;
        target.Flush();

        rtb.Focus();
        assert.equal(rtb.IsFocused, true, 'holds keyboard focus');
    });
});
