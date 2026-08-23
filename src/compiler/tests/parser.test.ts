import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Parser, ParseError } from '../parser.js';
import type {
    Document,
    ElementNode,
    ResourceForm,
    SetterList,
    StructuredBody,
    TopForm,
} from '../ast.js';

function parse(src: string): Document
{
    return new Parser(src).ParseDocument();
}

function firstForm(src: string): TopForm
{
    const d = parse(src);
    assert.equal(d.forms.length, 1, 'expected exactly one top-level form');
    return d.forms[0]!;
}

function asElement(form: TopForm): ElementNode
{
    assert.equal(form.kind, 'element');
    return form as ElementNode;
}

describe('Parser — document boundaries', () => {
    test('empty source produces a document with zero forms', () => {
        const d = parse('');
        assert.equal(d.forms.length, 0);
    });

    test('only whitespace and comments still produces zero forms', () => {
        const d = parse('  // a comment\n /* and another */\n');
        assert.equal(d.forms.length, 0);
    });

    test('two sibling elements at the top level', () => {
        const d = parse('Border  TextBlock');
        assert.equal(d.forms.length, 2);
        assert.equal(asElement(d.forms[0]!).name, 'Border');
        assert.equal(asElement(d.forms[1]!).name, 'TextBlock');
    });
});

describe('Parser — elements and attributes', () => {
    test('bare element — no attrs, no body', () => {
        const el = asElement(firstForm('ContentPresenter'));
        assert.equal(el.name, 'ContentPresenter');
        assert.equal(el.attrs.length, 0);
        assert.equal(el.body, null);
    });

    test('element with a single named attribute', () => {
        const el = asElement(firstForm('Border[Fill=#blue]'));
        assert.equal(el.attrs.length, 1);
        const a = el.attrs[0]!;
        assert.equal(a.kind, 'named-attr');
        if (a.kind !== 'named-attr') return;
        assert.deepEqual(a.path.parts, ['Fill']);
        assert.equal(a.value.kind, 'color');
        if (a.value.kind === 'color') assert.equal(a.value.raw, 'blue');
    });

    test('element with multiple named attributes including a tuple value', () => {
        const el = asElement(firstForm('Border[Fill=#blue, CornerRadius=(3)]'));
        assert.equal(el.attrs.length, 2);
        const second = el.attrs[1]!;
        assert.equal(second.kind, 'named-attr');
        if (second.kind !== 'named-attr') return;
        assert.equal(second.value.kind, 'tuple');
        if (second.value.kind === 'tuple')
        {
            assert.equal(second.value.values.length, 1);
            assert.equal(second.value.values[0]!.kind, 'number');
        }
    });

    test('attached property — dotted path', () => {
        const el = asElement(firstForm('TextBlock[Canvas.Left=10, Canvas.Top=20]'));
        assert.equal(el.attrs.length, 2);
        const a = el.attrs[0]!;
        assert.equal(a.kind, 'named-attr');
        if (a.kind === 'named-attr')
        {
            assert.deepEqual(a.path.parts, ['Canvas', 'Left']);
        }
    });

    test('x:foo flag form (no value)', () => {
        const el = asElement(firstForm('Window x:root[Title="Demo"]'));
        const xattr = el.xAttrs[0]!;
        assert.equal(xattr.kind, 'x-attr');
        assert.equal(xattr.name,  'root');
        assert.equal(xattr.value, null);
    });

    test('x:foo with value', () => {
        const f = firstForm('Style x:key="primary-button"[TargetType=Button]{}');
        assert.equal(f.kind, 'resource-form');
        if (f.kind !== 'resource-form') return;
        const x = f.xAttrs[0]!;
        assert.equal(x.name, 'key');
        assert.equal(x.value?.kind, 'string');
        if (x.value?.kind === 'string') assert.equal(x.value.value, 'primary-button');
    });

    test('mixing positional and named raises a ParseError', () => {
        assert.throws(
            () => parse('foo[#blue, Fill=#red]'),
            ParseError,
            'mixing rejected by parseAttrListBody',
        );
    });

    test('positional ident demotes from a NamedAttr attempt when no `=` follows', () => {
        // `card[#0d47a1, "Revenue"]` — both args are positional values.
        const el = asElement(firstForm('card[#0d47a1, "Revenue"]'));
        assert.equal(el.attrs.length, 2);
        for (const a of el.attrs)
        {
            assert.equal(a.kind, 'positional-attr');
        }
    });
});

describe('Parser — body content', () => {
    test('empty body produces an empty StructuredBody', () => {
        const el = asElement(firstForm('Border{}'));
        assert.notEqual(el.body, null);
        assert.equal(el.body!.kind, 'structured-body');
        if (el.body!.kind === 'structured-body')
        {
            assert.equal(el.body.items.length, 0);
        }
    });

    test('nested elements in the body', () => {
        const el = asElement(firstForm(`
            Border{
                TextBlock[Text="A"]
                TextBlock[Text="B"]
            }
        `));
        const body = el.body as StructuredBody;
        assert.equal(body.items.length, 2);
        assert.equal((body.items[0] as ElementNode).name, 'TextBlock');
    });

    test('SlotAssign — primitive value', () => {
        const el = asElement(firstForm(`
            Grid{
                Columns: [auto, 100, 200]
                Rows: [40]
                TextBlock[Text="A"]
            }
        `));
        const body = el.body as StructuredBody;
        assert.equal(body.items.length, 3);
        const slot = body.items[0]!;
        assert.equal(slot.kind, 'slot-assign');
        if (slot.kind === 'slot-assign')
        {
            assert.equal(slot.name, 'Columns');
            assert.equal((slot.value as { kind: string }).kind, 'list');
        }
    });

    test('KeyValueResource — `@primary = #4caf50`', () => {
        const el = asElement(firstForm(`
            Border{
                resources: {
                    @primary = #4caf50
                }
            }
        `));
        const outer = el.body as StructuredBody;
        const slot  = outer.items[0]!;
        assert.equal(slot.kind, 'slot-assign');
        if (slot.kind !== 'slot-assign') return;
        const inner = slot.value as StructuredBody;
        const kv    = inner.items[0]!;
        assert.equal(kv.kind, 'key-value-resource');
        if (kv.kind === 'key-value-resource')
        {
            assert.equal(kv.name, 'primary');
            assert.equal(kv.key,  'primary');
            assert.equal(kv.value.kind, 'color');
        }
    });

    test('KeyValueResource — `@theme:primary` keys under the full "theme:primary"', () => {
        const el = asElement(firstForm(`
            Border{ resources: { @theme:primary = #4caf50 } }
        `));
        const outer = el.body as StructuredBody;
        const slot  = outer.items[0] as { value: StructuredBody };
        const kv    = slot.value.items[0]!;
        if (kv.kind !== 'key-value-resource') throw new Error('expected kv');
        assert.equal(kv.name, 'theme');
        assert.equal(kv.key,  'theme:primary');
    });
});

describe('Parser — values', () => {
    test('tuple, size, and list', () => {
        const el = asElement(firstForm(
            'Foo[Pad=(1,2,3,4), Size=<100,50>, Cols=[auto,*,*]]',
        ));
        const [pad, size, cols] = el.attrs;
        assert.equal((pad as { value: { kind: string }}).value.kind, 'tuple');
        assert.equal((size as { value: { kind: string }}).value.kind, 'size');
        assert.equal((cols as { value: { kind: string }}).value.kind, 'list');
    });

    test('all four sigil-value families', () => {
        const el = asElement(firstForm(
            'X[A=$Name, B=$$Fill, C=@primary, D=@@accent]',
        ));
        const kinds = el.attrs.map(a => (a as { value: { kind: string }}).value.kind);
        assert.deepEqual(kinds, [
            'binding', 'template-binding', 'static-resource', 'dynamic-resource',
        ]);
    });

    test('dotted binding path collects all segments', () => {
        const el = asElement(firstForm('X[Y=$Customer.Address.City]'));
        const b = (el.attrs[0] as { value: { kind: string; path: string[] }}).value;
        assert.equal(b.kind, 'binding');
        assert.deepEqual(b.path, ['Customer', 'Address', 'City']);
    });

    test('inline expression `$( … )$` raises a clear error (deferred)', () => {
        assert.throws(
            () => parse('X[Y=$( @a * 2 )$]'),
            /inline expressions/,
        );
    });
});

describe('Parser — resource forms', () => {
    test('Style with implicit (keyless) target', () => {
        const f = firstForm('Style[TargetType=Button]{ Fill = #red; }') as ResourceForm;
        assert.equal(f.kind,    'resource-form');
        assert.equal(f.keyword, 'Style');
        const meta = f.metaAttrs[0]!;
        assert.deepEqual(meta.path.parts, ['TargetType']);
        const setters = f.body as SetterList;
        assert.equal(setters.kind, 'setter-list');
        assert.equal(setters.items.length, 1);
    });

    test('Style with a trigger group', () => {
        const f = firstForm(`
            Style[TargetType=Button]{
                Fill = #green;
                when( IsMouseOver and not IsPressed ){
                    Fill = #lightgreen;
                }
            }
        `) as ResourceForm;
        const setters = f.body as SetterList;
        assert.equal(setters.items.length, 2);
        const trig = setters.items[1]!;
        assert.equal(trig.kind, 'trigger-group');
        if (trig.kind !== 'trigger-group') return;
        // and / not / property structure
        assert.equal(trig.condition.kind, 'trigger-and');
    });

    test('Template with x:key and TargetType', () => {
        const f = firstForm(`
            Template x:key="FancyButton"[TargetType=Button]{
                Border[Fill=$$Fill]{
                    ContentPresenter
                }
            }
        `) as ResourceForm;
        assert.equal(f.keyword, 'Template');
        const x = f.xAttrs[0]!;
        assert.equal(x.name, 'key');
        assert.equal((f.body as ElementNode).name, 'Border');
    });

    test('DataTemplate registers a Person-typed body', () => {
        const f = firstForm(`
            DataTemplate[DataType=Person]{
                TextBlock[Text=$DisplayName]
            }
        `) as ResourceForm;
        assert.equal(f.keyword, 'DataTemplate');
        const meta = f.metaAttrs[0]!;
        assert.deepEqual(meta.path.parts, ['DataType']);
    });
});

describe('Parser — macros and imports', () => {
    test('def with mixed positional + named holes', () => {
        const d = firstForm(`
            def card[#bg, #title, #1]{
                Border[Fill=#bg]{ ContentPresenter }
            }
        `);
        assert.equal(d.kind, 'def');
        if (d.kind !== 'def') return;
        assert.equal(d.name, 'card');
        assert.equal(d.params.length, 3);
        assert.deepEqual(
            d.params.map(p => ({ name: p.holeName, pos: p.positional })),
            [
                { name: 'bg',    pos: false },
                { name: 'title', pos: false },
                { name: '1',     pos: true },
            ],
        );
    });

    test('import with `from` source', () => {
        const f = firstForm('import Controls from "@scope/pkg"');
        assert.equal(f.kind, 'import');
        if (f.kind !== 'import') return;
        assert.equal(f.name,   'Controls');
        assert.equal(f.source, '@scope/pkg');
    });

    test('import without `from` (bare)', () => {
        const f = firstForm('import Controls');
        assert.equal(f.kind, 'import');
        if (f.kind === 'import') assert.equal(f.source, null);
    });
});

describe('Parser — end-to-end on a worked Application', () => {
    // Lower-key version of the spec's §1 worked example — no inline
    // expressions, no text-mode bodies, no macros being called.
    test('Application with resources and a Window marked x:root', () => {
        const f = firstForm(`
            Application{
                resources: {
                    @primary = #4caf50
                    Style[TargetType=Button]{
                        Fill = @primary;
                        Padding = (12, 6);
                    }

                    Window x:root[Title="Demo"]{
                        Border[Padding=(16)]{
                            TextBlock[Text="Hello mural"]
                        }
                    }
                }
            }
        `);
        assert.equal(f.kind, 'element');
        const app = asElement(f);
        assert.equal(app.name, 'Application');
        const body = app.body as StructuredBody;
        const resourcesSlot = body.items[0]!;
        assert.equal(resourcesSlot.kind, 'slot-assign');
        if (resourcesSlot.kind !== 'slot-assign') return;
        assert.equal(resourcesSlot.name, 'resources');
        const inner = resourcesSlot.value as StructuredBody;

        // entries: @primary, style{}, Window{}
        assert.equal(inner.items.length, 3);
        assert.equal(inner.items[0]!.kind, 'key-value-resource');
        assert.equal(inner.items[1]!.kind, 'resource-form');
        assert.equal(inner.items[2]!.kind, 'element');

        // Window has x:root.
        const win = inner.items[2] as ElementNode;
        const xroot = win.xAttrs.find(a => a.name === 'root');
        assert.notEqual(xroot, undefined);
        assert.equal(xroot!.name, 'root');
    });
});
