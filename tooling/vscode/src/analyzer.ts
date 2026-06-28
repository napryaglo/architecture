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
    type ResourcesBlock,
    type ThemeBlock,
    type SchemeBlock,
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
    /** Discriminates the entry kind for hover rendering. Mirrors
     *  `ResourceForm['keyword']` plus the `'value'` form for `@key = …`
     *  primitive entries. */
    kind:  'value' | ResourceForm['keyword'];
}

// Resource-form context surface — every Style / Template / DataTemplate /
// HierarchicalDataTemplate / ItemsPanelTemplate in the document, plus the
// metadata the LSP needs to provide contextual completions inside that
// form's body. The completion provider queries `resourceFormAt(offset)`
// to know whether the cursor is inside, say, a `Style[targettype=Border]`
// body — and if so what DPs to surface.
export interface ResourceFormContext
{
    keyword:    ResourceForm['keyword'];
    /** Span of the entire resource form. */
    fullSpan:   SourceSpan;
    /** Span of the body braces — i.e. the region where the cursor
     *  triggers in-body completions. Open `{` to close `}` inclusive. */
    bodySpan:   SourceSpan;
    /** `targettype` (Style / Template) or `datatype` (DataTemplate /
     *  HierarchicalDataTemplate) value — used to look up the class
     *  for DP enumeration. Undefined for forms that don't carry the
     *  attribute (ItemsPanelTemplate) or when the meta-attr was
     *  omitted entirely. */
    targetType: string | undefined;
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
    /** Flat list of every Style / Template / DataTemplate /
     *  HierarchicalDataTemplate / ItemsPanelTemplate in the document
     *  with its body span + targetType, used by the completion
     *  provider for in-body context detection. */
    resourceForms: ResourceFormContext[];
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

// Parse-only resource extraction for files that aren't open in the editor
// (the workspace index calls this for every .mu it scans). Deliberately
// skips the compile() semantic pass — running the full emitter across the
// whole workspace would be far too costly, and the resource index only
// needs the declaration spans the AST already carries. Returns an empty
// list when the file doesn't parse.
export function collectResources(text: string): ResourceDef[]
{
    let ast: Document;
    try
    {
        ast = new Parser(text).ParseDocument();
    }
    catch
    {
        return [];
    }
    const scratch: DocAnalysis = {
        version: -1,
        text,
        ast,
        parseError: null,
        emitError:  null,
        resources:  new Map(),
        elements:   [],
        resourceForms: [],
    };
    walk(ast, scratch);
    return [...scratch.resources.values()];
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
        resourceForms: [],
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

        // Named top-level dictionary/theme/scheme blocks. Every real demo
        // and theme wraps its `@key`s and styles/templates inside one of
        // these, so the index would be empty without descending here.
        case 'resources-block':
            walk((node as ResourcesBlock).body, out);
            return;

        case 'theme-block':
            walk((node as ThemeBlock).body, out);
            return;

        case 'scheme-block':
            walk((node as SchemeBlock).body, out);
            return;

        case 'element':
        {
            const el = node as ElementNode;
            out.elements.push(el);
            // A keyed element (`ColorScheme x:key="BrandColors" [ … ]`) is a
            // value-object resource — referenceable via `@BrandColors` just
            // like a `@key = …` entry. (x:name is an element name, not a
            // dictionary key, so only x:key is recorded.)
            const xKey = el.xAttrs.find(a => a.name === 'key');
            if (xKey !== undefined
                && xKey.value !== null
                && xKey.value.kind === 'string')
            {
                recordResource(out, {
                    key:      xKey.value.value,
                    keySpan:  xKey.span,
                    fullSpan: el.span,
                    kind:     'value',
                });
            }
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
            // Record the in-body context so the completion provider
            // can offer DP names against the form's targettype. Body
            // span is approximated as everything strictly inside the
            // form's outer span minus the metadata prefix — good
            // enough for a "is cursor inside the body" containment
            // check; the precise `{` … `}` span isn't carried on
            // ResourceForm today.
            out.resourceForms.push({
                keyword:    f.keyword,
                fullSpan:   f.span,
                bodySpan:   bodySpanOf(f, out.text),
                targetType: pickTargetTypeMeta(f),
            });
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

// True body span — the region strictly inside the resource form's
// `{ … }` braces. We scan the source text from the form's start
// looking for the first un-nested `{` (the body opener); pair it with
// the form's end offset minus 1 (which points at the closing `}`).
//
// `f.body.span.start` would seem like the obvious answer but the parser
// puts it at the FIRST token of the body's first item — for an empty
// body or a cursor sitting on the line right after `{` (before any
// setter), that span misses the cursor and `resourceFormAt` returns
// undefined, suppressing in-body completions. Scanning the text fixes
// that.
function bodySpanOf(f: ResourceForm, text: string): SourceSpan
{
    let openIdx = -1;
    let inString = false;
    let stringChar = '';
    let bracketDepth = 0;
    for (let i = f.span.start.offset; i < f.span.end.offset; i++)
    {
        const c = text[i];
        if (inString)
        {
            if (c === '\\') { i++; continue; }
            if (c === stringChar) inString = false;
            continue;
        }
        if (c === '"' || c === '\'') { inString = true; stringChar = c; continue; }
        if (c === '[') bracketDepth++;
        else if (c === ']') bracketDepth--;
        else if (c === '{' && bracketDepth === 0) { openIdx = i; break; }
    }
    if (openIdx < 0)
    {
        // No body brace found — fall back to the parser-reported body
        // span. Better to over-restrict than to return a bogus span.
        return { start: f.body.span.start, end: f.span.end };
    }
    // Body interior = (openIdx + 1) … (f.span.end - 1). We DON'T have
    // a per-character line/column converter here; SourceSpan carries
    // {line, column, offset}, but resourceFormAt only consults
    // `.offset` for containment, so synthesizing the line/column on
    // the brace position with zeros is harmless for the LSP path.
    const startPos = positionAt(text, openIdx + 1);
    const endPos   = f.span.end;
    return { start: startPos, end: endPos };
}

// Offset → SourceSpan position helper. We can't reuse the parser's
// counter here (it works per-document on the way down); a linear scan
// is fine because we only run this once per resource form.
function positionAt(text: string, offset: number): { line: number; column: number; offset: number }
{
    let line = 1, col = 1;
    for (let i = 0; i < offset && i < text.length; i++)
    {
        if (text[i] === '\n') { line++; col = 1; }
        else col++;
    }
    return { line, column: col, offset };
}

// `targettype` for Style / Template, `datatype` for DataTemplate /
// HierarchicalDataTemplate, undefined for ItemsPanelTemplate (no
// type-bearing meta) and for any form where the attribute is omitted
// or carries a non-ident value.
function pickTargetTypeMeta(f: ResourceForm): string | undefined
{
    const wanted =
        (f.keyword === 'DataTemplate' || f.keyword === 'HierarchicalDataTemplate')
            ? 'datatype'
            : (f.keyword === 'Style' || f.keyword === 'Template')
                ? 'targettype'
                : undefined;
    if (wanted === undefined) return undefined;
    const m = f.metaAttrs.find(
        a => a.path.parts.length === 1 && a.path.parts[0] === wanted);
    if (m === undefined || m.value.kind !== 'ident') return undefined;
    return m.value.name;
}

// Innermost resource-form context whose body span contains `offset`.
// "Innermost" matters for nested forms — e.g. a `Style` inside a
// `Resources` slot inside a `DataTemplate` body — so the cursor sees
// the closest target type's DPs first. Returns undefined when the
// cursor is not inside any resource-form body.
export function resourceFormAt(
    analysis: DocAnalysis, offset: number,
): ResourceFormContext | undefined
{
    let best: ResourceFormContext | undefined;
    let bestSize = Infinity;
    for (const rf of analysis.resourceForms)
    {
        if (offset >= rf.bodySpan.start.offset && offset <= rf.bodySpan.end.offset)
        {
            const size = rf.bodySpan.end.offset - rf.bodySpan.start.offset;
            if (size < bestSize)
            {
                best = rf;
                bestSize = size;
            }
        }
    }
    return best;
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
