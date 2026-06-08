#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, EmitError } from '../compiler/compile.js';
import { ParseError } from '../compiler/parser.js';
import { DEFAULT_SLOT_INFO, type SlotInfo } from '../compiler/symbol-table.js';

// Compiles every `src/Basic/<name>.template.mu` into a matching
// `build/Basic/<name>.template.mu.{js,d.ts}`. Run via
// `npm run build:templates`. The generated files are NOT in `src/`
// (they're build artifacts) and are gitignored under `build/`.
//
// Why the public symbol table works as-is now: each control file's
// internal helpers (`ClickableBorder`, `ComboBoxPopupHost`, …) are
// re-exported from the `@visualisation-sub/mural/Basic` barrel, so
// the package's `DEFAULT_SYMBOLS` already resolves them. The build
// script uses the DEFAULT map straight through and lets the compiled
// `.mu.js` emit imports against the package self-reference — exactly
// the same shape consumers' compiled `.mu.js` files use. Both the
// build outputs and the consumer outputs resolve to `dist/Basic/`
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
    const out: string[] = [];
    const walk = (d: string): void =>
    {
        for (const entry of readdirSync(d, { withFileTypes: true }))
        {
            const full = join(d, entry.name);
            if (entry.isDirectory())
            {
                // Skip test folders — templates aren't compiled out of them.
                if (entry.name === 'tests') continue;
                walk(full);
            }
            else if (entry.name.endsWith('.template.mu'))
            {
                out.push(full);
            }
        }
    };
    walk(dir);
    return out.sort();
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
        // points every Basic class (including internal helpers) at
        // `@visualisation-sub/mural/Basic`. The emitted `.mu.js`
        // resolves that self-reference via the package's `exports`
        // field at load time, the same as any consumer template would.
        const out      = compile(source, { slots });
        // Mirror the input's path under outDir so framework subfolders
        // (menu/, tool-bar/, …) keep their structure. `relative` strips
        // the sourceDir prefix; `dirname` carries the trailing
        // sub-directory chain.
        const rel      = relative(opts.sourceDir, input);
        const outPath  = join(opts.outDir, rel.replace(/\.mu$/, '.mu.js'));
        const dtsPath  = join(opts.outDir, rel.replace(/\.mu$/, '.mu.d.ts'));
        mkdirSync(dirname(outPath), { recursive: true });
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
    // Two source trees:
    //   * src/Basic     — the primitive control library (basic.template.mu)
    //   * src/framework — Control + complex controls (per-group templates
    //                     under framework/menu/, …). Output mirrors the
    //                     source structure under build/.
    const trees: ReadonlyArray<readonly [string, string]> = [
        [join(projectRoot, 'src',   'Basic'),     join(projectRoot, 'build', 'Basic')],
        [join(projectRoot, 'src',   'framework'), join(projectRoot, 'build', 'framework')],
    ];
    try
    {
        let total = 0;
        for (const [sourceDir, outDir] of trees)
        {
            total += buildControlTemplates({ sourceDir, outDir });
        }
        process.exit(total);
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
