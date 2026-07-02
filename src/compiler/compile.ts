import { Parser } from './parser.js';
import { Compiler, EmitError, ExportName, type CompilerOptions, type CompilerOutput } from './compiler.js';
import { DEFAULT_SLOT_INFO } from './symbol-table.js';

// Public compiler entry points. The internal pipeline is the same for
// both — Lexer → Parser → Compiler.Compile() — only the wrap differs:
//
//   * `compile(source)`  → an ES-module source string with `import {…}`
//     statements at the top and an `export const app` / `export function
//     create()` at the bottom. The build-time path: a bundler plugin or
//     CLI writes this to `<name>.mu.js` and the consumer imports it.
//
//   * `instantiate(source, ctx)` → runs the same body inside
//     `new Function(_ctx, body)` after a destructuring prelude that
//     pulls every required symbol off `ctx`. The dynamic path: server-
//     delivered templates, designer hot-reload, prototyping. Caller
//     supplies a ctx object that has every runtime/Controls/visual-
//     engine symbol the source might reference.

// Re-exported so callers can pattern-match without reaching into the
// compiler module.
export { EmitError } from './compiler.js';

export interface CompileResult
{
    /** Whole-module JS source ready to write to a `.mu.js` file. */
    js: string;
    /** Output shape — drives how the build tool emits the companion
     *  `.d.ts`. `'application'` exports `const app`; `'fragment'` exports
     *  `function create()`; `'resources'` exports one or more
     *  `class … extends ResourceDictionary` declarations (see
     *  `resourcesBlocks` for the typed-accessor metadata). */
    kind: 'application' | 'fragment' | 'resources' | 'module';
    /** Whether the root form was `Application{…}`. Retained for callers
     *  that still branch on this flag; `kind === 'application'` is
     *  equivalent. */
    isApplication: boolean;
    /** Suggested export name. Empty string for `'resources'` files (which
     *  carry one or more named class exports — branch on `kind`). */
    exportName: ExportName;
    /** Module → symbol set. Same data the imports header was built from
     *  — exposed for tooling that wants to introspect or post-process. */
    imports: Map<string, Set<string>>;
    /** For `kind === 'resources'`: metadata for each `resources NAME { … }`
     *  AND each `theme NAME { … }` block in the source — class name,
     *  imported aliases, and the x:name'd resource property pairs the
     *  `.d.ts` companion declares. */
    resourcesBlocks?: ResourcesBlockMeta[];
    /** Names of any `theme NAME { … }` blocks. Drives the `.d.ts`
     *  emitter to also declare the sibling `NAMECatalog` const. */
    themeNames?:     string[];
    /** Names of any `scheme NAME against … { … }` blocks. Drives the
     *  `.d.ts` emitter to declare `export const NAME: Scheme`. */
    schemeNames?:    string[];
}

export interface ResourcesBlockMeta
{
    name:      string;
    imports:   string[];
    accessors: Array<{ name: string; type: string }>;
}

// Build a sorted import line set from the imports map. Deterministic
// output makes the compiled JS diff-stable across runs.
function formatImports(imports: Map<string, Set<string>>): string
{
    if (imports.size === 0) return '';
    const lines: string[] = [];
    const modules = [...imports.keys()].sort();
    for (const mod of modules)
    {
        const syms = [...imports.get(mod)!].sort();
        lines.push(`import { ${syms.join(', ')} } from ${JSON.stringify(mod)};`);
    }
    return lines.join('\n');
}

function indent(text: string, spaces: number): string
{
    const pad = ' '.repeat(spaces);
    return text.split('\n').map(line => line.length === 0 ? line : pad + line).join('\n');
}

// Source-to-source: returns the JS module text.
export function compile(source: string, options: CompilerOptions = {}): CompileResult
{
    const out = runPipeline(source, options);
    const importsBlock = formatImports(out.imports);
    let exportBlock: string;
    if (out.kind === 'application')
    {
        exportBlock =
            `export const app = (() => {\n` +
            indent(out.body, 4) +
            `\n})();`;
    }
    else if (out.kind === 'resources')
    {
        // No wrap — the body is already a complete module-scope set of
        // `export class … extends ResourceDictionary` declarations.
        exportBlock = out.body;
    }
    else if (out.kind === 'module')
    {
        // `module NAME { … }` → an eagerly-built ShellModule const, same IIFE
        // shape as `export const app` but under the module's own name.
        exportBlock =
            `export const ${out.moduleName} = (() => {\n` +
            indent(out.body, 4) +
            `\n})();`;
    }
    else
    {
        exportBlock =
            `export function create() {\n` +
            indent(out.body, 4) +
            `\n}`;
    }
    const js = (importsBlock.length > 0)
        ? `${importsBlock}\n\n${exportBlock}\n`
        : `${exportBlock}\n`;
    return {
        js,
        kind:            out.kind,
        isApplication:   out.isApplication,
        exportName:      out.exportName,
        imports:         out.imports,
        resourcesBlocks: out.resourcesBlocks,
        themeNames:      out.themeNames,
        schemeNames:     out.schemeNames,
    };
}

// Compile + run in-process. The caller's `ctx` object must contain
// every symbol the source references — typically the consumer does:
//
//   import * as runtime      from '@vsm/runtime';
//   import * as controls     from '@vsm/Controls';
//   import * as engine       from '@vsm/visual-engine';
//   const ctx = { ...runtime, ...controls, ...engine };
//   const app = instantiate(source, ctx);
//
// Returns `app` (Application) when the root is Application{…}, or
// invokes the factory and returns its result for fragments.
export function instantiate(
    source: string,
    ctx: Record<string, unknown>,
    options: CompilerOptions = {},
): unknown
{
    const out = runPipeline(source, options);
    // Flatten required symbols across all modules and pull them off ctx.
    const uniqSyms = new Set<string>();
    for (const set of out.imports.values()) for (const s of set) uniqSyms.add(s);
    const sortedSyms = [...uniqSyms].sort();
    // Verify each requested symbol is present — catches the common
    // "you forgot to spread a module into ctx" mistake at the right
    // layer rather than as a vague ReferenceError mid-body.
    for (const sym of sortedSyms)
    {
        if (!(sym in ctx))
        {
            throw new EmitError(
                `instantiate: ctx is missing symbol '${sym}'`);
        }
    }
    const destructure = (sortedSyms.length > 0)
        ? `const { ${sortedSyms.join(', ')} } = _ctx;\n`
        : '';
    const fnBody = destructure + out.body;

    // The compiled body ends in `return <var>;` and is wrapped in a
    // function whose only parameter is `_ctx`. The new-Function path
    // costs the same as eval'ing a script + invoking, with the
    // advantage that the closure scope is clean (no leaks).
    const fn = new Function('_ctx', fnBody) as (c: Record<string, unknown>) => unknown;
    if (out.isApplication)
    {
        // Eager-construct an Application — same shape as `export const app`.
        return fn(ctx);
    }
    // Fragment — return the factory itself so the caller can construct
    // each instance separately, matching the `export function create()` shape.
    return () => fn(ctx);
}

function runPipeline(source: string, options: CompilerOptions): CompilerOutput
{
    // Wire the parser's text-mode dispatch from the compiler's slot
    // registry so a TextBlock's `{Hello}` body lexes as one TextRun
    // instead of two stray Idents.
    const slots = options.slots ?? DEFAULT_SLOT_INFO;
    const parser = new Parser(source, {
        isStringBody: (name) => slots.get(name)?.kind === 'string',
    });
    const doc = parser.ParseDocument();
    const compiler = new Compiler(options);
    return compiler.Compile(doc);
}
