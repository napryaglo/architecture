// Diagnostics: convert the analyzer's ParseError / EmitError into LSP
// Diagnostic[] for the connection.sendDiagnostics call. Both error
// types carry mural SourceSpan; we translate to LSP Range and surface
// the message verbatim.

import {
    Diagnostic,
    DiagnosticSeverity,
} from 'vscode-languageserver/node.js';

import type { EmitError, SourceSpan } from '@visualisation-sub/mural/compiler';

import type { DocAnalysis } from '../analyzer.js';

// `emitError` is supplied by the caller rather than read off the analysis:
// the parse-side analysis is cheap and cached per keystroke, but the emit
// pass that produces `emitError` runs on a debounce (see server.ts), so it
// arrives separately. Pass null when the emit pass hasn't run (or a parse
// error suppressed it).
export function diagnosticsFor(analysis: DocAnalysis, emitError: EmitError | null): Diagnostic[]
{
    const out: Diagnostic[] = [];
    if (analysis.parseError !== null)
    {
        out.push({
            severity: DiagnosticSeverity.Error,
            range:    rangeOf(analysis.parseError.span),
            message:  analysis.parseError.message,
            source:   'mural-parser',
        });
    }
    if (emitError !== null)
    {
        out.push({
            severity: DiagnosticSeverity.Error,
            range:    rangeOf(emitError.span ?? fallbackSpan()),
            message:  emitError.message,
            source:   'mural-compiler',
        });
    }
    return out;
}

export function rangeOf(span: SourceSpan): { start: { line: number; character: number };
                                             end:   { line: number; character: number } }
{
    return {
        start: { line: span.start.line - 1, character: span.start.column - 1 },
        end:   { line: span.end.line   - 1, character: span.end.column   - 1 },
    };
}

function fallbackSpan(): SourceSpan
{
    return {
        start: { line: 1, column: 1, offset: 0 },
        end:   { line: 1, column: 1, offset: 0 },
    };
}
