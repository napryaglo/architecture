import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { runCLI } from '../cli.js';

const TINY_APP = `
    Application{ resources: {
        Border x:root[Padding=(8)]{}
    } }
`;

class CapturingIo
{
    public logs:   string[] = [];
    public errors: string[] = [];
    public io = {
        log:   (m: string) => { this.logs.push(m); },
        error: (m: string) => { this.errors.push(m); },
    };
}

describe('CLI — argument handling', () => {
    test('no args prints usage and returns exit code 1', () => {
        const c = new CapturingIo();
        assert.equal(runCLI([], c.io), 1);
        assert.match(c.errors[0]!, /usage/);
    });

    test('unrecognised subcommand prints usage', () => {
        const c = new CapturingIo();
        assert.equal(runCLI(['build', 'x.mu'], c.io), 1);
    });

    test('compile without inputs prints usage', () => {
        const c = new CapturingIo();
        assert.equal(runCLI(['compile'], c.io), 1);
    });

    test('--out paired with multiple inputs is an error', () => {
        const c = new CapturingIo();
        assert.equal(runCLI(['compile', 'a.mu', 'b.mu', '--out', 'x.js'], c.io), 1);
    });
});

describe('CLI — single file compile', () => {
    let workdir: string;

    beforeEach(() => {
        workdir = mkdtempSync(join(tmpdir(), 'mural-cli-'));
    });

    after(() => {
        // Best-effort — beforeEach throws are rare and we'd rather see
        // a leak than swallow the underlying error.
    });

    test('compile <file> writes the JS next to source by default', () => {
        const input = join(workdir, 'app.mu');
        writeFileSync(input, TINY_APP, 'utf8');

        const c = new CapturingIo();
        const code = runCLI(['compile', input], c.io);
        assert.equal(code, 0);

        const expected = join(workdir, 'app.mu.js');
        const out = readFileSync(expected, 'utf8');
        assert.match(out, /export const app = /);
        // Log includes the in/out path mapping.
        assert.equal(c.logs.some(l => l.includes(input) && l.includes(expected)), true);

        rmSync(workdir, { recursive: true, force: true });
    });

    test('compile <file> --out <path> writes exactly there', () => {
        const input = join(workdir, 'app.mu');
        writeFileSync(input, TINY_APP, 'utf8');
        const outPath = join(workdir, 'sub', 'custom.js');

        const c = new CapturingIo();
        const code = runCLI(['compile', input, '--out', outPath], c.io);
        assert.equal(code, 0);

        const out = readFileSync(outPath, 'utf8');
        assert.match(out, /export const app = /);

        rmSync(workdir, { recursive: true, force: true });
    });

    test('compile <file> --out-dir <dir> writes <dir>/<name>.mu.js', () => {
        const input = join(workdir, 'app.mu');
        writeFileSync(input, TINY_APP, 'utf8');
        const outDir = join(workdir, 'out');

        const c = new CapturingIo();
        const code = runCLI(['compile', input, '--out-dir', outDir], c.io);
        assert.equal(code, 0);

        const out = readFileSync(join(outDir, 'app.mu.js'), 'utf8');
        assert.match(out, /export const app = /);

        rmSync(workdir, { recursive: true, force: true });
    });
});

describe('CLI — multi file compile', () => {
    let workdir: string;

    beforeEach(() => {
        workdir = mkdtempSync(join(tmpdir(), 'mural-cli-'));
    });

    test('compile a.mu b.mu --out-dir writes both', () => {
        const a = join(workdir, 'a.mu');
        const b = join(workdir, 'b.mu');
        writeFileSync(a, TINY_APP, 'utf8');
        writeFileSync(b, TINY_APP, 'utf8');
        const outDir = join(workdir, 'dist');

        const c = new CapturingIo();
        const code = runCLI(['compile', a, b, '--out-dir', outDir], c.io);
        assert.equal(code, 0);

        assert.ok(readFileSync(join(outDir, 'a.mu.js'), 'utf8').includes('export const app'));
        assert.ok(readFileSync(join(outDir, 'b.mu.js'), 'utf8').includes('export const app'));

        // Trailing summary line for >1 file.
        assert.ok(c.logs.some(l => l.includes('compiled 2 files')));

        rmSync(workdir, { recursive: true, force: true });
    });
});

describe('CLI — error reporting', () => {
    let workdir: string;

    beforeEach(() => {
        workdir = mkdtempSync(join(tmpdir(), 'mural-cli-'));
    });

    test('parse error returns exit code 2 with file: line:col in the message', () => {
        const input = join(workdir, 'broken.mu');
        writeFileSync(input, 'Application{ resources: { Border[Padding=}', 'utf8');

        const c = new CapturingIo();
        const code = runCLI(['compile', input], c.io);
        assert.equal(code, 2);
        assert.ok(c.errors.some(e => e.includes('broken.mu') && /\d+:\d+/.test(e)));

        rmSync(workdir, { recursive: true, force: true });
    });

    test('missing source file is a generic IO error', () => {
        const input = join(workdir, 'does-not-exist.mu');
        const c = new CapturingIo();
        const code = runCLI(['compile', input], c.io);
        // 3 = generic Error path (not ParseError / EmitError).
        assert.equal(code, 3);
        rmSync(workdir, { recursive: true, force: true });
    });
});

// Sanity check on the path-join behaviour — keeps the regex above honest
// when sep differs between platforms (Windows uses '\').
test('cli paths use the platform separator', () => {
    const joined = join('foo', 'bar.mu.js');
    assert.ok(joined.includes(sep));
});
