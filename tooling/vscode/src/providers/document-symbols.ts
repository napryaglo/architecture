// DocumentSymbol provider for the Outline view.
//
// Produces a nested tree that mirrors the document's structure:
//
//   resources ColorPickerDemo            (Namespace)
//     @BrandColors                       (Variable)   #…
//     DataTemplate "ColorPickerTemplate" (Constructor)
//       Border #root                     (Field)
//         DockPanel
//           Border                       …nested elements…
//
// Top-level `@key = …` values, keyed styles/templates, and the element
// subtree under each template all appear, so Outline doubles as a
// structural map of the file and "Go to Symbol in File" (Ctrl+Shift+O)
// can jump to any element or resource.

import {
    DocumentSymbol,
    SymbolKind,
    Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type {
    SourceSpan,
    TopForm,
    ElementNode,
    KeyValueResource,
    ResourceForm,
    ResourcesBlock,
    ThemeBlock,
    SchemeBlock,
    StructuredBody,
    BodyItem,
    SlotAssign,
    ValueNode,
} from '@pragmatic-lab/mural/compiler';

import { analyze } from '../analyzer.js';

export function documentSymbols(doc: TextDocument): DocumentSymbol[]
{
    const analysis = analyze(doc);
    if (analysis.ast === null) return [];
    const out: DocumentSymbol[] = [];
    for (const form of analysis.ast.forms)
    {
        const sym = symbolForForm(form);
        if (sym !== null) out.push(sym);
    }
    return out;
}

// ── Top-level forms ──────────────────────────────────────────────────

function symbolForForm(form: TopForm): DocumentSymbol | null
{
    switch (form.kind)
    {
        case 'resources-block':
        case 'theme-block':
        case 'scheme-block':
        {
            const block = form as ResourcesBlock | ThemeBlock | SchemeBlock;
            const keyword =
                form.kind === 'resources-block' ? 'resources'
                    : form.kind === 'theme-block' ? 'theme'
                        : 'scheme';
            return container(
                `${keyword} ${block.name}`,
                SymbolKind.Namespace,
                block.span,
                bodyChildren(block.body),
            );
        }

        case 'resource-form':
            return symbolForResourceForm(form as ResourceForm);

        case 'element':
            return symbolForElement(form as ElementNode);

        case 'import':
            return leaf(
                `import ${(form as { name: string }).name}`,
                SymbolKind.Module,
                form.span,
            );

        default:
            return null;   // def-form / others — not structural
    }
}

// ── Body items ───────────────────────────────────────────────────────

function bodyChildren(body: StructuredBody | null): DocumentSymbol[]
{
    if (body === null) return [];
    const out: DocumentSymbol[] = [];
    for (const item of body.items)
    {
        const sym = symbolForBodyItem(item);
        if (sym !== null) out.push(sym);
    }
    return out;
}

function symbolForBodyItem(item: BodyItem): DocumentSymbol | null
{
    switch (item.kind)
    {
        case 'element':
            return symbolForElement(item as ElementNode);

        case 'key-value-resource':
            return symbolForKeyValue(item as KeyValueResource);

        case 'resource-form':
            return symbolForResourceForm(item as ResourceForm);

        case 'slot-assign':
            return symbolForSlotAssign(item as SlotAssign);

        case 'member-block':
        {
            const m = item as { name: string; body: StructuredBody; span: SourceSpan };
            return container('.' + m.name, SymbolKind.Property, m.span,
                bodyChildren(m.body));
        }

        default:
            return null;
    }
}

// `resources: { … }` and inline-template slots carry structure worth
// surfacing; scalar `Name: value` slots don't.
function symbolForSlotAssign(slot: SlotAssign): DocumentSymbol | null
{
    const value = slot.value as ValueNode | StructuredBody | ResourceForm;
    if (value.kind === 'structured-body')
    {
        const children = bodyChildren(value as StructuredBody);
        if (children.length === 0) return null;
        return container(slot.name, SymbolKind.Property, slot.span, children);
    }
    if (value.kind === 'resource-form')
    {
        const inner = symbolForResourceForm(value as ResourceForm);
        if (inner === null) return null;
        return container(slot.name, SymbolKind.Property, slot.span, [inner]);
    }
    return null;
}

// ── Leaves / sub-trees ───────────────────────────────────────────────

function symbolForKeyValue(r: KeyValueResource): DocumentSymbol
{
    return {
        name:           '@' + r.key,
        detail:         valueDetail(r.value),
        kind:           SymbolKind.Variable,
        range:          rangeOf(r.span),
        selectionRange: rangeOf(r.span),
    };
}

function symbolForResourceForm(f: ResourceForm): DocumentSymbol
{
    const keyAttr = f.xAttrs.find(a => a.name === 'key');
    const key = keyAttr?.value?.kind === 'string' ? keyAttr.value.value : undefined;
    const name = key !== undefined ? `${f.keyword} "${key}"` : f.keyword;
    const kind = f.keyword === 'Style' ? SymbolKind.Class : SymbolKind.Constructor;
    return container(name, kind, f.span, resourceFormChildren(f), keyAttr?.span);
}

function resourceFormChildren(f: ResourceForm): DocumentSymbol[]
{
    const body = f.body;
    if (body.kind === 'element')
    {
        return [symbolForElement(body as ElementNode)];
    }
    if (body.kind === 'data-template-body')
    {
        const root = (body as { root: ElementNode }).root;
        return [symbolForElement(root)];
    }
    return [];   // setter-list — property setters, not structural elements
}

function symbolForElement(el: ElementNode): DocumentSymbol
{
    return container(elementName(el), SymbolKind.Field, el.span,
        elementChildren(el));
}

function elementChildren(el: ElementNode): DocumentSymbol[]
{
    if (el.body === null || el.body.kind !== 'structured-body') return [];
    return bodyChildren(el.body as StructuredBody);
}

// `Border`, `Border #SurfacePreview`, `Border @root`. The x:name / x:key
// / x:root suffix is what distinguishes otherwise-identical elements in
// the outline.
function elementName(el: ElementNode): string
{
    for (const x of el.xAttrs)
    {
        if (x.name === 'name' && x.value?.kind === 'string')
            return `${el.name} #${x.value.value}`;
        if (x.name === 'key' && x.value?.kind === 'string')
            return `${el.name} "${x.value.value}"`;
        if (x.name === 'root')
            return `${el.name} @root`;
    }
    return el.name;
}

// ── helpers ──────────────────────────────────────────────────────────

function container(
    name: string,
    kind: SymbolKind,
    span: SourceSpan,
    children: DocumentSymbol[],
    selection?: SourceSpan,
): DocumentSymbol
{
    return {
        name,
        kind,
        range:          rangeOf(span),
        selectionRange: rangeOf(selection ?? span),
        children,
    };
}

function leaf(name: string, kind: SymbolKind, span: SourceSpan): DocumentSymbol
{
    return {
        name,
        kind,
        range:          rangeOf(span),
        selectionRange: rangeOf(span),
    };
}

function valueDetail(v: ValueNode | undefined): string
{
    if (v === undefined) return '';
    if (v.kind === 'color'  && typeof (v as { raw?: string }).raw === 'string')
        return '#' + (v as { raw: string }).raw;
    if (v.kind === 'string' && typeof (v as { value?: string }).value === 'string')
        return JSON.stringify((v as { value: string }).value);
    if (v.kind === 'number' && typeof (v as { raw?: string }).raw === 'string')
        return (v as { raw: string }).raw;
    return v.kind;
}

function rangeOf(span: SourceSpan): Range
{
    return {
        start: { line: span.start.line - 1, character: span.start.column - 1 },
        end:   { line: span.end.line   - 1, character: span.end.column   - 1 },
    };
}
