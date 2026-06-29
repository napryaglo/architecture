// µ-mural formatter CLI.
//
//   npm run format               format every .mu under src/ and demo/ in place
//   npm run format -- <paths…>   format the given files / directories
//   npm run format:check         report files that aren't formatted; exit 1 if any
//                                (CI gate — never writes)
//
// Flags: --check (report only, exit non-zero on drift), --write (default).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { format } from '../compiler/index.js';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);

function collectMu(target: string, acc: string[]): void
{
    const st = statSync(target);
    if (st.isFile())
    {
        if (target.endsWith('.mu')) acc.push(target);
        return;
    }
    for (const e of readdirSync(target, { withFileTypes: true }))
    {
        if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
        if (e.name.startsWith('.')) continue;
        collectMu(join(target, e.name), acc);
    }
}

function main(): void
{
    const argv = process.argv.slice(2);
    const check = argv.includes('--check');
    const paths = argv.filter(a => !a.startsWith('--'));
    const roots = paths.length > 0 ? paths : ['src', 'demo'];

    const files: string[] = [];
    for (const r of roots)
    {
        try { collectMu(r, files); }
        catch (e) { console.error(`skip ${r}: ${(e as Error).message}`); }
    }
    files.sort();

    let changed = 0, errors = 0;
    for (const f of files)
    {
        const src = readFileSync(f, 'utf8');
        let out: string;
        try { out = format(src); }
        catch (e)
        {
            errors++;
            console.error(`error ${f}: ${(e as Error).message}`);
            continue;
        }
        if (out === src) continue;
        changed++;
        if (check)
        {
            console.log(`would reformat ${f}`);
        }
        else
        {
            writeFileSync(f, out);
            console.log(`formatted ${f}`);
        }
    }

    const verb = check ? 'need formatting' : 'reformatted';
    console.log(`\n${files.length} file(s) scanned, ${changed} ${verb}, ${errors} error(s).`);

    // CI gate: --check fails if anything is unformatted; either mode fails
    // on a parse error so broken markup can't slip through.
    if (errors > 0 || (check && changed > 0)) process.exit(1);
}

main();
