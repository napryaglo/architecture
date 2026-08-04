// Filesystem-backed `include` resolver for the build pipeline.
//
// The compiler's `include` keyword is policy-free — it delegates to this
// resolver, which owns filesystem access and per-extension conversion.
// v1 dispatches `.svg` → a Geometry resource (via svgToGeometryJs); other
// extensions are a clear error until their handlers land (e.g. `.mu` →
// resource merge).
//
// Path forms (relative to the including .mu file):
//   * single file   "icons/home.svg"          → keyed by basename (or `as`)
//   * simple glob    "icons/*.svg"             → one resource per match,
//                                                keyed by basename
//
// Only a single trailing `dir/*.ext` glob is supported — no `**`, no brace
// expansion. That covers the icon-folder case without a glob dependency.

import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { IncludeResolver, IncludeResolution } from '../compiler/compiler.js';
import { svgToGeometryJs, svgToIconJs } from './svg-geometry.js';

const VISUAL_ENGINE = '@pragmatic-lab/mural/visual-engine';

// Raster image extensions → MIME type. A raster include base64-embeds the file
// into an ImageBrush(BitmapImage(dataURI)) resource (a singleton — see the emit).
const RASTER_MIME: Readonly<Record<string, string>> = {
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif':  'image/gif',
};

export function makeIncludeResolver(baseDir: string): IncludeResolver
{
    return (spec: string, ctx: { key: string | undefined; colored: boolean }): IncludeResolution =>
    {
        const matches = resolveMatches(baseDir, spec);
        if (matches.length === 0)
        {
            throw new Error(`no files matched "${spec}" (relative to ${baseDir})`);
        }
        const entries: Array<{ key: string; valueJs: string; singleton?: boolean }> = [];
        const byModule = new Map<string, Set<string>>();
        const addNames = (module: string, names: readonly string[]): void =>
        {
            let set = byModule.get(module);
            if (set === undefined) { set = new Set<string>(); byModule.set(module, set); }
            for (const nm of names) set.add(nm);
        };

        for (const m of matches)
        {
            const ext = extname(m.abs).toLowerCase();
            if (ext === '.svg')
            {
                const text = readFileSync(m.abs, 'utf8');
                if (ctx.colored)
                {
                    const { valueJs, imports } = svgToIconJs(text);
                    for (const imp of imports) addNames(imp.module, imp.names);
                    entries.push({ key: ctx.key ?? m.key, valueJs });
                }
                else
                {
                    const { valueJs, names } = svgToGeometryJs(text);
                    addNames(VISUAL_ENGINE, names);
                    entries.push({ key: ctx.key ?? m.key, valueJs });
                }
                continue;
            }
            const mime = RASTER_MIME[ext];
            if (mime !== undefined)
            {
                // Base64-embed the image into an ImageBrush(BitmapImage(dataURI)).
                // Flagged `singleton` so the compiler hoists it to a module-scope
                // const shared across every ResourceDictionary.Clone().
                const bytes   = readFileSync(m.abs);
                const dataUri = `data:${mime};base64,${bytes.toString('base64')}`;
                addNames(VISUAL_ENGINE, ['BitmapImage', 'ImageBrush']);
                entries.push({
                    key:       ctx.key ?? m.key,
                    valueJs:   `new ImageBrush(new BitmapImage(${JSON.stringify(dataUri)}))`,
                    singleton: true,
                });
                continue;
            }
            throw new Error(
                `unsupported include type '${ext}' for ${m.abs} — only .svg and raster `
                + `images (${Object.keys(RASTER_MIME).join(', ')}) are handled`);
        }

        const imports = [...byModule.entries()]
            .filter(([, set]) => set.size > 0)
            .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
            .map(([module, set]) => ({ module, names: [...set].sort() }));
        return { entries, imports };
    };
}

// Resolve a single file or a `dir/*.ext` glob to absolute paths + basename
// keys, sorted for deterministic emit.
function resolveMatches(baseDir: string, spec: string): Array<{ abs: string; key: string }>
{
    if (!spec.includes('*'))
    {
        return [{ abs: join(baseDir, spec), key: basename(spec, extname(spec)) }];
    }
    const dirPart = dirname(spec);
    const pattern = basename(spec);   // e.g. "*.svg"
    const re      = globToRegExp(pattern);
    const absDir  = join(baseDir, dirPart);
    return readdirSync(absDir)
        .filter(f => re.test(f))
        .sort()
        .map(f => ({ abs: join(absDir, f), key: basename(f, extname(f)) }));
}

// Translate a single-segment glob ("*.svg", "icon-*.svg") to an anchored
// regex. Escapes every regex metachar except `*`, which becomes `.*`.
function globToRegExp(pattern: string): RegExp
{
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
}
