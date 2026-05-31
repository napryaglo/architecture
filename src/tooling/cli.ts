#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, EmitError } from '../compiler/compile.js';
import { ParseError } from '../compiler/parser.js';

// Lightweight CLI:
//
//   mural compile <file.mu> [<file.mu> ...] [--out <out.js> | --out-dir <dir>]
//
// One-input form (--out): a single explicit output path. Multi-input
// form (--out-dir): each input is compiled to `<out-dir>/<name>.mu.js`.
// Default destination when neither flag is given: alongside each
// source file, with `.mu` replaced by `.mu.js`.
//
// Implementation is intentionally bare. A real build tool would also
// handle: glob expansion (still gated on the Node version's `fs.glob`),
// source maps, watch mode, manifest output. Each can land as a small
// addition; the core compile + write loop is the same.

export interface CliIo
{
    log:   (msg: string) => void;
    error: (msg: string) => void;
}

const DEFAULT_IO: CliIo = {
    log:   (msg) => { process.stdout.write(msg + '\n'); },
    error: (msg) => { process.stderr.write(msg + '\n'); },
};

function usage(io: CliIo): number
{
    io.error('usage: mural compile <file.mu> [...] [--out <file.js> | --out-dir <dir>]');
    return 1;
}

interface ParsedArgs
{
    inputs:  string[];
    outFile: string | undefined;
    outDir:  string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs | 'error'
{
    const inputs:  string[] = [];
    let   outFile: string | undefined;
    let   outDir:  string | undefined;
    for (let i = 0; i < argv.length; i++)
    {
        const a = argv[i]!;
        if (a === '--out')
        {
            outFile = argv[++i];
            if (outFile === undefined) return 'error';
            continue;
        }
        if (a === '--out-dir')
        {
            outDir = argv[++i];
            if (outDir === undefined) return 'error';
            continue;
        }
        if (a.startsWith('--')) return 'error';
        inputs.push(a);
    }
    if (inputs.length === 0) return 'error';
    if (outFile !== undefined && inputs.length > 1) return 'error';
    return { inputs, outFile, outDir };
}

function outputPathFor(input: string, parsed: ParsedArgs): string
{
    if (parsed.outFile !== undefined) return parsed.outFile;
    const filename = basename(input).replace(/\.mu$/, '.mu.js');
    if (parsed.outDir !== undefined) return join(parsed.outDir, filename);
    return join(dirname(input), filename);
}

export function runCLI(argv: string[], io: CliIo = DEFAULT_IO): number
{
    if (argv.length === 0 || argv[0] !== 'compile')
    {
        return usage(io);
    }
    const parsed = parseArgs(argv.slice(1));
    if (parsed === 'error') return usage(io);

    let count = 0;
    for (const input of parsed.inputs)
    {
        try
        {
            const source  = readFileSync(input, 'utf8');
            const result  = compile(source);
            const outPath = outputPathFor(input, parsed);
            mkdirSync(dirname(resolve(outPath)), { recursive: true });
            writeFileSync(outPath, result.js, 'utf8');
            io.log(`${input} → ${outPath}`);
            count++;
        }
        catch (err)
        {
            if (err instanceof ParseError || err instanceof EmitError)
            {
                io.error(`${input}: ${err.message}`);
                return 2;
            }
            io.error(`${input}: ${err instanceof Error ? err.message : String(err)}`);
            return 3;
        }
    }
    if (count > 1) io.log(`compiled ${count} files`);
    return 0;
}

// Direct-invocation entry. fileURLToPath normalises across platforms
// (on Windows `process.argv[1]` is a backslash path; `import.meta.url`
// is a file:// URL — naïve string comparison fails). When imported
// (the test path), argv[1] is the test runner's entry, not this file.
if (process.argv[1] !== undefined
    && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
{
    process.exit(runCLI(process.argv.slice(2)));
}
