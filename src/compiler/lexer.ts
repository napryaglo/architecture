import {
    TokenKind,
    type SourceLocation,
    type Token,
} from './tokens.js';

// Single-pass hand-written lexer for µ-mural source. Operates in two
// modes:
//
//   * Structural mode (default) — `NextToken()` yields atoms,
//     punctuation, and sigils. Triggered by parser code that's reading
//     element trees, attributes, and value expressions.
//
//   * Text mode — `NextTextChunk()` yields either a TextRun spanning
//     literal text up to the next `}` (with `\` escapes applied) or
//     the closing RBrace. Triggered by parser code that has just
//     opened the body of a string-typed slot (e.g., TextBlock.Text).
//
// The lexer never errors out; on bad input it emits a Token with kind
// EOF and the parser raises a diagnostic. This keeps lexer behaviour
// deterministic and the parser fully responsible for error reporting.
//
// Single-character lookahead is enough for everything except the
// disambiguation between `x` (identifier) and `x:` (scope-extension
// prefix), which uses two chars.

export class Lexer
{
    private pos: number;
    private line: number;
    private column: number;
    private readonly source: string;
    private readonly length: number;

    constructor(source: string)
    {
        this.source = source;
        this.length = source.length;
        this.pos    = 0;
        this.line   = 1;
        this.column = 1;
    }

    // ── Public entry points ─────────────────────────────────────────

    public NextToken(): Token
    {
        this.skipStructuralTrivia();
        if (this.pos >= this.length) return this.makeEofToken();

        const start = this.location();
        const c     = this.source[this.pos]!;
        const c2    = this.source[this.pos + 1];

        // ── Multi-char sigils ──
        if (c === '$' && c2 === '$') return this.consumeFixed(TokenKind.DollarDollar, 2, start);
        if (c === '$' && c2 === '(') return this.consumeFixed(TokenKind.DollarParen,  2, start);
        if (c === ')' && c2 === '$') return this.consumeFixed(TokenKind.ParenDollar,  2, start);
        if (c === '@' && c2 === '@') return this.consumeFixed(TokenKind.AtAt,         2, start);

        // ── Scope-extension prefix (x:Ident) ──
        if (c === 'x' && c2 === ':' && this.isLetter(this.source[this.pos + 2]))
        {
            return this.lexScopeExt(start);
        }

        // ── Single-char punctuation ──
        switch (c)
        {
            case '[': return this.consumeFixed(TokenKind.LBracket, 1, start);
            case ']': return this.consumeFixed(TokenKind.RBracket, 1, start);
            case '{': return this.consumeFixed(TokenKind.LBrace,   1, start);
            case '}': return this.consumeFixed(TokenKind.RBrace,   1, start);
            case '(': return this.consumeFixed(TokenKind.LParen,   1, start);
            case ')': return this.consumeFixed(TokenKind.RParen,   1, start);
            case '<': return this.consumeFixed(TokenKind.LAngle,   1, start);
            case '>': return this.consumeFixed(TokenKind.RAngle,   1, start);
            case ',': return this.consumeFixed(TokenKind.Comma,    1, start);
            case '=': return this.consumeFixed(TokenKind.Equals,   1, start);
            case ':': return this.consumeFixed(TokenKind.Colon,    1, start);
            case '.': return this.consumeFixed(TokenKind.Dot,      1, start);
            case '$': return this.consumeFixed(TokenKind.Dollar,   1, start);
            case '@': return this.consumeFixed(TokenKind.At,       1, start);
            case '#': return this.lexHashBody(start);
            case '"': return this.lexString(start);
        }

        // ── Numbers ──
        if (this.isDigit(c)) return this.lexNumber(start, false);
        if (c === '-' && this.isDigit(c2)) return this.lexNumber(start, true);

        // ── Identifiers ──
        if (this.isLetter(c)) return this.lexIdent(start);

        // ── Unknown ──
        // Emit an Ident with the single bad char so the parser has
        // somewhere to attach a diagnostic. Advance to avoid an
        // infinite loop on the same bad char.
        this.advance();
        return {
            kind:  TokenKind.Ident,
            value: c,
            span:  { start, end: this.location() },
        };
    }

    // Text mode. Called by the parser while inside a string-typed body.
    // Emits a TextRun for each literal run between the cursor and the
    // next `}` (or EOF), with backslash escapes resolved. Emits RBrace
    // when the closing brace is reached without consuming it — the
    // parser advances past it with NextToken() to continue structural
    // mode.
    //
    // Note: we don't yet recognise `$Path` / `@Key` / `#color` sigils
    // mid-text. That's a spec-supported extension; deferred until the
    // first consumer asks for it.
    public NextTextChunk(): Token
    {
        if (this.pos >= this.length) return this.makeEofToken();

        const start = this.location();
        const c     = this.source[this.pos]!;

        if (c === '}')
        {
            // Don't consume — let the parser handle the closer via
            // NextToken so its position bookkeeping stays consistent.
            return {
                kind:  TokenKind.RBrace,
                value: '}',
                span:  { start, end: start },
            };
        }

        let out = '';
        while (this.pos < this.length)
        {
            const ch = this.source[this.pos]!;
            if (ch === '}') break;
            if (ch === '\\')
            {
                // Backslash escape — next char is taken literally.
                this.advance();
                if (this.pos < this.length)
                {
                    out += this.source[this.pos]!;
                    this.advance();
                }
                continue;
            }
            out += ch;
            this.advance();
        }
        return {
            kind:  TokenKind.TextRun,
            value: out,
            span:  { start, end: this.location() },
        };
    }

    public Position(): SourceLocation { return this.location(); }

    // ── Internals ───────────────────────────────────────────────────

    private location(): SourceLocation
    {
        return { line: this.line, column: this.column, offset: this.pos };
    }

    private makeEofToken(): Token
    {
        const here = this.location();
        return { kind: TokenKind.EOF, value: '', span: { start: here, end: here } };
    }

    private advance(): void
    {
        const c = this.source[this.pos];
        if (c === '\n')
        {
            this.line++;
            this.column = 1;
        }
        else
        {
            this.column++;
        }
        this.pos++;
    }

    private consumeFixed(kind: TokenKind, n: number, start: SourceLocation): Token
    {
        const text = this.source.substr(this.pos, n);
        for (let i = 0; i < n; i++) this.advance();
        return { kind, value: text, span: { start, end: this.location() } };
    }

    private skipStructuralTrivia(): void
    {
        for (;;)
        {
            const c = this.source[this.pos];
            if (c === undefined) return;

            // Whitespace (space, tab, CR, LF).
            if (c === ' ' || c === '\t' || c === '\r' || c === '\n')
            {
                this.advance();
                continue;
            }

            // Comments — `//` line and `/* */` block.
            if (c === '/' && this.source[this.pos + 1] === '/')
            {
                this.advance(); this.advance();
                while (this.pos < this.length && this.source[this.pos] !== '\n')
                {
                    this.advance();
                }
                continue;
            }
            if (c === '/' && this.source[this.pos + 1] === '*')
            {
                this.advance(); this.advance();
                while (this.pos < this.length)
                {
                    if (this.source[this.pos] === '*' && this.source[this.pos + 1] === '/')
                    {
                        this.advance(); this.advance();
                        break;
                    }
                    this.advance();
                }
                continue;
            }

            return;
        }
    }

    private isLetter(c: string | undefined): boolean
    {
        if (c === undefined) return false;
        const code = c.charCodeAt(0);
        return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    }

    private isDigit(c: string | undefined): boolean
    {
        if (c === undefined) return false;
        const code = c.charCodeAt(0);
        return code >= 48 && code <= 57;
    }

    private isAlnum(c: string | undefined): boolean
    {
        return this.isLetter(c) || this.isDigit(c);
    }

    // [A-Za-z][A-Za-z0-9]* — no underscore, no hyphen.
    private lexIdent(start: SourceLocation): Token
    {
        let out = '';
        while (this.isAlnum(this.source[this.pos]))
        {
            out += this.source[this.pos];
            this.advance();
        }
        return { kind: TokenKind.Ident, value: out, span: { start, end: this.location() } };
    }

    private lexNumber(start: SourceLocation, leadingMinus: boolean): Token
    {
        let out = '';
        if (leadingMinus)
        {
            out += '-';
            this.advance();
        }
        while (this.isDigit(this.source[this.pos]))
        {
            out += this.source[this.pos];
            this.advance();
        }
        if (this.source[this.pos] === '.' && this.isDigit(this.source[this.pos + 1]))
        {
            out += '.';
            this.advance();
            while (this.isDigit(this.source[this.pos]))
            {
                out += this.source[this.pos];
                this.advance();
            }
        }
        return { kind: TokenKind.Number, value: out, span: { start, end: this.location() } };
    }

    private lexString(start: SourceLocation): Token
    {
        // Skip the opening quote.
        this.advance();
        let out = '';
        while (this.pos < this.length)
        {
            const c = this.source[this.pos]!;
            if (c === '"')
            {
                this.advance();
                return { kind: TokenKind.String, value: out, span: { start, end: this.location() } };
            }
            if (c === '\\')
            {
                this.advance();
                const esc = this.source[this.pos];
                if (esc !== undefined)
                {
                    // Honour the common escapes; others pass through literally.
                    switch (esc)
                    {
                        case 'n':  out += '\n'; break;
                        case 't':  out += '\t'; break;
                        case 'r':  out += '\r'; break;
                        case '"':  out += '"';  break;
                        case '\\': out += '\\'; break;
                        default:   out += esc;  break;
                    }
                    this.advance();
                }
                continue;
            }
            out += c;
            this.advance();
        }
        // Unterminated string — return what we got; parser raises.
        return { kind: TokenKind.String, value: out, span: { start, end: this.location() } };
    }

    private lexHashBody(start: SourceLocation): Token
    {
        // Consume the `#`.
        this.advance();
        // Accumulate identifier chars — letters and digits. This greedy
        // run covers hex colours (`#0d47a1`), named colours (`#blue`),
        // and macro holes (`#1`, `#bg`). The parser inspects the body
        // to decide which.
        let out = '';
        while (this.isAlnum(this.source[this.pos]))
        {
            out += this.source[this.pos];
            this.advance();
        }
        return { kind: TokenKind.HashBody, value: out, span: { start, end: this.location() } };
    }

    private lexScopeExt(start: SourceLocation): Token
    {
        // Already verified `x:Letter` ahead. Consume `x:`.
        this.advance(); this.advance();
        let out = '';
        while (this.isAlnum(this.source[this.pos]))
        {
            out += this.source[this.pos];
            this.advance();
        }
        return { kind: TokenKind.ScopeExt, value: out, span: { start, end: this.location() } };
    }
}
