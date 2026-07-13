// LSP server entry. Runs in a Node subprocess spawned by the client
// (see ../extension.ts). All language intelligence lives in `providers/`;
// the server just wires connection events to the appropriate provider
// call.
//
// We side-effect-import the runtime, basic and visual-engine barrel
// modules so every class's `static { Model.RegisterProperty(...) }`
// block fires once at server boot. The completion provider then asks
// `Model.find_class(name)` + `Model.EnumerateProperties(klass)` to
// list the DPs available for any target type referenced from .mu
// sources — without this import the registry is empty when the user
// first opens a .mu file.
import 'mural/runtime';
import 'mural/basic';
import 'mural/visual-engine';
//
// Lifecycle:
//   1. The client sends `initialize` — we declare our capabilities.
//   2. The TextDocuments manager streams document open / change / close
//      events to us; on each change we run the analyzer and publish
//      diagnostics.
//   3. Request handlers (completion, hover, definition, document
//      symbols) call the analyzer's cached result.

import { fileURLToPath } from 'node:url';

import {
    createConnection,
    InitializeParams,
    InitializeResult,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
} from 'vscode-languageserver/node.js';

import { TextDocument } from 'vscode-languageserver-textdocument';

import {
    analyze,
    invalidate,
    runEmitPass,
} from './analyzer.js';
import { WorkspaceIndex } from './workspace-index.js';
import { diagnosticsFor } from './providers/diagnostics.js';
import { completions }    from './providers/completion.js';
import { hover }          from './providers/hover.js';
import { definition }     from './providers/definition.js';
import { documentSymbols } from './providers/document-symbols.js';
import { workspaceSymbols } from './providers/workspace-symbols.js';
import { formatting }       from './providers/formatting.js';
import {
    semanticTokens,
    TOKEN_TYPES,
    TOKEN_MODIFIERS,
} from './providers/semantic-tokens.js';

const connection = createConnection(ProposedFeatures.all);
const documents  = new TextDocuments(TextDocument);

// Global resource index across every .mu in the workspace — backs
// cross-file go-to-definition and the workspace-symbol search. Populated
// on `initialized`; kept fresh by document edits and watched-file events.
const workspaceIndex = new WorkspaceIndex();
const workspaceRoots: string[] = [];

connection.onInitialize((params: InitializeParams): InitializeResult => {
    // Record workspace roots (folders preferred; fall back to the legacy
    // rootUri) so we can scan them once the client is ready.
    if (params.workspaceFolders != null)
    {
        for (const folder of params.workspaceFolders)
        {
            const p = uriToPath(folder.uri);
            if (p !== null) workspaceRoots.push(p);
        }
    }
    else if (params.rootUri != null)
    {
        const p = uriToPath(params.rootUri);
        if (p !== null) workspaceRoots.push(p);
    }

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                // Triggers cover the sigils that change completion context.
                triggerCharacters: ['@', ':', '.', '=', ' '],
                resolveProvider:   false,
            },
            hoverProvider:            true,
            definitionProvider:       true,
            documentSymbolProvider:   true,
            workspaceSymbolProvider:  true,
            documentFormattingProvider: true,
            semanticTokensProvider: {
                legend: {
                    tokenTypes:     [...TOKEN_TYPES],
                    tokenModifiers: [...TOKEN_MODIFIERS],
                },
                full:  true,
                range: false,
            },
        },
    };
});

// Build the cross-file index once the client has finished initializing.
connection.onInitialized(() => {
    void workspaceIndex.scan(workspaceRoots).then(() => {
        connection.console.log(
            `mural: indexed resources across ${workspaceIndex.fileCount} .mu file(s)`,
        );
    });
});

function uriToPath(uri: string): string | null
{
    if (!uri.startsWith('file:')) return null;
    try { return fileURLToPath(uri); }
    catch { return null; }
}

// ── Sync ────────────────────────────────────────────────────────────

documents.onDidChangeContent(event => {
    scheduleDiagnostics(event.document);
    // Reflect unsaved edits in the cross-file index so go-to-definition
    // and workspace symbols track the live buffer, not the last save.
    workspaceIndex.indexText(event.document.uri, event.document.getText());
});

documents.onDidClose(event => {
    invalidate(event.document.uri);
    const pending = diagTimers.get(event.document.uri);
    if (pending !== undefined) { clearTimeout(pending); diagTimers.delete(event.document.uri); }
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// Watched-file events (creates / deletes / external edits) for *.mu —
// the client registers the watcher (see extension.ts synchronize.fileEvents).
// Open buffers are handled by onDidChangeContent above; here we cover
// files that change on disk without an editor buffer.
connection.onDidChangeWatchedFiles(params => {
    for (const change of params.changes)
    {
        // 3 === FileChangeType.Deleted
        if (change.type === 3)
        {
            workspaceIndex.remove(change.uri);
            continue;
        }
        if (documents.get(change.uri) !== undefined) continue; // covered live
        const p = uriToPath(change.uri);
        if (p === null) continue;
        void readAndIndex(change.uri, p);
    }
});

async function readAndIndex(uri: string, fsPath: string): Promise<void>
{
    try
    {
        const { promises: fs } = await import('node:fs');
        const text = await fs.readFile(fsPath, 'utf8');
        workspaceIndex.indexText(uri, text);
    }
    catch { /* unreadable — leave prior index entry as-is */ }
}

// Emit-diagnostics debounce. The parse pass (analyze) is cheap and runs
// eagerly when providers query; the emit pass (runEmitPass) is the whole
// compiler and used only for diagnostics, so we defer it until typing
// settles. One timer per open document; the latest edit wins.
const diagTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DIAGNOSTIC_DEBOUNCE_MS = 300;

function scheduleDiagnostics(doc: TextDocument): void
{
    const uri  = doc.uri;
    const prev = diagTimers.get(uri);
    if (prev !== undefined) clearTimeout(prev);
    diagTimers.set(uri, setTimeout(() => {
        diagTimers.delete(uri);
        // The buffer may have closed or advanced while we waited — re-fetch
        // and skip if it's gone.
        const current = documents.get(uri);
        if (current !== undefined) publishDiagnostics(current);
    }, DIAGNOSTIC_DEBOUNCE_MS));
}

function publishDiagnostics(doc: TextDocument): void
{
    const analysis = analyze(doc);
    // Only run the emit pass on a clean parse — a parse error already has a
    // diagnostic and the emitter can't run without an AST anyway.
    const emitError = analysis.parseError === null ? runEmitPass(analysis.text) : null;
    connection.sendDiagnostics({
        uri: doc.uri,
        diagnostics: diagnosticsFor(analysis, emitError),
    });
}

// ── Request handlers ────────────────────────────────────────────────

connection.onCompletion(params => {
    const doc = documents.get(params.textDocument.uri);
    if (doc === undefined) return [];
    return completions(doc, params.position);
});

connection.onHover(params => {
    const doc = documents.get(params.textDocument.uri);
    if (doc === undefined) return null;
    return hover(doc, params.position);
});

connection.onDefinition(params => {
    const doc = documents.get(params.textDocument.uri);
    if (doc === undefined) return null;
    return definition(doc, params.position, workspaceIndex);
});

connection.onDocumentSymbol(params => {
    const doc = documents.get(params.textDocument.uri);
    if (doc === undefined) return [];
    return documentSymbols(doc);
});

connection.onWorkspaceSymbol(params => {
    return workspaceSymbols(params.query, workspaceIndex);
});

connection.onDocumentFormatting(params => {
    const doc = documents.get(params.textDocument.uri);
    if (doc === undefined) return [];
    return formatting(doc);
});

connection.languages.semanticTokens.on(params => {
    const doc = documents.get(params.textDocument.uri);
    if (doc === undefined) return { data: [] };
    return semanticTokens(doc);
});

// ── Boot ────────────────────────────────────────────────────────────

documents.listen(connection);
connection.listen();
