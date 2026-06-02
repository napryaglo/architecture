#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, EmitError } from '../compiler/compile.js';
import { ParseError } from '../compiler/parser.js';
import { DEFAULT_SLOT_INFO, type SlotInfo } from '../compiler/symbol-table.js';

// Compiles every `src/Controls/<name>.template.mu` into a matching
// `build/Controls/<name>.template.mu.{js,d.ts}`. Run via
// `npm run build:templates`. The generated files are NOT in `src/`
// (they're build artifacts) and are gitignored under `build/`.
//
// Why the public symbol table works as-is now: each control file's
// internal helpers (`ClickableBorder`, `ComboBoxPopupHost`, …) are
// re-exported from the `@visualisation-sub/mural/Controls` barrel, so
// the package's `DEFAULT_SYMBOLS` already resolves them. The build
// script uses the DEFAULT map straight through and lets the compiled
// `.mu.js` emit imports against the package self-reference — exactly
// the same shape consumers' compiled `.mu.js` files use. Both the
// build outputs and the consumer outputs resolve to `dist/Controls/`
// at load time via the package's `exports` field.

// Default slot info for the internal helper classes — same shape the
// build script always used, just lifted here so the compiler knows
// how to attach children to a template body that names them.
const INTERNAL_SLOTS: ReadonlyArray<readonly [string, SlotInfo]> = [
    ['ClickableBorder',       { name: 'Child',    kind: 'single' }],
    ['ClickAwayScrim',        { name: 'Child',    kind: 'single' }],
    ['SplitRow',              { name: 'Children', kind: 'list'   }],
    ['ComboBoxPopupHost',     { name: 'Children', kind: 'list'   }],
    ['ScrimSurface',          { name: 'Child',    kind: 'single' }],
    ['TemporaryOverlayHost',  { name: 'Children', kind: 'list'   }],
    ['ClickableRow',          { name: 'Child',    kind: 'single' }],
    ['ChevronTarget',         { name: 'Child',    kind: 'single' }],
    ['CollapsibleStack',      { name: 'Children', kind: 'list'   }],
    ['ScrollBarLayout',       { name: 'Children', kind: 'list'   }],
];

function buildSlotInfo(): Map<string, SlotInfo>
{
    const out = new Map<string, SlotInfo>(DEFAULT_SLOT_INFO);
    for (const [name, info] of INTERNAL_SLOTS) out.set(name, info);
    return out;
}

function discoverTemplateSources(dir: string): string[]
{
    return readdirSync(dir)
        .filter(f => f.endsWith('.template.mu'))
        .map(f => join(dir, f))
        .sort();
}

export interface BuildOptions
{
    /** Where to read `*.template.mu` source files from. */
    sourceDir: string;
    /** Where to write the matching `*.template.mu.{js,d.ts}` outputs. */
    outDir:    string;
}

export function buildControlTemplates(opts: BuildOptions): number
{
    const slots  = buildSlotInfo();
    const inputs = discoverTemplateSources(opts.sourceDir);
    if (inputs.length === 0)
    {
        process.stdout.write('build-control-templates: no .template.mu sources found\n');
        return 0;
    }
    mkdirSync(opts.outDir, { recursive: true });
    for (const input of inputs)
    {
        const source = readFileSync(input, 'utf8');
        // No custom symbols map — the default symbol table already
        // points every Controls class (including internal helpers) at
        // `@visualisation-sub/mural/Controls`. The emitted `.mu.js`
        // resolves that self-reference via the package's `exports`
        // field at load time, the same as any consumer template would.
        const out      = compile(source, { slots });
        const baseName = basename(input);
        const outPath  = join(opts.outDir, baseName.replace(/\.mu$/, '.mu.js'));
        const dtsPath  = join(opts.outDir, baseName.replace(/\.mu$/, '.mu.d.ts'));
        writeFileSync(outPath, out.js, 'utf8');
        // Companion `.d.ts` — gives TypeScript a typed shape for the
        // emitted `create()` factory. Each `.mu` file's top-level
        // resource forms produce a single `create(): ResourceDictionary`.
        writeFileSync(
            dtsPath,
            `import type { ResourceDictionary } from '@visualisation-sub/mural/runtime';\n` +
            `export function create(): ResourceDictionary;\n`,
            'utf8');
        process.stdout.write(
            `${relative(process.cwd(), input)} → ${relative(process.cwd(), outPath)} (+ .d.ts)\n`);
    }
    process.stdout.write(`build-control-templates: compiled ${inputs.length} file(s)\n`);
    return 0;
}

// Direct-invocation entry — `node dist/tooling/build-control-templates.js`
// after tsc, or `tsx src/tooling/build-control-templates.ts` during
// development. Both forms resolve the project root by walking up from
// the script location.
if (process.argv[1] !== undefined
    && fileURLToPath(import.meta.url).replace(/\\/g, '/') ===
       process.argv[1].replace(/\\/g, '/'))
{
    // Script lives at <root>/(src|dist)/tooling/build-control-templates.{ts,js}.
    // Walk two levels up for the project root.
    const here        = fileURLToPath(import.meta.url);
    const projectRoot = join(dirname(here), '..', '..');
    const sourceDir   = join(projectRoot, 'src',   'Controls');
    const outDir      = join(projectRoot, 'build', 'Controls');
    try
    {
        process.exit(buildControlTemplates({ sourceDir, outDir }));
    }
    catch (err)
    {
        if (err instanceof ParseError || err instanceof EmitError)
        {
            process.stderr.write(`build-control-templates: ${err.message}\n`);
            process.exit(2);
        }
        process.stderr.write(
            `build-control-templates: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(3);
    }
}
