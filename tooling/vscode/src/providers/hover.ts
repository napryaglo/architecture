// Hover provider. Pulls the token under the cursor and renders a small
// markdown card describing it. Covers:
//
//   * `@key` / `@@key`  → the resolved value from the resources index
//   * `x:key` / `x:root` → scope-extension docstring
//   * PascalCase ident  → "<Name> — from <module>" (DEFAULT_SYMBOLS)
//   * Known keyword     → short docstring
//   * Enum class name   → list of members from ENUM_VALUES (re-used
//                          from the completion module)

import {
    Hover,
    MarkupKind,
    Position,
    Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
    DEFAULT_SYMBOLS,
    KEYWORDS,
} from '@visualisation-sub/mural/compiler';

import {
    analyze,
    type ResourceDef,
} from '../analyzer.js';

const KEYWORD_DOCS: ReadonlyMap<string, string> = new Map([
    ['style',        'Implicit or keyed Style. Implicit when only `targettype=…` is given; keyed when `x:key="…"` is present.'],
    ['template',     'ControlTemplate keyed by `x:key="…"`. Body is a single element factory; `$Property` references in the factory body bind via TemplateBinding.'],
    ['datatemplate', 'DataTemplate keyed by `x:key="…"`. Body factory binds via `$Path` against the DataContext supplied by the consumer.'],
    ['def',          'Macro definition. Holes are `#1`, `#name`, … referenced from the macro body.'],
    ['when',         'Trigger clause inside a Style body. Supports `not`, `and`, `or` with normal precedence.'],
    ['resources',    'ResourceDictionary slot on Application or any Element. Children are `@key = value` entries and keyed style/template forms.'],
    ['import',       'Symbol import declaration. Declares an identifier this file references from another module.'],
    ['from',         'Source-module clause for `import`.'],
    ['not',          'Trigger negation. Inverts the truth of the term it precedes.'],
    ['and',          'Trigger conjunction. Binds tighter than `or`.'],
    ['or',           'Trigger disjunction. Compiled to multiple PropertyTriggers sharing one setter array via DNF flattening.'],
    ['targettype',   'Style/template meta-attr: the runtime class the form applies to.'],
    ['datatype',     'DataTemplate meta-attr: the class of the bound data object.'],
]);

const X_EXTENSION_DOCS: ReadonlyMap<string, string> = new Map([
    ['key',      'Keys the surrounding form in its ResourceDictionary. Required for non-implicit style / template / datatemplate.'],
    ['root',     'Marks an element in `resources:` as the application/element root. `Application.Mount(target)` looks for this flag.'],
    ['Name',     '(reserved) Names an element for sibling references.'],
    ['DataType', '(reserved) Type annotation for datatemplate scope.'],
]);

const ENUM_MEMBERS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
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

export function hover(doc: TextDocument, pos: Position): Hover | null
{
    const analysis = analyze(doc);
    const offset   = doc.offsetAt(pos);
    const hit      = tokenAt(analysis.text, offset);
    if (hit === null) return null;

    // Resource references — `@key` / `@@key`.
    if (hit.word.startsWith('@'))
    {
        const dynamic = hit.word.startsWith('@@');
        const key = hit.word.replace(/^@@?/, '');
        const def = analysis.resources.get(key);
        if (def === undefined)
        {
            return mdHover(
                `**${hit.word}** — unresolved resource key`,
                hit.range,
            );
        }
        return mdHover(formatResource(hit.word, dynamic, def), hit.range);
    }

    // Scope extensions — `x:key`, `x:root`, …
    if (hit.word.startsWith('x:'))
    {
        const ext = hit.word.slice(2);
        const desc = X_EXTENSION_DOCS.get(ext);
        return mdHover(
            desc !== undefined
                ? `**\`x:${ext}\`** — ${desc}`
                : `**\`x:${ext}\`** — scope extension`,
            hit.range,
        );
    }

    // Keywords.
    if (KEYWORDS.has(hit.word) || KEYWORD_DOCS.has(hit.word))
    {
        const desc = KEYWORD_DOCS.get(hit.word) ?? 'µ-mural keyword';
        return mdHover(`**\`${hit.word}\`** — ${desc}`, hit.range);
    }

    // PascalCase ident → either an enum class (show members) or a
    // known symbol (show module).
    if (/^[A-Z]/.test(hit.word))
    {
        const members = ENUM_MEMBERS.get(hit.word);
        if (members !== undefined)
        {
            return mdHover(
                `**\`${hit.word}\`** — enum\n\nMembers: ${members.map(m => '`' + m + '`').join(', ')}`,
                hit.range,
            );
        }
        const mod = DEFAULT_SYMBOLS.get(hit.word);
        if (mod !== undefined)
        {
            return mdHover(
                `**\`${hit.word}\`** — from \`${shortModule(mod)}\``,
                hit.range,
            );
        }
    }

    return null;
}

// ── Word extraction ─────────────────────────────────────────────────

interface TokenHit
{
    word:  string;
    range: Range;
}

// Greedy word extraction around `offset`. Recognises `@@`, `@`, `x:`
// as leading sigils so we can hover on full references like `@@theme`.
function tokenAt(text: string, offset: number): TokenHit | null
{
    let start = offset;
    let end   = offset;
    const isWordChar = (c: string) =>
        /[A-Za-z0-9_.:\-]/.test(c);   // : keeps `x:key` together; . keeps namespaced keys (`theme:primary`)
    while (start > 0 && isWordChar(text[start - 1]!)) start--;
    while (end < text.length && isWordChar(text[end]!))   end++;
    // Pull leading @ / @@ if present.
    if (start > 0 && text[start - 1] === '@')
    {
        start--;
        if (start > 0 && text[start - 1] === '@') start--;
    }
    if (start === end) return null;
    const word = text.slice(start, end);
    return {
        word,
        range: {
            start: offsetToPos(text, start),
            end:   offsetToPos(text, end),
        },
    };
}

function offsetToPos(text: string, offset: number): Position
{
    let line = 0;
    let lastNl = -1;
    for (let i = 0; i < offset; i++)
    {
        if (text[i] === '\n')
        {
            line++;
            lastNl = i;
        }
    }
    return { line, character: offset - lastNl - 1 };
}

// ── Renderers ───────────────────────────────────────────────────────

function formatResource(label: string, dynamic: boolean, def: ResourceDef): string
{
    const head = `**\`${label}\`** — ${dynamic ? 'dynamic' : 'static'} resource (${def.kind})`;
    if (def.kind !== 'value' || def.value === undefined) return head;
    const v = def.value;
    let body = '';
    switch (v.kind)
    {
        case 'color':   body = `\`#${v.raw}\``;            break;
        case 'string':  body = JSON.stringify(v.value);    break;
        case 'number':  body = v.raw;                       break;
        case 'tuple':   body = `(${v.values.length} values)`; break;
        default:        body = `(${v.kind})`;
    }
    return `${head}\n\n→ ${body}`;
}

function shortModule(mod: string): string
{
    return mod.replace('@visualisation-sub/mural/', '');
}

function mdHover(value: string, range: Range): Hover
{
    return {
        contents: { kind: MarkupKind.Markdown, value },
        range,
    };
}
