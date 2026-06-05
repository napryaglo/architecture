// DocumentSymbol provider for the Outline view. Surfaces:
//
//   - Each `@key = …` resource (Variable kind)
//   - Each keyed `style "Foo"` / `template "Bar"` / `datatemplate "…"`
//     (Class kind for style, Constructor for the templates)
//
// Falls back to a flat list (SymbolInformation) since the resource
// declarations don't nest naturally in mural — they all live one level
// deep in a `resources:` slot. Outline view renders the flat list as a
// single tier, which is what the user wants here.

import {
    DocumentSymbol,
    SymbolKind,
    Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type { SourceSpan } from '@visualisation-sub/mural/compiler';

import { analyze } from '../analyzer.js';

export function documentSymbols(doc: TextDocument): DocumentSymbol[]
{
    const analysis = analyze(doc);
    const out: DocumentSymbol[] = [];
    for (const def of analysis.resources.values())
    {
        out.push({
            name:           def.kind === 'value' ? '@' + def.key : `${def.kind} "${def.key}"`,
            detail:         def.kind === 'value' ? formatValueDetail(def) : '',
            kind:           kindFor(def.kind),
            range:          rangeOf(def.fullSpan),
            selectionRange: rangeOf(def.keySpan),
        });
    }
    return out;
}

type ResourceDefKind = 'value'
    | 'Style' | 'Template' | 'DataTemplate'
    | 'HierarchicalDataTemplate' | 'ItemsPanelTemplate';

function kindFor(kind: ResourceDefKind): SymbolKind
{
    switch (kind)
    {
        case 'value':                    return SymbolKind.Variable;
        case 'Style':                    return SymbolKind.Class;
        case 'Template':                 return SymbolKind.Constructor;
        case 'DataTemplate':             return SymbolKind.Constructor;
        case 'HierarchicalDataTemplate': return SymbolKind.Constructor;
        case 'ItemsPanelTemplate':       return SymbolKind.Constructor;
    }
}

function formatValueDetail(def: { value?: { kind: string; raw?: string; value?: unknown } }): string
{
    const v = def.value;
    if (v === undefined) return '';
    if (v.kind === 'color' && typeof v.raw === 'string')   return '#' + v.raw;
    if (v.kind === 'string' && typeof v.value === 'string') return JSON.stringify(v.value);
    if (v.kind === 'number' && typeof v.raw === 'string')   return v.raw;
    return v.kind;
}

function rangeOf(span: SourceSpan): Range
{
    return {
        start: { line: span.start.line - 1, character: span.start.column - 1 },
        end:   { line: span.end.line   - 1, character: span.end.column   - 1 },
    };
}
