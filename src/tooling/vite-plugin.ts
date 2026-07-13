import { compile, type CompileResult } from '../compiler/compile.js';
import type { CompilerOptions } from '../compiler/compiler.js';

// Structural Vite Plugin type — keeps `vite` out of this package's
// dependencies. Consumers pass the returned object into `plugins: []`
// in their `vite.config.ts`; Vite's own typings cover the rest. The
// fields here are the only ones Vite uses to dispatch `.mu`
// transforms, so a narrower type than `vite.Plugin` is a feature, not
// a limitation.
export interface VitePlugin
{
    name: string;
    enforce?: 'pre' | 'post';
    /** Called by Vite for each module — return `null` for files we
     *  don't handle so the rest of the pipeline runs untouched. */
    transform(code: string, id: string):
        | { code: string; map: null }
        | null;
}

export interface MuralPluginOptions extends CompilerOptions
{
    /** File extensions to treat as `.mu` source. Default: `['.mu']`. */
    extensions?: readonly string[];

    /** Hook invoked after each successful compile — receives the
     *  full CompileResult. Useful for tooling that wants to inspect
     *  emitted imports (per-module symbol audit, dependency graphs,
     *  diagnostics dashboards). */
    onCompile?: (id: string, result: CompileResult) => void;
}

// Vite plugin that compiles `.mu` source into an ES module at build
// time. Drop into `vite.config.ts`:
//
//   import { vitePluginMural } from 'mural/tooling';
//   export default { plugins: [vitePluginMural()] };
//
// Then in app code:
//
//   import { app } from './dashboard.mu';
//   app.Mount(document.getElementById('root'));
//
// The plugin runs with `enforce: 'pre'` so other transformers see
// already-compiled JS, never raw mural source. HMR is left to Vite's
// default page-reload behaviour for now; finer-grained HMR (replacing
// individual styles or templates without re-mounting the app) is a
// later refinement that needs a runtime-side accept handler.
export function vitePluginMural(options: MuralPluginOptions = {}): VitePlugin
{
    const extensions = options.extensions ?? ['.mu'];
    const { onCompile, ...compilerOpts } = options;

    return {
        name:    'vite-plugin-mural',
        enforce: 'pre',

        transform(code: string, id: string): { code: string; map: null } | null
        {
            // Strip the query string Vite appends (`?import`, `?worker`,
            // etc.) before extension-matching so query-decorated imports
            // still route through us.
            const file = id.split('?', 1)[0]!;
            if (!extensions.some(ext => file.endsWith(ext))) return null;

            const result = compile(code, compilerOpts);
            onCompile?.(id, result);
            return { code: result.js, map: null };
        },
    };
}
