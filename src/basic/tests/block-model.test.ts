import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    FlowDocument,
    Paragraph,
    List,
    ListItem,
    ListMarkerStyle,
    Run,
    Bold,
    type BlockHost,
} from '../index.js';

// The block flow-content model is pure data (no Visuals): these tests pin
// the object shape — default-slot AddChild routing, Parent back-pointers,
// and the change-notification bubble from a deeply-nested inline all the
// way out to the hosting control.

// A stand-in for the RichText host: counts how many times its blocks tell
// it to re-measure.
class HostSpy implements BlockHost
{
    public calls = 0;
    public onBlockTreeChanged(): void { this.calls++; }
}

describe('block model — default-slot AddChild + Parent wiring', () =>
{
    test('FlowDocument.AddChild routes to Blocks and back-links Parent', () =>
    {
        const doc = new FlowDocument();
        const p = new Paragraph();
        doc.AddChild(p);
        assert.equal(doc.Blocks.Count, 1);
        assert.equal(doc.Blocks.Get(0), p);
        assert.equal(p.Parent, doc);
    });

    test('Paragraph.AddChild routes inline content to Inlines', () =>
    {
        const p = new Paragraph();
        const r = new Run('hi');
        p.AddChild(r);
        assert.equal(p.Inlines.Count, 1);
        assert.equal(p.Inlines.Get(0), r);
        assert.equal(r.Parent, p);
    });

    test('List / ListItem route to ListItems / Blocks with Parent links', () =>
    {
        const list = new List();
        const item = new ListItem();
        const p = new Paragraph();
        item.AddChild(p);
        list.AddChild(item);

        assert.equal(list.ListItems.Count, 1);
        assert.equal(list.ListItems.Get(0), item);
        assert.equal(item.Parent, list);
        assert.equal(item.Blocks.Count, 1);
        assert.equal(item.Blocks.Get(0), p);
        assert.equal(p.Parent, item);
    });

    test('List marker defaults are WPF-flavored', () =>
    {
        const list = new List();
        assert.equal(list.MarkerStyle, ListMarkerStyle.Disc);
        assert.equal(list.StartIndex, 1);
    });
});

describe('block model — change notification bubbles to the host', () =>
{
    // Build doc → paragraph → Run, attach a host, then mutate the run and
    // assert the host was told to re-measure. This exercises every hop:
    // Inline → InlineHost(Paragraph) → Block → BlockHost(FlowDocument) →
    // host control.
    function attached(): { host: HostSpy; run: Run; doc: FlowDocument }
    {
        const doc = new FlowDocument();
        const p = new Paragraph();
        const run = new Run('start');
        p.AddChild(run);
        doc.AddChild(p);
        const host = new HostSpy();
        doc.Parent = host;      // the control claims the document
        host.calls = 0;         // ignore setup churn
        return { host, run, doc };
    }

    test('editing a nested Run bubbles out to the host', () =>
    {
        const { host, run } = attached();
        run.Text = 'changed';
        assert.ok(host.calls > 0, 'host was notified of the inline change');
    });

    test('a nested Span change bubbles through the paragraph', () =>
    {
        const doc = new FlowDocument();
        const p = new Paragraph();
        const bold = new Bold();
        bold.AddChild(new Run('x'));
        p.AddChild(bold);
        doc.AddChild(p);
        const host = new HostSpy();
        doc.Parent = host;
        host.calls = 0;

        bold.FontSize = 32;     // format change deep in the tree
        assert.ok(host.calls > 0, 'host was notified of the span format change');
    });

    test('adding a ListItem to a hosted List re-measures', () =>
    {
        const doc = new FlowDocument();
        const list = new List();
        doc.AddChild(list);
        const host = new HostSpy();
        doc.Parent = host;
        host.calls = 0;

        const item = new ListItem();
        item.AddChild(new Paragraph());
        list.AddChild(item);
        assert.ok(host.calls > 0, 'host was notified of the list mutation');
    });

    test('nested List indent chain keeps Parent links intact', () =>
    {
        const outer = new List();
        const outerItem = new ListItem();
        const innerList = new List();
        const innerItem = new ListItem();
        innerItem.AddChild(new Paragraph());
        innerList.AddChild(innerItem);
        outerItem.AddChild(innerList);
        outer.AddChild(outerItem);

        assert.equal(outerItem.Parent, outer);
        assert.equal(innerList.Parent, outerItem);
        assert.equal(innerItem.Parent, innerList);
    });
});
