// Per-document parse + compile cache. The LSP providers all query
// here instead of re-running the pipeline themselves. Single source of
// truth keeps the cost amortised across hover / completion / definition
// requests that fire in rapid succession.
//
// Strategy:
//   1. Try Parser.ParseDocument() — if it throws ParseError, we keep
//      ast=null but still record the error for diagnostics.
//   2. If parse succeeded, run compile() to surface emit-level errors
//      (e.g. unknown control, missing x:key) without losing the AST.
//      The AST stays usable for hover / completion / definition even
//      when emit fails.
//   3. Walk the AST once to build the index of resource definitions
//      (`@key = …` and styles/templates carrying `x:key="…"`) and the
//      flat list of element nodes by source position. Providers query
//      these indices directly.

import { TextDocument } from 'vscode-languageserver-textdocument';

import {
    Parser,
    ParseError,
    compile,
    EmitError,
    type Document,
    type ElementNode,
    type KeyValueResource,
    type ResourceForm,
    type SourceSpan,
    type ValueNode,
    type Attribute,
    type BodyItem,
    type StructuredBody,
} from '@visualisation-sub/mural/compiler';

export interface ResourceDef
{
    key:    string;
    /** Span of the key itself (`@primary` or the x:key string).
     *  Used as the go-to-definition target. */
    keySpan: SourceSpan;
    /** Span of the whole declaration (used for outline ranges). */
    fullSpan: SourceSpan;
    /** For `@key = …` entries: the literal value (color, brush, …).
     *  For keyed styles/templates: undefined. */
    value?: ValueNode;
    /** Discriminates the entry kind for hover rendering. */
    kind:  'value' | 'style' | 'template' | 'datatemplate';
}

export interface DocAnalysis
{
    /** Document version that produced this analysis. */
    version: number;
    /** Raw text. */
    text:    string;
    /** Parsed AST — null when ParseError fired. */
    ast:     Document | null;
    /** Set when the lex / parse pass failed. */
    parseError: ParseError | null;
    /** Set when parse succeeded but emit failed. */
    emitError:  EmitError  | null;
    /** Resource index — all `@key` definitions and keyed style/template forms. */
    resources:  Map<string, ResourceDef>;
    /** Flat list of every ElementNode with its source span — used by
     *  hover / completion to find the element under the cursor. */
    elements:   ElementNode[];
}

const cache = new Map<string, DocAnalysis>();

export function analyze(doc: TextDocument): DocAnalysis
{
    const cached = cache.get(doc.uri);
    if (cached !== undefined && cached.version === doc.version)
    {
        return cached;
    }
    const text = doc.getText();
    const result = build(text, doc.version);
    cache.set(doc.uri, result);
    return result;
}

export function getCached(uri: string): DocAnalysis | undefined
{
    return cache.get(uri);
}

export function invalidate(uri: string): void
{
    cache.delete(uri);
}

function build(text: string, version: number): DocAnalysis
{
    const result: DocAnalysis = {
        version,
        text,
        ast:        null,
        parseError: null,
        emitError:  null,
        resources:  new Map(),
        elements:   [],
    };

    // ── Parse ──────────────────────────────────────────────────────
    let ast: Document;
    try
    {
        ast = new Parser(text).ParseDocument();
    }
    catch (e)
    {
        if (e instanceof ParseError) result.parseError = e;
        else result.parseError = new ParseError(
            e instanceof Error ? e.message : String(e),
            { start: { line: 1, column: 1, offset: 0 },
              end:   { line: 1, column: 1, offset: 0 } },
        );
        return result;
    }
    result.ast = ast;

    // ── Compile (semantic pass) ───────────────────────────────────
    // We only run compile() for its side effect of surfacing EmitErrors.
    // The emitted JS is discarded — providers work off the AST directly.
    try
    {
        compile(text);
    }
    catch (e)
    {
        if (e instanceof EmitError) result.emitError = e;
        // ParseError shouldn't fire here (parse already succeeded), but
        // if it does we swallow — we already have a good AST.
    }

    // ── Index ──────────────────────────────────────────────────────
    walk(ast, result);
    return result;
}

// Recursive AST walk. Collects resource definitions and the flat list
// of elements. Doesn't need to be selective — the AST is small and the
// walk runs once per change.
function walk(node: unknown, out: DocAnalysis): void
{
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node))
    {
        for (const child of node) walk(child, out);
        return;
    }
    const tagged = node as { kind?: unknown };
    switch (tagged.kind)
    {
        case 'document':
            walk((node as Document).forms, out);
            return;

        case 'element':
        {
            const el = node as ElementNode;
            out.elements.push(el);
            walk(el.xAttrs, out);
            walk(el.attrs,  out);
            walk(el.body,   out);
            return;
        }

        case 'structured-body':
            walk((node as StructuredBody).items, out);
            return;

        case 'key-value-resource':
        {
            const r = node as KeyValueResource;
            recordResource(out, {
                key:      r.key,
                keySpan:  r.span,
                fullSpan: r.span,
                value:    r.value,
                kind:     'value',
            });
            walk(r.value, out);
            return;
        }

        case 'resource-form':
        {
            const f = node as ResourceForm;
            const xKey = f.xAttrs.find(a => a.name === 'key');
            if (xKey !== undefined
                && xKey.value !== null
                && xKey.value.kind === 'string')
            {
                recordResource(out, {
                    key:      xKey.value.value,
                    keySpan:  xKey.span,
                    fullSpan: f.span,
                    kind:     f.keyword,
                });
            }
            walk(f.metaAttrs, out);
            walk(f.body, out);
            return;
        }

        case 'slot-assign':
        case 'named-attr':
        case 'positional-attr':
        case 'x-attr':
        case 'attr-path':
        case 'def':
        case 'setter-list':
        case 'property-setter':
        case 'trigger-group':
        case 'trigger-term':
        case 'trigger-and':
        case 'trigger-or':
            // Walk every property generically — we don't care about
            // shape here, only about hitting nested elements / resources.
            for (const v of Object.values(node)) walk(v, out);
            return;

        default:
            return;   // atomic value nodes; nothing to descend into
    }
}

function recordResource(out: DocAnalysis, def: ResourceDef): void
{
    // First definition wins. Duplicate keys are an emit-time error;
    // we'd still want the original target for go-to-def.
    if (!out.resources.has(def.key))
    {
        out.resources.set(def.key, def);
    }
}

// ── Position helpers (LSP <-> mural offsets) ──────────────────────

export interface PositionHit
{
    /** Element whose attribute list or body contains the cursor. */
    element: ElementNode | null;
    /** Innermost AST node carrying the cursor offset. */
    node:    { kind: string; span: SourceSpan } | null;
}

/** Best-effort: walks the element list and returns the innermost one
 *  whose span contains `offset`. Good enough for completion + hover.
 *  Used by the providers; not a general-purpose AST cursor. */
export function elementAt(analysis: DocAnalysis, offset: number): ElementNode | null
{
    let best: ElementNode | null = null;
    let bestSize = Infinity;
    for (const el of analysis.elements)
    {
        if (containsOffset(el.span, offset))
        {
            const size = el.span.end.offset - el.span.start.offset;
            if (size < bestSize)
            {
                best = el;
                bestSize = size;
            }
        }
    }
    return best;
}

export function containsOffset(span: SourceSpan, offset: number): boolean
{
    return offset >= span.start.offset && offset <= span.end.offset;
}

// Walk an element's attributes finding the one whose span contains
// `offset`. Returns undefined when the cursor is between attrs or
// outside the bracket list.
export function attributeAt(
    element: ElementNode,
    offset: number,
): Attribute | undefined
{
    return element.attrs.find(a => containsOffset(a.span, offset));
}

// Find the deepest body item whose span contains `offset`. Used by the
// completion provider to know whether we're inside a `resources:` slot.
export function bodyItemAt(
    body: StructuredBody | null,
    offset: number,
): BodyItem | undefined
{
    if (body === null) return undefined;
    return body.items.find(i => containsOffset(i.span, offset));
}
