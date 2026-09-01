// Workspace-symbol provider (Ctrl+T / "Go to Symbol in Workspace").
//
// Surfaces every resource key declared anywhere in the workspace — the
// same global index that backs cross-file go-to-definition. Typing a few
// letters of a token name (`Primary`, `BrandColors`, a style key) jumps
// straight to its declaration, across files.

import {
    SymbolInformation,
    SymbolKind,
    Range,
} from 'vscode-languageserver/node.js';

import type { SourceSpan } from '@pragmatic-tech-ai/mural/compiler';

import type { ResourceDef } from '../analyzer.js';
import { WorkspaceIndex, type IndexedResource } from '../workspace-index.js';

// Cap results so a blank query (VS Code sends "" to populate the picker)
// doesn't flood the client with thousands of entries.
const MAX_RESULTS = 512;

export function workspaceSymbols(
    query: string,
    index: WorkspaceIndex,
): SymbolInformation[]
{
    const needle = query.toLowerCase();
    const out: SymbolInformation[] = [];
    for (const def of index.all())
    {
        if (needle.length > 0 && !def.key.toLowerCase().includes(needle)) continue;
        out.push({
            name:          symbolName(def),
            kind:          kindFor(def.kind),
            location:      { uri: def.uri, range: rangeOf(def.keySpan) },
            containerName: containerOf(def.uri),
        });
        if (out.length >= MAX_RESULTS) break;
    }
    return out;
}

function symbolName(def: IndexedResource): string
{
    return def.kind === 'value' ? '@' + def.key : `${def.kind} "${def.key}"`;
}

function containerOf(uri: string): string
{
    const slash = uri.lastIndexOf('/');
    return slash >= 0 ? decodeURIComponent(uri.slice(slash + 1)) : uri;
}

type ResourceDefKind = ResourceDef['kind'];

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
        default:                         return SymbolKind.Variable;
    }
}

function rangeOf(span: SourceSpan): Range
{
    return {
        start: { line: span.start.line - 1, character: span.start.column - 1 },
        end:   { line: span.end.line   - 1, character: span.end.column   - 1 },
    };
}
