// Lexer output. One Token per atom; trivia (whitespace, comments) is
// consumed silently and contributes only to advancing the source
// location for the next emitted token.

export enum TokenKind
{
    // ── Atoms ─────────────────────────────────────────────────────
    Ident       = 'Ident',         // [A-Za-z][A-Za-z0-9]*
    Number      = 'Number',        // -? digits (. digits)?
    String      = 'String',        // "..."  with \-escapes; value stored unescaped
    HashBody    = 'HashBody',      // raw chars after `#` — color | named color |
                                   // macro hole positional | macro hole named.
                                   // Interpretation deferred to parser.
    ScopeExt    = 'ScopeExt',      // `x:foo` lexed as one token; value = "foo"

    // ── Punctuation ───────────────────────────────────────────────
    LBracket    = 'LBracket',      // [
    RBracket    = 'RBracket',      // ]
    LBrace      = 'LBrace',        // {
    RBrace      = 'RBrace',        // }
    LDoubleBrace = 'LDoubleBrace', // {{  — opens an inline expression
    LParen      = 'LParen',        // (
    RParen      = 'RParen',        // )
    LAngle      = 'LAngle',        // <
    RAngle      = 'RAngle',        // >
    LessLess    = 'LessLess',      // <<  — binding-converter operator
    Arrow       = 'Arrow',         // ->  — service token-from-impl operator
    Comma       = 'Comma',         // ,
    Equals      = 'Equals',        // =
    Colon       = 'Colon',         // :
    Semicolon   = 'Semicolon',     // ;  — property-setter terminator
    Dot         = 'Dot',           // .

    // ── Sigils ────────────────────────────────────────────────────
    // Single-char sigils followed by a path/ident handled by the parser.
    Dollar          = 'Dollar',          // $
    DollarDollar    = 'DollarDollar',    // $$
    DollarParen     = 'DollarParen',     // $(  — opens an inline expression
    ParenDollar     = 'ParenDollar',     // )$  — closes an inline expression
    At              = 'At',              // @
    AtAt            = 'AtAt',            // @@

    // ── Text mode ─────────────────────────────────────────────────
    // Emitted by the lexer when the parser has explicitly entered text
    // mode (string-typed slot body). TextRun holds a literal segment;
    // LDoubleBrace appears when a contiguous `{{` is encountered, at
    // which point the parser switches to expression-body capture and
    // resumes text mode after the matching `}}`.
    TextRun         = 'TextRun',
    // Captured by NextInlineExprBody — the raw expression text between
    // a `{{` and its matching `}}` (delimiters excluded). The compiler
    // re-parses this body to fold constants or build a MultiBinding.
    InlineExprBody  = 'InlineExprBody',

    EOF             = 'EOF',
}

// 0-based char offset; 1-based line and column. The trio is convenient
// for both byte-precise error pointers (offset) and human-readable
// diagnostics (line/col).
export interface SourceLocation
{
    line:   number;
    column: number;
    offset: number;
}

export interface SourceSpan
{
    start: SourceLocation;
    end:   SourceLocation;
}

export interface Token
{
    kind:  TokenKind;
    // For Ident: the identifier text.
    // For Number: the numeric literal (parsed via Number(value) by callers).
    // For String: the unescaped contents (no surrounding quotes).
    // For HashBody: the chars after `#` verbatim.
    // For ScopeExt: the extension name (chars after `x:`).
    // For TextRun: the resolved text (escapes applied).
    // For everything else: the literal source span (mostly for error
    // messages and round-tripping).
    value: string;
    span:  SourceSpan;
}

export const KEYWORDS = new Set<string>([
    'Style', 'Template', 'DataTemplate',
    'HierarchicalDataTemplate', 'ItemsPanelTemplate',
    'def', 'resources',
    'import', 'from',
    'when', 'not', 'and', 'or',
]);
