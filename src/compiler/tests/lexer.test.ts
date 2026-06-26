import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../lexer.js';
import { TokenKind, type Token } from '../tokens.js';

// Drains the lexer into a flat array of (kind, value) pairs for compact
// assertions. Trailing EOF is included so tests can verify it explicitly
// when they want.
function tokenize(src: string): Array<[TokenKind, string]>
{
    const lx = new Lexer(src);
    const out: Array<[TokenKind, string]> = [];
    for (;;)
    {
        const tk = lx.NextToken();
        out.push([tk.kind, tk.value]);
        if (tk.kind === TokenKind.EOF) break;
    }
    return out;
}

describe('Lexer — atoms', () => {
    test('plain identifier', () => {
        assert.deepEqual(tokenize('Border'), [
            [TokenKind.Ident, 'Border'],
            [TokenKind.EOF, ''],
        ]);
    });

    test('lowercase keyword is still an Ident at the lex level', () => {
        // Keywords are recognised by the parser inspecting `.value`.
        assert.deepEqual(tokenize('style'), [
            [TokenKind.Ident, 'style'],
            [TokenKind.EOF, ''],
        ]);
    });

    test('integer and float', () => {
        assert.deepEqual(tokenize('12 3.14'), [
            [TokenKind.Number, '12'],
            [TokenKind.Number, '3.14'],
            [TokenKind.EOF, ''],
        ]);
    });

    test('negative number', () => {
        assert.deepEqual(tokenize('-3'), [
            [TokenKind.Number, '-3'],
            [TokenKind.EOF, ''],
        ]);
    });

    test('string with escapes', () => {
        const t = tokenize('"hi\\n\\"end"');
        assert.deepEqual(t, [
            [TokenKind.String, 'hi\n"end'],
            [TokenKind.EOF, ''],
        ]);
    });

    test('string \\uXXXX escape decodes to the codepoint char', () => {
        assert.deepEqual(tokenize('"\\ue1a7"'), [
            [TokenKind.String, String.fromCodePoint(0xe1a7)],
            [TokenKind.EOF, ''],
        ]);
    });

    test('string \\u{X…} braced escape (astral codepoint)', () => {
        assert.deepEqual(tokenize('"\\u{1f600}!"'), [
            [TokenKind.String, String.fromCodePoint(0x1f600) + '!'],
            [TokenKind.EOF, ''],
        ]);
    });

    test('malformed \\u escape passes through literally', () => {
        // Too few hex digits → no decode; the lexer stays lenient.
        assert.deepEqual(tokenize('"\\uzz"'), [
            [TokenKind.String, 'uzz'],
            [TokenKind.EOF, ''],
        ]);
    });

    test('# body — hex colour', () => {
        assert.deepEqual(tokenize('#0d47a1'), [
            [TokenKind.HashBody, '0d47a1'],
            [TokenKind.EOF, ''],
        ]);
    });

    test('# body — named (could be colour or macro hole)', () => {
        assert.deepEqual(tokenize('#blue'), [
            [TokenKind.HashBody, 'blue'],
            [TokenKind.EOF, ''],
        ]);
    });

    test('# body — positional macro hole', () => {
        assert.deepEqual(tokenize('#1'), [
            [TokenKind.HashBody, '1'],
            [TokenKind.EOF, ''],
        ]);
    });
});

describe('Lexer — sigils and multi-char tokens', () => {
    test('$ vs $$ vs $( vs )$', () => {
        const t = tokenize('$ $$ $( )$');
        assert.deepEqual(t, [
            [TokenKind.Dollar,       '$'],
            [TokenKind.DollarDollar, '$$'],
            [TokenKind.DollarParen,  '$('],
            [TokenKind.ParenDollar,  ')$'],
            [TokenKind.EOF,          ''],
        ]);
    });

    test('@ vs @@', () => {
        assert.deepEqual(tokenize('@ @@'), [
            [TokenKind.At,    '@'],
            [TokenKind.AtAt,  '@@'],
            [TokenKind.EOF,   ''],
        ]);
    });

    test('x:foo lexes as a single ScopeExt token', () => {
        assert.deepEqual(tokenize('x:key'), [
            [TokenKind.ScopeExt, 'key'],
            [TokenKind.EOF,      ''],
        ]);
    });

    test('plain `x` followed by something non-colon stays an Ident', () => {
        assert.deepEqual(tokenize('x = 1'), [
            [TokenKind.Ident,  'x'],
            [TokenKind.Equals, '='],
            [TokenKind.Number, '1'],
            [TokenKind.EOF,    ''],
        ]);
    });

    test('punctuation cluster', () => {
        const t = tokenize('[]{}(),=:.<>');
        assert.deepEqual(t, [
            [TokenKind.LBracket, '['],
            [TokenKind.RBracket, ']'],
            [TokenKind.LBrace,   '{'],
            [TokenKind.RBrace,   '}'],
            [TokenKind.LParen,   '('],
            [TokenKind.RParen,   ')'],
            [TokenKind.Comma,    ','],
            [TokenKind.Equals,   '='],
            [TokenKind.Colon,    ':'],
            [TokenKind.Dot,      '.'],
            [TokenKind.LAngle,   '<'],
            [TokenKind.RAngle,   '>'],
            [TokenKind.EOF,      ''],
        ]);
    });
});

describe('Lexer — trivia', () => {
    test('whitespace and newlines are skipped', () => {
        assert.deepEqual(tokenize('  Border\n  \tTextBlock'), [
            [TokenKind.Ident, 'Border'],
            [TokenKind.Ident, 'TextBlock'],
            [TokenKind.EOF,   ''],
        ]);
    });

    test('line comments terminate at newline', () => {
        assert.deepEqual(tokenize('a // ignore = 1\nb'), [
            [TokenKind.Ident, 'a'],
            [TokenKind.Ident, 'b'],
            [TokenKind.EOF,   ''],
        ]);
    });

    test('block comments span newlines', () => {
        assert.deepEqual(tokenize('a /* still\n  in the comment */ b'), [
            [TokenKind.Ident, 'a'],
            [TokenKind.Ident, 'b'],
            [TokenKind.EOF,   ''],
        ]);
    });
});

describe('Lexer — source locations', () => {
    test('column / line track newlines correctly', () => {
        const lx = new Lexer('foo\n  bar');
        const foo = lx.NextToken();
        const bar = lx.NextToken();
        assert.equal(foo.span.start.line,   1);
        assert.equal(foo.span.start.column, 1);
        assert.equal(bar.span.start.line,   2);
        assert.equal(bar.span.start.column, 3);
    });
});

describe('Lexer — text mode', () => {
    test('NextTextChunk returns the literal body up to the closing brace', () => {
        const lx = new Lexer('Hello mural}');
        const chunk = lx.NextTextChunk();
        assert.equal(chunk.kind,  TokenKind.TextRun);
        assert.equal(chunk.value, 'Hello mural');
        // The closer hasn't been consumed yet — peeking it via
        // NextTextChunk yields the RBrace token.
        const closer = lx.NextTextChunk();
        assert.equal(closer.kind, TokenKind.RBrace);
    });

    test('backslash escapes pass through to the result literally', () => {
        const lx = new Lexer('a\\$b\\}c}');
        const chunk = lx.NextTextChunk();
        assert.equal(chunk.value, 'a$b}c');
    });

    test('an immediately-closing body yields an empty TextRun then RBrace', () => {
        // Reaching `}` before any chars returns RBrace (peek behaviour);
        // the parser advances past it via NextToken in structural mode.
        const lx = new Lexer('}');
        const first = lx.NextTextChunk();
        assert.equal(first.kind, TokenKind.RBrace);
    });
});
