// Go-to-definition. Jumps from a resource reference to its declaration:
//
//   `@primary`   → the `@primary = …` line
//   `@@theme`    → the `@theme = …` line (dynamic refs resolve to same target)
//
// Resolution is workspace-wide: a same-file declaration wins (jump
// straight there), otherwise we consult the workspace index, which holds
// every `@key` declared across every `.mu` — theme schemes, shared
// dictionaries, sibling demos. A key declared in several files (e.g.
// @Primary in both light.mu and dark.mu) returns every location so the
// editor offers the list.
//
// Style/template references via `Background = "DangerButton"` aren't
// covered yet (no syntax to distinguish a string from a key reference);
// once we add `=>StyleKey` or similar this provider extends naturally.

import {
    Location,
    Position,
    Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type { SourceSpan } from '@pragmatic-lab/mural/compiler';

import {
    analyze,
    type DocAnalysis,
} from '../analyzer.js';
import { WorkspaceIndex } from '../workspace-index.js';

export function definition(
    doc: TextDocument,
    pos: Position,
    index: WorkspaceIndex,
): Location | Location[] | null
{
    const analysis = analyze(doc);
    const offset   = doc.offsetAt(pos);

    const refKey = referenceAt(analysis.text, offset);
    if (refKey === null) return null;

    // Same-file declaration wins — most specific, no ambiguity.
    const local = analysis.resources.get(refKey);
    if (local !== undefined) return target(doc.uri, local.keySpan);

    // Otherwise resolve across the workspace.
    const hits = index.lookup(refKey);
    if (hits.length === 0) return null;
    if (hits.length === 1) return target(hits[0]!.uri, hits[0]!.keySpan);
    return hits.map(h => target(h.uri, h.keySpan));
}

// Extract the resource-key under the cursor. Returns the bare key (no
// `@` or `@@` prefix) so the caller can look it up in the resources
// index. Falls through on anything that isn't a resource reference.
function referenceAt(text: string, offset: number): string | null
{
    // Walk left from the cursor to find the start of the reference.
    let i = offset;
    const isKeyChar = (c: string) => /[A-Za-z0-9_:.-]/.test(c);
    while (i > 0 && isKeyChar(text[i - 1]!)) i--;
    // Now text[i..] is the key body; preceding chars must be `@` or `@@`.
    if (i === 0) return null;
    const head = text[i - 1]!;
    if (head !== '@') return null;

    // Walk right to find the end.
    let j = offset;
    while (j < text.length && isKeyChar(text[j]!)) j++;
    const key = text.slice(i, j);
    if (key.length === 0) return null;
    return key;
}

function target(uri: string, span: SourceSpan): Location
{
    const range: Range = {
        start: { line: span.start.line - 1, character: span.start.column - 1 },
        end:   { line: span.end.line   - 1, character: span.end.column   - 1 },
    };
    return { uri, range };
}

// Re-export the analysis type so server.ts can use it without round-
// tripping through analyzer.ts. (Avoids one import in server.ts for
// the same shape this provider depends on.)
export type { DocAnalysis };
