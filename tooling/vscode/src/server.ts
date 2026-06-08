// LSP server entry. Runs in a Node subprocess spawned by the client
// (see ../extension.ts). All language intelligence lives in `providers/`;
// the server just wires connection events to the appropriate provider
// call.
//
// We side-effect-import the runtime, Basic and visual-engine barrel
// modules so every class's `static { Model.RegisterProperty(...) }`
// block fires once at server boot. The completion provider then asks
// `Model.find_class(name)` + `Model.EnumerateProperties(klass)` to
// list the DPs available for any target type referenced from .mu
// sources — without this import the registry is empty when the user
// first opens a .mu file.
import '@visualisation-sub/mural/runtime';
import '@visualisation-sub/mural/Basic';
import '@visualisation-sub/mural/visual-engine';
//
// Lifecycle:
//   1. The client sends `initialize` — we declare our capabilities.
//   2. The TextDocuments manager streams document open / change / close
//      events to us; on each change we run the analyzer and publish
//      diagnostics.
//   3. Request handlers (completion, hover, definition, document
//      symbols) call the analyzer's cached result.

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
} from './analyzer.js';
import { diagnosticsFor } from './providers/diagnostics.js';
import { completions }    from './providers/completion.js';
import { hover }          from './providers/hover.js';
import { definition }     from './providers/definition.js';
import { documentSymbols } from './providers/document-symbols.js';

const connection = createConnection(ProposedFeatures.all);
const documents  = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => ({
    capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
            // Triggers cover the sigils that change completion context.
            triggerCharacters: ['@', ':', '.', '=', ' '],
            resolveProvider:   false,
        },
        hoverProvider:           true,
        definitionProvider:      true,
        documentSymbolProvider:  true,
    },
}));

// ── Sync ────────────────────────────────────────────────────────────

documents.onDidChangeContent(event => {
    publishDiagnostics(event.document);
});

documents.onDidClose(event => {
    invalidate(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

function publishDiagnostics(doc: TextDocument): void
{
    const analysis = analyze(doc);
    connection.sendDiagnostics({
        uri: doc.uri,
        diagnostics: diagnosticsFor(analysis),
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
    return definition(doc, params.position);
});

connection.onDocumentSymbol(params => {
    const doc = documents.get(params.textDocument.uri);
    if (doc === undefined) return [];
    return documentSymbols(doc);
});

// ── Boot ────────────────────────────────────────────────────────────

documents.listen(connection);
connection.listen();
