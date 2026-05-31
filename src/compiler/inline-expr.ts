// Inline-expression analyzer + lowering.
//
// The parser hands us the raw text between `{{` and `}}` as a string.
// We classify it as either:
//
//   * constant  — purely a JS subset over Math / String / literals; we
//                 evaluate at compile time and emit the result as a JS
//                 literal in the consumer's value position.
//
//   * reactive  — contains one or more `$path` references; we lower
//                 to `new MultiBinding(["path", …], (p0, p1, …) => body)`
//                 where `body` is the original text with each `$path`
//                 rewritten to its parameter name. The runtime watches
//                 every path on the host's DataContext.
//
// Anything that's neither pure JS-subset nor a `$path`-bearing
// expression is rejected with a clear error. In particular `@key` and
// `@@key` inside `{{ … }}` are reserved — the bare sigil forms outside
// the braces cover those cases.

import type { SourceSpan } from './tokens.js';

export class InlineExprError extends Error
{
    public readonly span: SourceSpan;
    constructor(message: string, span: SourceSpan)
    {
        super(`${message} (at ${span.start.line}:${span.start.column})`);
        this.span = span;
    }
}

// Whitelist of bare identifiers (and dotted-prefix roots) allowed in
// the JS body. Anything else used as a free identifier raises
// InlineExprError so the user can't accidentally pull in globals.
const ALLOWED_ROOTS: ReadonlySet<string> = new Set([
    'Math', 'String', 'Number',
    'true', 'false', 'null', 'undefined',
    'NaN', 'Infinity',
]);

export interface ConstantResult
{
    kind:  'constant';
    /** Compile-time-evaluated value, ready to be `JSON.stringify`-ed
     *  back into the emitted JS as a literal. */
    value: unknown;
}

export interface ReactiveResult
{
    kind:  'reactive';
    /** Dotted paths, in the same order as the converter's positional
     *  parameters. `$user.name` → `"user.name"`. Deduplicated. */
    paths: string[];
    /** Source text of the converter body — same as the original raw
     *  string with each `$path` reference replaced by `_p<n>`. The
     *  emitter wraps it in `(p0, p1, …) => <body>`. */
    body:  string;
}

export type LowerResult = ConstantResult | ReactiveResult;

// Lower a single `{{ … }}` body in isolation. Convenience for value-
// position emission where the inline expression doesn't share its
// path map with anything else. See lowerInlineExprWithPaths for the
// shared-map variant used by string-body merging.
export function lowerInlineExpr(raw: string, span: SourceSpan): LowerResult
{
    const shared = new Map<string, string>();
    return lowerInlineExprWithPaths(raw, span, shared);
}

// Variant that lets the caller drive parameter allocation across
// multiple expression bodies. Mutates `sharedPaths`, mapping each new
// path to a generated `_p<N>` parameter name where N continues from
// the map's current size. The returned ReactiveResult lists ONLY the
// paths discovered in *this* expression body; the caller maintains the
// combined list via `sharedPaths.keys()`.
//
// Used by the compiler when lowering a string-body whose chunks each
// carry their own inline expression: every chunk shares the same path
// → param map so the final converter takes one positional argument per
// distinct binding.
export function lowerInlineExprWithPaths(
    raw: string,
    span: SourceSpan,
    sharedPaths: Map<string, string>,
): LowerResult
{
    const tokens = tokenize(raw, span);
    const localPaths: string[] = [];   // paths introduced by *this* body
    const tokenPath = new Map<number, string>();

    for (let i = 0; i < tokens.length; i++)
    {
        const t = tokens[i]!;
        if (t.kind === 'dollar-path')
        {
            const path = t.text.slice(1);
            let name = sharedPaths.get(path);
            if (name === undefined)
            {
                name = `_p${sharedPaths.size}`;
                sharedPaths.set(path, name);
                localPaths.push(path);
            }
            tokenPath.set(i, name);
            continue;
        }
        if (t.kind === 'ident')
        {
            // Member access — `Math.sqrt`, `String.fromCharCode` — is
            // fine regardless of the property name, because the root
            // was already whitelist-checked. Detect by looking back
            // for a `.` punctuation token.
            const prev = previousNonTrivia(tokens, i);
            if (prev !== undefined && prev.kind === 'punct' && prev.text === '.')
            {
                continue;
            }
            if (!ALLOWED_ROOTS.has(t.text))
            {
                throw new InlineExprError(
                    `identifier '${t.text}' is not allowed in inline expressions ` +
                    `(allowed: ${[...ALLOWED_ROOTS].join(', ')} and \`$path\`)`,
                    span);
            }
        }
    }

    if (tokenPath.size === 0)
    {
        // Constant — evaluate. `Math`, `String`, etc. are globals so
        // the returned function picks them up without a captured scope.
        try
        {
            const fn = new Function(`"use strict"; return (${raw});`);
            return { kind: 'constant', value: fn() };
        }
        catch (e)
        {
            throw new InlineExprError(
                `inline expression failed to evaluate: ${(e as Error).message}`,
                span);
        }
    }

    const body = rewriteWithParams(raw, tokens, tokenPath);
    return { kind: 'reactive', paths: localPaths, body };
}

// ── Token model ─────────────────────────────────────────────────────

interface JsToken
{
    kind:   'ident' | 'dollar-path' | 'number' | 'string' | 'punct' | 'op';
    text:   string;
    /** Inclusive start, exclusive end — offsets into the raw expression
     *  text (NOT the source file). Used for the rewrite pass. */
    start:  number;
    end:    number;
}

// Lightweight JS-subset tokenizer. Recognises the operators we care
// about and groups consecutive operator chars; identifiers, strings,
// numbers, and punctuation get their own tokens. `$ident.tail.…` is
// captured as a single `dollar-path` token whose text includes the
// `$` prefix.
function tokenize(raw: string, span: SourceSpan): JsToken[]
{
    const out: JsToken[] = [];
    let i = 0;
    while (i < raw.length)
    {
        const c = raw[i]!;

        // Whitespace.
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r')
        {
            i++;
            continue;
        }

        // `$path.tail.…` — captured as one token.
        if (c === '$')
        {
            const start = i;
            i++;
            if (!isIdentStart(raw[i])) throw new InlineExprError(
                "expected an identifier after `$` inside inline expression", span);
            while (i < raw.length && isIdentPart(raw[i]!)) i++;
            while (raw[i] === '.' && isIdentStart(raw[i + 1]))
            {
                i++;
                while (i < raw.length && isIdentPart(raw[i]!)) i++;
            }
            out.push({ kind: 'dollar-path', text: raw.slice(start, i), start, end: i });
            continue;
        }

        // `@key` / `@@key` — reserved inside inline expressions.
        if (c === '@')
        {
            throw new InlineExprError(
                "resource references (`@key` / `@@key`) inside `{{ … }}` are not supported — use the sigil form outside the braces",
                span);
        }

        // Strings — preserve escapes.
        if (c === '"' || c === "'")
        {
            const start = i;
            const quote = c;
            i++;
            while (i < raw.length && raw[i] !== quote)
            {
                if (raw[i] === '\\') { i += 2; continue; }
                i++;
            }
            if (i >= raw.length) throw new InlineExprError(
                "unterminated string inside inline expression", span);
            i++;
            out.push({ kind: 'string', text: raw.slice(start, i), start, end: i });
            continue;
        }

        // Numbers — basic decimal form. Sign handled via unary minus
        // by the JS evaluator; we just lex the digits.
        if (isDigit(c) || (c === '.' && isDigit(raw[i + 1])))
        {
            const start = i;
            while (i < raw.length && (isDigit(raw[i]!) || raw[i] === '.')) i++;
            out.push({ kind: 'number', text: raw.slice(start, i), start, end: i });
            continue;
        }

        // Identifier.
        if (isIdentStart(c))
        {
            const start = i;
            while (i < raw.length && isIdentPart(raw[i]!)) i++;
            out.push({ kind: 'ident', text: raw.slice(start, i), start, end: i });
            continue;
        }

        // Operator chars.
        if ('+-*/%<>=!&|?:'.includes(c))
        {
            const start = i;
            while (i < raw.length && '+-*/%<>=!&|?:'.includes(raw[i]!)) i++;
            out.push({ kind: 'op', text: raw.slice(start, i), start, end: i });
            continue;
        }

        // Punctuation.
        if ('().,[]'.includes(c))
        {
            out.push({ kind: 'punct', text: c, start: i, end: i + 1 });
            i++;
            continue;
        }

        throw new InlineExprError(
            `unexpected character '${c}' inside inline expression`, span);
    }
    return out;
}

function isIdentStart(c: string | undefined): boolean
{
    if (c === undefined) return false;
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}
function isIdentPart(c: string): boolean
{
    return isIdentStart(c) || (c >= '0' && c <= '9');
}
function isDigit(c: string | undefined): boolean
{
    if (c === undefined) return false;
    return c >= '0' && c <= '9';
}

// Walk back through tokens looking for the most recent non-trivia
// token — but since the tokenizer already drops whitespace, "previous"
// is just `tokens[i - 1]`. Wrapped as a function so the intent is
// obvious in the analyzer's call site.
function previousNonTrivia(tokens: JsToken[], i: number): JsToken | undefined
{
    return i > 0 ? tokens[i - 1] : undefined;
}

// ── Rewrite ─────────────────────────────────────────────────────────

// Build the converter body by replacing each dollar-path token's text
// with its parameter name and preserving everything else verbatim.
// Walking the original raw string keeps whitespace + comments intact.
function rewriteWithParams(
    raw: string,
    tokens: JsToken[],
    tokenPath: Map<number, string>,
): string
{
    let out = '';
    let cursor = 0;
    for (let i = 0; i < tokens.length; i++)
    {
        const t = tokens[i]!;
        const name = tokenPath.get(i);
        if (name === undefined) continue;
        out += raw.slice(cursor, t.start);
        out += name;
        cursor = t.end;
    }
    out += raw.slice(cursor);
    return out;
}
