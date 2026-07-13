import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';
import { format } from '../format.js';

// `Style = @h1 + @hypertext` — the markup style-composition operator `+`,
// lowered to `Style.Combine(...)`. Operands are `@resource` Style refs:
// a style declared earlier in THIS dictionary emits its local JS var
// (eager), a cross-dictionary token emits a deferred `() =>
// Application.current?.Resources.Resolve(key)` thunk (resolved at Seal).

function emitted(src: string): string
{
    return compile(src).js;
}

const wrap = (styleAttr: string, extra = ''): string => `
    import Foo from "./foo.mjs"
    resources T {
        ${extra}
        DataTemplate x:key="t" [DataType=Foo] {
            Border x:root [ ${styleAttr} ]
        }
    }
`;

describe('markup style composition `+`', () => {
    test('two cross-dictionary tokens → Style.Combine of two thunks', () => {
        const js = emitted(wrap('Style = @Heading + @Hypertext'));
        assert.match(js, /Style\.Combine\(/);
        assert.match(js, /\(\) => Application\.current\?\.Resources\.Resolve\("Heading"\)/);
        assert.match(js, /\(\) => Application\.current\?\.Resources\.Resolve\("Hypertext"\)/);
        // Style is auto-imported from the runtime barrel.
        assert.match(js, /import \{[^}]*\bStyle\b[^}]*\} from "mural\/runtime"/);
    });

    test('a same-scope local style operand uses its JS var (eager, not a Resolve thunk)', () => {
        // At dictionary scope a `@key` for a style declared earlier in the
        // SAME block resolves to the in-scope JS var (the localResourceVars
        // fast path, shared with Style BasedOn); a cross-dictionary token
        // still defers. (Inside a template body the closure boundary makes
        // even a same-file token defer — verified by the other tests.)
        const js = emitted(`
            resources T {
                Style x:key="Local" [TargetType=Border] { Padding = (8); }
                Border x:key="w" [ Style = @Local + @Hypertext ]
            }
        `);
        // First operand is the in-scope var (`_styleN`), not a Resolve thunk;
        // the cross-dict operand defers. (A `Resolve("Local")` DOES appear
        // elsewhere — in the generated `get Local()` accessor — so we pin the
        // shape inside Style.Combine rather than a blanket absence check.)
        assert.match(js, /Style\.Combine\(_style\d+, \(\) => Application\.current\?\.Resources\.Resolve\("Hypertext"\)\)/);
    });

    test('three-way composition preserves left-to-right order', () => {
        const js = emitted(wrap('Style = @A + @B + @C'));
        const rest = js.slice(js.indexOf('Style.Combine('));
        const iA = rest.indexOf('"A"');
        const iB = rest.indexOf('"B"');
        const iC = rest.indexOf('"C"');
        assert.ok(iA >= 0 && iA < iB && iB < iC, 'operands emit in source order A, B, C');
    });

    test('a non-@resource operand is a compile error', () => {
        assert.throws(
            () => emitted(wrap('Style = @Heading + 5')),
            /style composition .* operands must be .@resource/,
        );
    });

    test('formatter round-trips the `+` operator', () => {
        const src = wrap('Style = @Heading + @Hypertext');
        const once  = format(src);
        assert.match(once, /@Heading \+ @Hypertext/);
        // Idempotent.
        assert.equal(format(once), once);
    });
});
