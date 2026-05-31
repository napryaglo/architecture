// Completion provider. Decides what to suggest based on the character
// just before the cursor plus the AST node enclosing the cursor.
//
// Triggers (registered in server.ts):
//   '@'  → resource keys (static / dynamic share the same set)
//   ':'  → `x:` scope extensions after a bare `x`
//   '.'  → attached-property right-hand side after a PascalCase ident
//   '='  → enum values when LHS is a known enum class
//   ' '  → fall through into the contextual default
//
// Context:
//   - inside `[ … ]` of an element → property names + x-extensions +
//     (for style/template/datatemplate) targettype / datatype
//   - body `{ … }` of an element   → child control names + keyword
//     forms (style / template / datatemplate / def / when)
//   - body of `resources: { … }`   → same as above PLUS `@key = …`
//                                    snippet seed
//
// When the AST is unavailable (parse failed), we drop back to a flat
// "controls + keywords + properties" union so the user still gets
// something useful while typing the file in.

import {
    CompletionItem,
    CompletionItemKind,
    Position,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
    DEFAULT_SYMBOLS,
    ENUM_CLASSES,
    DEFAULT_SLOT_INFO,
    type ElementNode,
} from '@visualisation-sub/mural/compiler';

import {
    analyze,
    elementAt,
    attributeAt,
    type DocAnalysis,
} from '../analyzer.js';

// ── Static catalogues ───────────────────────────────────────────────

// Properties we surface as completions inside `[…]`. Drawn from the
// known DependencyProperty names across runtime + Controls. Not an
// authoritative list — just the common ones. Falls back gracefully when
// the user picks one we don't know about.
const COMMON_PROPERTIES: ReadonlyArray<string> = [
    'Width', 'Height', 'MinWidth', 'MinHeight', 'MaxWidth', 'MaxHeight',
    'Margin', 'Padding',
    'HorizontalAlignment', 'VerticalAlignment',
    'Background', 'BorderBrush', 'BorderThickness', 'CornerRadius',
    'Foreground', 'FontFamily', 'FontSize', 'FontWeight', 'FontStyle',
    'Text', 'TextWrapping', 'TextAlignment',
    'Visibility', 'Opacity', 'IsEnabled', 'IsHitTestVisible',
    'DataContext', 'Tag', 'ToolTip',
    'Source', 'Stretch',
    'Fill', 'Stroke', 'StrokeThickness', 'Data',
    'ItemsSource', 'ItemTemplate', 'Items',
    'Content', 'ContentTemplate',
];

// Attached properties keyed by owner class. Used for `Canvas.Left`-style
// completions inside `[…]` after the user types e.g. `Canvas.`.
const ATTACHED_PROPERTIES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
    ['Canvas', ['Left', 'Top', 'Right', 'Bottom', 'ZIndex']],
    ['Grid',   ['Row', 'Column', 'RowSpan', 'ColumnSpan']],
]);

// Enum value lists — probed from the built runtime so they stay in
// sync with the actual enums. Each member is a valid RHS for any
// property whose LHS resolves to the corresponding enum class.
const ENUM_VALUES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
    ['HorizontalAlignment', ['Left', 'Center', 'Right', 'Stretch']],
    ['VerticalAlignment',   ['Top', 'Center', 'Bottom', 'Stretch']],
    ['FontWeight',          ['Normal', 'Bold']],
    ['FontStyle',           ['Normal', 'Italic']],
    ['Stretch',             ['None', 'Fill', 'Uniform', 'UniformToFill']],
    ['AlignmentX',          ['Left', 'Center', 'Right']],
    ['AlignmentY',          ['Top', 'Center', 'Bottom']],
    ['BindingMode',         ['OneWay', 'TwoWay', 'OneTime', 'OneWayToSource']],
    ['LineCap',             ['Flat', 'Round', 'Square']],
    ['LineJoin',            ['Miter', 'Round', 'Bevel']],
    ['FillRule',            ['EvenOdd', 'Nonzero']],
    ['SweepDirection',      ['Counterclockwise', 'Clockwise']],
    ['GradientSpreadMethod', ['Pad', 'Reflect', 'Repeat']],
]);

// X-prefixed scope extensions the parser recognises. `key` and `root`
// are always offered; the rest are placeholders for forms we plan to
// add (x:Name, x:DataType for templates).
const X_EXTENSIONS: ReadonlyArray<string> = ['key', 'root', 'Name', 'DataType'];

// Form keywords legal as a body item (resource form, macro def,
// trigger group).
const BODY_KEYWORDS: ReadonlyArray<string> = [
    'style', 'template', 'datatemplate', 'def', 'when',
];

// ── Entry point ─────────────────────────────────────────────────────

export function completions(doc: TextDocument, pos: Position): CompletionItem[]
{
    const analysis = analyze(doc);
    const offset = doc.offsetAt(pos);
    const text = analysis.text;
    const before = text.slice(0, offset);

    // Sigil-triggered completions short-circuit context detection —
    // they're unambiguous from the surrounding chars.
    const sigil = detectSigil(before);
    if (sigil === 'resource')     return resourceKeys(analysis);
    if (sigil === 'x-extension')  return xExtensions();
    if (sigil === 'attached')
    {
        const owner = matchAttachedOwner(before);
        return owner === null ? [] : attachedProperties(owner);
    }
    if (sigil === 'enum')
    {
        const propName = matchEnumProperty(before);
        return propName === null ? [] : enumValues(propName);
    }

    // Contextual completions need the AST.
    if (analysis.ast === null) return flatFallback();

    const element = elementAt(analysis, offset);
    if (element === null) return topLevel();

    const ctx = contextWithin(element, offset, text);
    switch (ctx)
    {
        case 'attrs':         return attributeContext(element);
        case 'body':          return bodyContext(element);
        case 'resources':     return resourcesContext(analysis);
        default:              return flatFallback();
    }
}

// ── Sigil detection (chars immediately before cursor) ───────────────

type Sigil = 'resource' | 'x-extension' | 'attached' | 'enum' | null;

function detectSigil(before: string): Sigil
{
    if (/@@?[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(before)) return 'resource';
    if (/@@?$/.test(before))                            return 'resource';
    if (/\bx:[A-Za-z]*$/.test(before))                  return 'x-extension';
    if (/\b[A-Z][A-Za-z0-9]*\.[A-Z][A-Za-z0-9]*$/.test(before)) return 'attached';
    if (/\b[A-Z][A-Za-z0-9]*\.$/.test(before))          return 'attached';
    if (/=\s*[A-Za-z]*$/.test(before) && matchEnumProperty(before) !== null) return 'enum';
    return null;
}

function matchAttachedOwner(before: string): string | null
{
    const m = before.match(/\b([A-Z][A-Za-z0-9]*)\.[A-Za-z0-9]*$/);
    return m === null ? null : m[1]!;
}

function matchEnumProperty(before: string): string | null
{
    // `…HorizontalAlignment=Cen` → property = HorizontalAlignment.
    // We only recognise it when the property name itself matches an
    // enum class; that's how the compiler picks the enum interpretation.
    const m = before.match(/\b([A-Z][A-Za-z0-9]*)\s*=\s*[A-Za-z]*$/);
    if (m === null) return null;
    const name = m[1]!;
    return ENUM_CLASSES.has(name) ? name : null;
}

// ── Builders ────────────────────────────────────────────────────────

function resourceKeys(analysis: DocAnalysis): CompletionItem[]
{
    const out: CompletionItem[] = [];
    for (const def of analysis.resources.values())
    {
        out.push({
            label:  def.key,
            kind:   CompletionItemKind.Variable,
            detail: def.kind === 'value'
                ? 'static resource'
                : `${def.kind} resource`,
        });
    }
    return out;
}

function xExtensions(): CompletionItem[]
{
    return X_EXTENSIONS.map(name => ({
        label:  name,
        kind:   CompletionItemKind.Keyword,
        detail: `x:${name}`,
    }));
}

function attachedProperties(owner: string): CompletionItem[]
{
    const list = ATTACHED_PROPERTIES.get(owner) ?? [];
    return list.map(name => ({
        label:  name,
        kind:   CompletionItemKind.Property,
        detail: `attached property (owner: ${owner})`,
    }));
}

function enumValues(enumName: string): CompletionItem[]
{
    const members = ENUM_VALUES.get(enumName) ?? [];
    return members.map(name => ({
        label:  name,
        kind:   CompletionItemKind.EnumMember,
        detail: enumName,
    }));
}

function topLevel(): CompletionItem[]
{
    return [
        snippet('Application', 'Application{\n\tresources: {\n\t\t$0\n\t}\n}',
                'top-level Application skeleton'),
        keyword('import', 'import declaration'),
        keyword('def', 'macro definition'),
    ];
}

function attributeContext(element: ElementNode): CompletionItem[]
{
    const out: CompletionItem[] = [];

    // x:key / x:root always legal inside [].
    for (const ext of X_EXTENSIONS)
    {
        out.push({
            label:  `x:${ext}`,
            kind:   CompletionItemKind.Keyword,
            detail: 'scope extension',
        });
    }

    // For style/template/datatemplate the meta-attrs are different.
    if (element.name === 'style' || element.name === 'template')
    {
        out.push({ label: 'targettype', kind: CompletionItemKind.Keyword,
                   detail: 'meta attr: target type for style/template' });
    }
    if (element.name === 'datatemplate')
    {
        out.push({ label: 'datatype', kind: CompletionItemKind.Keyword,
                   detail: 'meta attr: data type for datatemplate' });
    }

    // Common DP names for regular elements.
    for (const name of COMMON_PROPERTIES)
    {
        out.push({
            label:  name,
            kind:   CompletionItemKind.Property,
            detail: 'property',
        });
    }

    // Attached-property hint: surface owner names so dot-completion can
    // kick in (`Canvas.Left`).
    for (const [owner] of ATTACHED_PROPERTIES)
    {
        out.push({
            label:  owner + '.',
            kind:   CompletionItemKind.Class,
            detail: 'attached-property owner',
        });
    }

    // `{{ … }}` inline-expression snippet — usable as any property's
    // RHS to fold a constant at compile time or build a reactive
    // MultiBinding when `$path` references appear in the body.
    out.push(snippet(
        '{{ … }}',
        '{{ $0 }}',
        'inline expression — constant fold or MultiBinding',
    ));

    return out;
}

function bodyContext(element: ElementNode): CompletionItem[]
{
    const out: CompletionItem[] = [];

    // Control names from the DEFAULT_SYMBOLS table.
    for (const [name, mod] of DEFAULT_SYMBOLS)
    {
        if (!/^[A-Z]/.test(name)) continue;
        if (name === 'Application') continue;  // top-level only
        out.push({
            label:  name,
            kind:   CompletionItemKind.Class,
            detail: shortModule(mod),
        });
    }

    // Resource forms — legal inside any body but most useful inside
    // `resources:` (covered in resourcesContext too).
    for (const kw of BODY_KEYWORDS)
    {
        out.push({
            label:  kw,
            kind:   CompletionItemKind.Keyword,
            detail: 'resource form',
        });
    }

    // For Application: the only meaningful body item is `resources:`.
    if (element.name === 'Application')
    {
        out.unshift(snippet(
            'resources',
            'resources: {\n\t$0\n}',
            'resources slot — only legal child of Application',
        ));
    }

    // If the element has a known default slot, surface it as a slot-
    // assign snippet too.
    const slot = DEFAULT_SLOT_INFO.get(element.name);
    if (slot !== undefined && slot.kind !== 'string')
    {
        out.unshift({
            label:  `${slot.name}:`,
            kind:   CompletionItemKind.Field,
            detail: `${element.name}.${slot.name} slot (${slot.kind})`,
        });
    }

    return out;
}

function resourcesContext(analysis: DocAnalysis): CompletionItem[]
{
    const out: CompletionItem[] = [];

    // @key = … snippet seed.
    out.push(snippet(
        '@key',
        '@${1:key} = $0',
        'static resource entry',
    ));

    // Plus style / template / datatemplate / def.
    for (const kw of BODY_KEYWORDS)
    {
        out.push({
            label:  kw,
            kind:   CompletionItemKind.Keyword,
            detail: 'resource form',
        });
    }

    // Plus existing keys (useful for renaming / referencing).
    for (const def of analysis.resources.values())
    {
        out.push({
            label:  '@' + def.key,
            kind:   CompletionItemKind.Variable,
            detail: 'existing resource',
        });
    }

    return out;
}

function flatFallback(): CompletionItem[]
{
    const out: CompletionItem[] = [];
    for (const [name, mod] of DEFAULT_SYMBOLS)
    {
        if (!/^[A-Z]/.test(name)) continue;
        out.push({
            label:  name,
            kind:   CompletionItemKind.Class,
            detail: shortModule(mod),
        });
    }
    for (const kw of BODY_KEYWORDS)
    {
        out.push({ label: kw, kind: CompletionItemKind.Keyword });
    }
    return out;
}

// ── Helpers ─────────────────────────────────────────────────────────

function contextWithin(
    element: ElementNode,
    offset: number,
    text: string,
): 'attrs' | 'body' | 'resources' | 'unknown'
{
    // If the cursor is inside an attribute span, it's the attrs context.
    if (attributeAt(element, offset) !== undefined) return 'attrs';

    // Lightweight heuristic: scan back from the cursor for the nearest
    // unbalanced `[` vs `{` inside the element's span. The first opener
    // we hit decides the context. Stops at the element's start to avoid
    // walking into earlier siblings.
    const start = element.span.start.offset;
    let depthSquare = 0;
    let depthCurly  = 0;
    for (let i = offset - 1; i >= start; i--)
    {
        const c = text[i]!;
        if (c === ']') depthSquare++;
        else if (c === '[' && depthSquare > 0) depthSquare--;
        else if (c === '[' && depthSquare === 0) return 'attrs';
        else if (c === '}') depthCurly++;
        else if (c === '{' && depthCurly > 0) depthCurly--;
        else if (c === '{' && depthCurly === 0)
        {
            // Inside a body — distinguish `resources: { … }` from a
            // plain element body by looking at the token preceding `{`.
            const head = text.slice(0, i).trimEnd();
            if (head.endsWith('resources:')) return 'resources';
            return 'body';
        }
    }
    return 'unknown';
}

function snippet(label: string, insert: string, detail?: string): CompletionItem
{
    return {
        label,
        kind: CompletionItemKind.Snippet,
        insertText: insert,
        insertTextFormat: 2,  // Snippet
        detail,
    };
}

function keyword(label: string, detail?: string): CompletionItem
{
    return { label, kind: CompletionItemKind.Keyword, detail };
}

function shortModule(mod: string): string
{
    return mod.replace('@visualisation-sub/mural/', '');
}
