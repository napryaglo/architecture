import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compile, instantiate } from '../compile.js';
import * as runtime from '../../runtime/index.js';
import * as controls from '../../basic/index.js';
import * as engine from '../../visual-engine/index.js';
import { Application, Rect, Size } from '../../runtime/index.js';
import { SvgDrawingContext } from '../../visual-engine/index.js';
import { RichTextBlock, FlowDocument, Paragraph, List, ListItem } from '../../basic/index.js';

const CTX: Record<string, unknown> = { ...runtime, ...controls, ...engine };

// The block flow-content model (FlowDocument → Paragraph / List / ListItem)
// authors in `.mu` through the same mixed-content mode as inlines: a
// RichText host takes one FlowDocument (object slot); block hosts take
// element children; a Paragraph is an inline host so its body accepts
// quoted text. Text directly inside a block host is a compile error.
describe('compile — block flow content', () =>
{
    test('RichTextBlock document with paragraph + list lowers correctly', () =>
    {
        const js = compile(`
            Application{ resources: {
                RichTextBlock x:root {
                    FlowDocument {
                        Paragraph { "Hello " Bold { "World" } }
                        List [ MarkerStyle = Decimal ] {
                            ListItem { Paragraph { "one" } }
                        }
                    }
                }
            } }
        `).js;
        assert.match(js, /new FlowDocument\(\)/);
        assert.match(js, /new Paragraph\(\)/);
        assert.match(js, /new List\(\)/);
        assert.match(js, /new ListItem\(\)/);
        assert.match(js, /new Run\("Hello "\)/);
        assert.match(js, /new Bold\(\)/);
        assert.match(js, /ListMarkerStyle\.Decimal/);
        assert.match(js, /\.Document = _/);        // object slot → setter
        assert.match(js, /\.AddChild\(/);           // list slots → AddChild
    });

    test('quoted text directly inside a block host is a compile error', () =>
    {
        assert.throws(() => compile(`
            Application{ resources: { FlowDocument x:root { "loose" } } }
        `), /text content is only allowed inside an inline host/);
    });

    test('quoted text directly inside a ListItem is a compile error', () =>
    {
        assert.throws(() => compile(`
            Application{ resources: {
                List x:root { ListItem { "needs a paragraph" } }
            } }
        `), /text content is only allowed inside an inline host/);
    });
});

describe('instantiate — block content builds + renders', () =>
{
    beforeEach(() => { Application.current = null; });

    test('compiled RichTextBlock builds the block tree', () =>
    {
        const app = instantiate(`
            Application{ resources: {
                RichTextBlock x:root {
                    FlowDocument {
                        Paragraph { "Intro" }
                        List [ MarkerStyle = Decimal ] {
                            ListItem { Paragraph { "one" } }
                            ListItem { Paragraph { "two" } }
                        }
                    }
                }
            } }
        `, CTX) as Application;
        const rtb = app.Resources.Root as RichTextBlock;
        assert.ok(rtb instanceof RichTextBlock);
        const doc = rtb.Document as FlowDocument;
        assert.ok(doc instanceof FlowDocument);
        assert.equal(doc.Blocks.Count, 2);
        assert.ok(doc.Blocks.Get(0) instanceof Paragraph);
        const list = doc.Blocks.Get(1) as List;
        assert.ok(list instanceof List);
        assert.equal(list.ListItems.Count, 2);
        assert.ok(list.ListItems.Get(0) instanceof ListItem);
    });

    test('compiled RichTextBlock renders bold text and ordered markers', () =>
    {
        const app = instantiate(`
            Application{ resources: {
                RichTextBlock x:root {
                    FlowDocument {
                        Paragraph { "Hello " Bold { "World" } }
                        List [ MarkerStyle = Decimal ] {
                            ListItem { Paragraph { "one" } }
                        }
                    }
                }
            } }
        `, CTX) as Application;
        const rtb = app.Resources.Root as RichTextBlock;

        rtb.Measure(new Size(400, 200));
        rtb.Arrange(new Rect(0, 0, rtb.DesiredSize.Width, rtb.DesiredSize.Height));
        const dc = new SvgDrawingContext();
        rtb.Render(dc);
        const svg = dc.ToSvg(400, 200);
        assert.match(svg, /font-weight="bold"[^>]*>World</);
        assert.ok(svg.includes('>Hello'), 'paragraph text painted');
        assert.ok(svg.includes('1.'), 'decimal marker painted');
        assert.ok(svg.includes('>one'), 'list item text painted');
    });
});
