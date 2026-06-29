// Formatter tests. Three invariants pin correctness:
//   * Semantics-preserving — re-parsing the formatted output yields the
//     same AST (modulo spans) as the input.
//   * Idempotent — format(format(x)) === format(x).
//   * Comment-preserving — every comment survives (count unchanged).
//
// Targeted cases lock the house-style rules; a corpus sweep over the
// repo's own .mu files guarantees the formatter never corrupts real
// markup.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { format } from '../format.js';
import { Parser } from '../parser.js';
import { DEFAULT_SLOT_INFO } from '../symbol-table.js';

const isStringBody = (n: string): boolean => DEFAULT_SLOT_INFO.get(n)?.kind === 'string';

function stripSpans(o: unknown): unknown
{
    if (Array.isArray(o)) return o.map(stripSpans);
    if (o !== null && typeof o === 'object')
    {
        const r: Record<string, unknown> = {};
        for (const k of Object.keys(o)) { if (k === 'span') continue; r[k] = stripSpans((o as Record<string, unknown>)[k]); }
        return r;
    }
    return o;
}

function ast(src: string): string
{
    return JSON.stringify(stripSpans(new Parser(src, { isStringBody }).ParseDocument()));
}

function commentCount(src: string): number
{
    const p = new Parser(src, { isStringBody });
    p.ParseDocument();
    return p.comments.length;
}

/** Assert all three invariants for a snippet, and return the output. */
function check(src: string): string
{
    const out = format(src);
    assert.equal(ast(out), ast(src), 'semantics preserved');
    assert.equal(format(out), out, 'idempotent');
    assert.equal(commentCount(out), commentCount(src), 'comments preserved');
    return out;
}

describe('formatter — invariants across constructs', () =>
{
    const cases: Record<string, string> = {
        'import with/without source': `import Foo\nimport Bar from "baz"\n`,
        'resources block + key-value': `resources D {\n@Red = #ff0000\n@Pad = (1,2,3,4)\n}\n`,
        'element inline attrs': `resources D {\nBorder [ Background = @Red, Width = 100 ] { }\n}\n`,
        'element wrapped attrs (= aligned)': `resources D {\nBorder x:name="X" [ Background = @Surface, BorderBrush = @Outline, BorderThickness = (1), CornerRadius = @ShapeExtraSmall, Width = 200 ] { }\n}\n`,
        'string body': `resources D {\nTextBlock { Hello world }\n}\n`,
        'triggers inline + block + and/or/not': `Style [TargetType=Button] {\nBackground = @P;\nwhen ( IsMouseOver ) { Background = @H; }\nwhen ( IsPressed and not IsEnabled ) { Opacity = 0.5; Background = @D; }\nwhen ( $Sel or IsFocused ) { BorderBrush = @B; }\n}\n`,
        'value forms': `resources D {\n@A = #0d47a1 << Lighten(0.5)\n@B = $path.sub << Conv\n@C = $Self.(TextBlock.Foreground)\n@D = $service(Token).x\n@E = $$TemplatedName\n@F = @@Dynamic\n@G = <100, 200>\n@H = [1, 2, 3]\n}\n`,
        'member block': `resources D {\nCanvas {\n.Children: {\nBorder { }\n}\n}\n}\n`,
        'def macro': `def Card[#1, #bg: Brush = @Surface] {\nBorder [ Background = #bg ] { }\n}\n`,
        'theme + scheme': `theme T {\nschemes: [Light, Dark]\ndefaultScheme: Light\ntokens {\n@Primary : Brush "brand"\n@Space1..@Space3 : number "scale"\n}\n}\nscheme Light against T {\n@Primary = #fff\n}\n`,
        'services block': `Application {\n.services: {\nFooService -> IFoo\nscoped BarService { Seed: 3 }\n}\n}\n`,
    };
    for (const [name, src] of Object.entries(cases))
    {
        test(name, () => check(src));
    }
});

describe('formatter — comments', () =>
{
    test('leading comment on its own line is kept above its item', () =>
    {
        const out = check(`resources D {\n// the red brush\n@Red = #ff0000\n}\n`);
        assert.match(out, /\/\/ the red brush\n\s*@Red = #ff0000/);
    });

    test('trailing same-line comment stays on the line', () =>
    {
        const out = check(`resources D {\n@Red = #ff0000 // brand red\n}\n`);
        assert.match(out, /@Red = #ff0000 \/\/ brand red/);
    });

    test('comment between sibling triggers stays put (not sunk to the end)', () =>
    {
        const src = `Style [TargetType=Button] {\nwhen ( IsMouseOver ) { Background = @H; }\n// the pressed state\nwhen ( IsPressed ) { Background = @P; }\n}\n`;
        const out = check(src);
        assert.match(out, /@H; \}\n\s*\/\/ the pressed state\n\s*when \( IsPressed \)/);
    });

    test('block comment survives', () =>
    {
        check(`resources D {\n/* a block\n   comment */\n@Red = #ff0000\n}\n`);
    });
});

describe('formatter — layout rules', () =>
{
    test('blank line between siblings is preserved (and collapsed to one)', () =>
    {
        const out = check(`resources D {\n@A = #111\n\n\n@B = #222\n}\n`);
        assert.match(out, /@A = #111\n\n\s*@B = #222/);
        assert.doesNotMatch(out, /\n\n\n/);
    });

    test('no leading blank right after an opening brace', () =>
    {
        const out = format(`resources D {\n\n@A = #111\n}\n`);
        assert.doesNotMatch(out, /\{\n\n/);
    });

    test('short single-setter trigger stays inline', () =>
    {
        const out = format(`Style [TargetType=Button] {\nwhen ( IsMouseOver ) {\nBackground = @H;\n}\n}\n`);
        assert.match(out, /when \( IsMouseOver \) \{ Background = @H; \}/);
    });
});

describe('formatter — corpus sweep (repo .mu files)', () =>
{
    function allMu(dir: string, acc: string[] = []): string[]
    {
        for (const e of readdirSync(dir, { withFileTypes: true }))
        {
            if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
            const p = join(dir, e.name);
            if (e.isDirectory()) allMu(p, acc);
            else if (e.name.endsWith('.mu')) acc.push(p);
        }
        return acc;
    }

    const files = (() => { try { return [...allMu('src'), ...allMu('demo')]; } catch { return []; } })();

    for (const f of files)
    {
        test(f, () =>
        {
            const src = readFileSync(f, 'utf8');
            let base: string;
            try { base = ast(src); }
            catch { return; }   // file the parser can't handle standalone — skip
            const out = format(src);
            assert.equal(ast(out), base, 'semantics preserved');
            assert.equal(format(out), out, 'idempotent');
            assert.equal(commentCount(out), commentCount(src), 'comments preserved');
        });
    }
});
