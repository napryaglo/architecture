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
import { svgToGeometryJs } from './svg-geometry.js';

const VISUAL_ENGINE = '@visualisation-sub/mural/visual-engine';

export function makeIncludeResolver(baseDir: string): IncludeResolver
{
    return (spec: string, ctx: { key: string | undefined }): IncludeResolution =>
    {
        const matches = resolveMatches(baseDir, spec);
        if (matches.length === 0)
        {
            throw new Error(`no files matched "${spec}" (relative to ${baseDir})`);
        }
        const entries: Array<{ key: string; valueJs: string }> = [];
        const names = new Set<string>();
        for (const m of matches)
        {
            const ext = extname(m.abs).toLowerCase();
            if (ext !== '.svg')
            {
                throw new Error(
                    `unsupported include type '${ext}' for ${m.abs} — only .svg is handled today`);
            }
            const { valueJs, names: used } = svgToGeometryJs(readFileSync(m.abs, 'utf8'));
            for (const u of used) names.add(u);
            entries.push({ key: ctx.key ?? m.key, valueJs });
        }
        return {
            entries,
            imports: names.size > 0
                ? [{ module: VISUAL_ENGINE, names: [...names].sort() }]
                : [],
        };
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
