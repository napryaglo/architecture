// Semantic-tokens provider. Layers AST-aware colouring on top of the
// TextMate grammar (syntaxes/mural.tmLanguage.json). TextMate is a
// regex heuristic — it cannot tell whether a bare identifier is a
// control TYPE, an ENUM value, or a PROPERTY name, because that depends
// on grammatical position, not spelling. The parser already knows.
// Emitting semantic tokens for exactly those positions fixes the
// long-standing "colours are coarse / out of sync" complaint and ends
// the TextMate-vs-parser drift: where the AST speaks, its classification
// wins; everywhere else (punctuation, comments, strings, numbers,
// `@keys`, `$bindings`) TextMate still colours as before.
//
// Scope is deliberately narrow — only the positions where semantics add
// information the regex grammar can't have:
//   * element / animation class names        → `type`
//   * property paths (`Background`, `A.B`)    → `property`
//   * bare identifier VALUES (enum / type-ref)→ `enumMember`
//   * `@key` / `@@key` resource references    → `variable`
//
// The token stream is built from the cached parse (analyze) — no compile
// pass, so this stays cheap enough to recompute on every request.

import {
    SemanticTokens,
    SemanticTokenTypes,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type { SourceSpan } from '@pragmatic-lab/mural/compiler';

import { analyze } from '../analyzer.js';

// Legend — index order is the wire contract shared with the server's
// declared `semanticTokensProvider.legend`. The named entries all map to
// VS Code's standard token types, so themes colour them without any
// extra `semanticTokenScopes` contribution.
export const TOKEN_TYPES: readonly string[] = [
    SemanticTokenTypes.type,        // 0 — element / animation class names
    SemanticTokenTypes.property,    // 1 — property paths
    SemanticTokenTypes.enumMember,  // 2 — identifier values (enum / type-ref)
    SemanticTokenTypes.variable,    // 3 — @key / @@key resource references
];
export const TOKEN_MODIFIERS: readonly string[] = [];

const enum T { Type = 0, Property = 1, EnumMember = 2, Variable = 3 }

interface RawToken { line: number; char: number; length: number; type: T; }

export function semanticTokens(doc: TextDocument): SemanticTokens
{
    const analysis = analyze(doc);
    if (analysis.ast === null) return { data: [] };

    const tokens: RawToken[] = [];
    collect(analysis.ast, tokens);

    // Semantic tokens are delta-encoded and MUST be ordered by position.
    // The AST walk is roughly source order but not guaranteed (meta-attrs,
    // x-attrs), so sort before encoding.
    tokens.sort((a, b) => a.line - b.line || a.char - b.char);
    return { data: encode(tokens) };
}

// Generic recursive walk. Emits a token for the node kinds we classify,
// then descends into every child node/array (skipping `span`, whose
// members are plain numbers). Emitting-and-always-recursing keeps this
// robust as the AST grows: an unrecognised kind simply contributes no
// token but its children are still visited.
function collect(node: unknown, out: RawToken[]): void
{
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node))
    {
        for (const child of node) collect(child, out);
        return;
    }

    const n = node as { kind?: string; span?: SourceSpan };
    switch (n.kind)
    {
        case 'element':
            // The element name is the first token of the node; its span
            // starts exactly there, so a name-length run classifies it
            // without a dedicated name span.
            pushNamed(out, n.span, (node as { name: string }).name.length, T.Type);
            break;

        case 'animation-decl':
            pushNamed(out, n.span, (node as { className: string }).className.length, T.Type);
            break;

        case 'attr-path':
            // Whole dotted path (`Background`, `Canvas.Left`) — the span is
            // the path itself.
            pushSpan(out, n.span, T.Property);
            break;

        case 'ident':
            // Bare identifier in value position: enum member, type
            // reference, or named flag. TextMate can't distinguish these
            // from anything else; `enumMember` gives them a distinct hue.
            pushSpan(out, n.span, T.EnumMember);
            break;

        case 'static-resource':
        case 'dynamic-resource':
        {
            // `@Key` (static, one-char sigil) / `@@Key` (dynamic, two-char).
            // The parser's span over-reaches by the following separator
            // (e.g. `@Surface,` inside a bracket list), so derive the length
            // from the sigil + key rather than the span offsets.
            const sigil = n.kind === 'dynamic-resource' ? 2 : 1;
            pushNamed(out, n.span, sigil + (node as { key: string }).key.length, T.Variable);
            break;
        }

        default:
            break;
    }

    // Descend. `span` holds only position numbers — skip it.
    for (const [key, value] of Object.entries(node as Record<string, unknown>))
    {
        if (key === 'span') continue;
        collect(value, out);
    }
}

// Emit a token that starts at `span.start` and runs `length` characters
// on the same line. Used where the classified lexeme is the first token
// of a wider span (element / animation name) or where the span over-
// reaches the lexeme (resource refs) and the exact length is known.
function pushNamed(out: RawToken[], span: SourceSpan | undefined, length: number, type: T): void
{
    if (span === undefined || length <= 0) return;
    out.push({ line: span.start.line - 1, char: span.start.column - 1, length, type });
}

// Emit a token covering the whole span. Uses the offset delta for the
// length; skips multi-line spans (semantic tokens can't straddle lines,
// and every lexeme we classify is single-line anyway).
function pushSpan(out: RawToken[], span: SourceSpan | undefined, type: T): void
{
    if (span === undefined || span.start.line !== span.end.line) return;
    const length = span.end.offset - span.start.offset;
    if (length <= 0) return;
    out.push({ line: span.start.line - 1, char: span.start.column - 1, length, type });
}

// LSP delta encoding: each token is 5 ints
// [deltaLine, deltaStartChar, length, tokenType, tokenModifiers], where
// deltas are relative to the previous token (start char relative only
// when on the same line).
function encode(tokens: readonly RawToken[]): number[]
{
    const data: number[] = [];
    let prevLine = 0;
    let prevChar = 0;
    for (const t of tokens)
    {
        const deltaLine = t.line - prevLine;
        const deltaChar = deltaLine === 0 ? t.char - prevChar : t.char;
        data.push(deltaLine, deltaChar, t.length, t.type, 0);
        prevLine = t.line;
        prevChar = t.char;
    }
    return data;
}
