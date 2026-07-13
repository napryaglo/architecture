// Bundles the two entry points (client + LSP server) into a single
// self-contained CJS file each. Bundling lets the VSIX ship without
// any node_modules — vsce can't follow the npm `file:` symlink into
// the parent monorepo, and CJS keeps activation compatible with
// VS Code's extension host across versions.
//
// Only `vscode` is marked external — VS Code provides it at runtime;
// everything else (LSP libs + the mural compiler)
// is inlined.

import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const common = {
    bundle:      true,
    platform:    'node',
    format:      'cjs',
    target:      'node20',
    sourcemap:   true,
    external:    ['vscode'],
    logLevel:    'info',
};

const targets = [
    { entryPoints: ['src/extension.ts'], outfile: 'out/extension.js' },
    { entryPoints: ['src/server.ts'],    outfile: 'out/server.js'    },
];

if (watch)
{
    for (const t of targets)
    {
        const ctx = await context({ ...common, ...t });
        await ctx.watch();
    }
    console.log('esbuild: watching for changes…');
}
else
{
    await Promise.all(targets.map(t => build({ ...common, ...t })));
}
