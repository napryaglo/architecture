// Workspace-wide resource index.
//
// The per-document analyzer only sees the open file, but most `@key`
// references point at resources declared in OTHER files — theme schemes
// (`@Primary = …` in light.mu / dark.mu), shared dictionaries, sibling
// demos. This index parses every `.mu` in the workspace once at startup
// and keeps a global key → declaration(s) map so go-to-definition and
// the workspace-symbol search can reach across files.
//
// "Whole workspace, all .mu" semantics: a key may be declared in several
// files (e.g. @Primary in both light.mu and dark.mu). We keep every
// declaration and let the editor present the list.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { collectResources, type ResourceDef } from './analyzer.js';

export interface IndexedResource extends ResourceDef
{
    /** File URI of the declaring document — the go-to-definition target. */
    uri: string;
}

// Directories we never descend into — build output, deps, VCS metadata.
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.vscode',
]);

export class WorkspaceIndex
{
    // Canonical fs-path → that file's declarations. Keyed by path (not
    // URI) so the open-document URI form (`file:///c%3A/…`) and the
    // scanned form (`file:///C:/…`) collapse to one entry.
    private readonly byFile = new Map<string, IndexedResource[]>();
    // Resource key → every declaration of it across the workspace.
    private readonly byKey  = new Map<string, IndexedResource[]>();

    /** Scan the given workspace folder paths for `.mu` files and index
     *  each one. Safe to call once at startup; folder paths are OS paths. */
    public async scan(folders: readonly string[]): Promise<void>
    {
        for (const folder of folders)
        {
            await this.scanDir(folder);
        }
    }

    private async scanDir(dir: string): Promise<void>
    {
        let entries: import('node:fs').Dirent[];
        try
        {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch
        {
            return;   // unreadable dir — skip silently
        }
        for (const entry of entries)
        {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory())
            {
                if (SKIP_DIRS.has(entry.name)) continue;
                await this.scanDir(full);
            }
            else if (entry.isFile() && entry.name.endsWith('.mu'))
            {
                let text: string;
                try { text = await fs.readFile(full, 'utf8'); }
                catch { continue; }
                this.indexPath(full, text);
            }
        }
    }

    /** (Re)index a single file given its URI and current text. Called for
     *  open-document edits and watched-file changes. */
    public indexText(uri: string, text: string): void
    {
        const fsPath = uriToPath(uri);
        if (fsPath === null) return;
        this.indexPath(fsPath, text, uri);
    }

    /** Drop a file from the index (deletion / close). */
    public remove(uri: string): void
    {
        const fsPath = uriToPath(uri);
        if (fsPath === null) return;
        this.removePath(fsPath);
    }

    /** Every declaration of `key` across the workspace, in scan order. */
    public lookup(key: string): readonly IndexedResource[]
    {
        return this.byKey.get(key) ?? [];
    }

    /** All declarations — used by the workspace-symbol provider. */
    public all(): IterableIterator<IndexedResource>
    {
        return this.iterate();
    }

    public get fileCount(): number { return this.byFile.size; }

    // ── internals ────────────────────────────────────────────────────

    private indexPath(fsPath: string, text: string, uri?: string): void
    {
        this.removePath(fsPath);
        const key = canonical(fsPath);
        const fileUri = uri ?? pathToFileURL(fsPath).toString();
        const defs: IndexedResource[] = collectResources(text)
            .map(d => ({ ...d, uri: fileUri }));
        if (defs.length === 0)
        {
            // Still record the (empty) file so a later edit that removes
            // the last resource leaves no stale byKey entries.
            this.byFile.set(key, []);
            return;
        }
        this.byFile.set(key, defs);
        for (const def of defs)
        {
            const bucket = this.byKey.get(def.key);
            if (bucket === undefined) this.byKey.set(def.key, [def]);
            else bucket.push(def);
        }
    }

    private removePath(fsPath: string): void
    {
        const key = canonical(fsPath);
        const prev = this.byFile.get(key);
        if (prev === undefined) return;
        this.byFile.delete(key);
        for (const def of prev)
        {
            const bucket = this.byKey.get(def.key);
            if (bucket === undefined) continue;
            const next = bucket.filter(d => d !== def);
            if (next.length === 0) this.byKey.delete(def.key);
            else this.byKey.set(def.key, next);
        }
    }

    private *iterate(): IterableIterator<IndexedResource>
    {
        for (const defs of this.byFile.values())
        {
            for (const def of defs) yield def;
        }
    }
}

// ── URI <-> path helpers ─────────────────────────────────────────────
//
// We avoid a vscode-uri dependency (not installed) and lean on Node's
// url helpers. VS Code emits `file:///c%3A/…` while Node's pathToFileURL
// emits `file:///C:/…`; both parse to the same fsPath, and the editor
// opens a Location by fsPath, so either form is safe to return. For
// dedup we canonicalize to a lowercased path on case-insensitive hosts.

function uriToPath(uri: string): string | null
{
    if (!uri.startsWith('file:')) return null;
    try { return fileURLToPath(uri); }
    catch { return null; }
}

function canonical(fsPath: string): string
{
    const normalized = path.normalize(fsPath);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
