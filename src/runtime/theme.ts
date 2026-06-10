// Theme + Scheme + ThemeManager — the engine that implements the
// two-level theme architecture (see theme-architecture.md at the repo
// root).
//
// Theme is the structural design language: control templates, default
// styles, DataTemplates, and a token catalog declaring what tokens the
// templates reference. A Theme owns no token VALUES — it owns the
// CONTRACT.
//
// Scheme is a pure value dictionary, declared against a specific Theme:
// `Material light`, `Material dark`, …. Schemes provide values for
// every token in the Theme's catalog.
//
// ThemeManager is a singleton that pairs a Theme with an active Scheme,
// merges their resources into Application.Resources, and exposes the
// activation API. SetTheme/CurrentTheme/ToggleTheme survive as thin
// convenience aliases over ActivateScheme.

import { Application } from './application.js';
import { ResourceDictionary } from './resource-dictionary.js';
import {
    Density,
    GetDensity,
    GetPointer,
    GetPrefersColorScheme,
    GetPrefersContrast,
    GetPrefersReducedMotion,
    GetViewportClass,
    MediaWatcher,
    Pointer,
    PreferredScheme,
    PrefersContrast,
    SetDensity,
    ViewportClass,
} from './adaptive.js';
import type { Visual } from './visual.js';

// ── Token catalog ──────────────────────────────────────────────────────

// String name of a recognised token type. Keep this open-ended (string
// rather than a strict union) so library consumers can author themes
// that reference types we haven't enumerated here without forking the
// runtime. The compiler does the strict validation against
// CATALOG_TYPES; runtime accepts the broader set.
export type TokenType = string;

// Catalog entry per token. Description is optional but recommended;
// the .mu compiler warns on missing descriptions in CI.
export interface TokenSpec
{
    readonly type:         TokenType;
    readonly description?: string;
}

// Catalog: token name → TokenSpec. Authored explicitly inside the
// `tokens { … }` block of a `.template.mu` theme bundle, then emitted
// as a frozen Map by the compiler.
export type TokenCatalog = ReadonlyMap<string, TokenSpec>;

// ── Scheme ────────────────────────────────────────────────────────────

export interface SchemeOptions
{
    /** Scheme name (e.g. 'light', 'dark', 'high-contrast-light'). */
    name: string;

    /** Name of the Theme this Scheme satisfies. The compiler validates
     *  that the merged token dict matches that Theme's catalog. */
    theme: string;

    /** Token values, keyed by token name. Every catalog entry of the
     *  target Theme must appear here (or come in via `basedOn`). */
    tokens: ReadonlyMap<string, unknown> | Record<string, unknown>;

    /** Optional cross-scheme borrow. Resolved at registration time by
     *  ThemeManager — the named scheme's tokens merge under this one's
     *  (this scheme wins). Borrowing across Themes is fine; the
     *  contract check applies to the merged result. */
    basedOn?: string;
}

// Scheme is a frozen value. ThemeManager handles the basedOn merge at
// registration time so the in-memory Scheme always carries its complete
// token dict.
export class Scheme
{
    public readonly name:    string;
    public readonly theme:   string;
    public readonly tokens:  ReadonlyMap<string, unknown>;
    public readonly basedOn: string | undefined;

    constructor(opts: SchemeOptions)
    {
        this.name    = opts.name;
        this.theme   = opts.theme;
        this.basedOn = opts.basedOn;
        this.tokens  = opts.tokens instanceof Map
            ? opts.tokens
            : new Map<string, unknown>(Object.entries(opts.tokens));
    }

    /** Fully-qualified scheme name: `<theme>.<scheme>`. Distinct from
     *  the short `name` — two themes can ship a scheme named `light`. */
    public get FullName(): string { return `${this.theme}.${this.name}`; }
}

/** Sugar over `new Scheme(opts)` — matches the spec's `defineScheme`. */
export function defineScheme(opts: SchemeOptions): Scheme
{
    return new Scheme(opts);
}

// ── Theme ─────────────────────────────────────────────────────────────

export interface ThemeOptions
{
    /** Theme name (e.g. 'material', 'fluent'). */
    name: string;

    /** Resource dictionaries holding the theme's ControlTemplates,
     *  default Styles, and DataTemplates. The compiler emits one or
     *  more of these per `.template.mu` theme bundle; consumers pass
     *  the array. ThemeManager merges them into Application.Resources
     *  when the Theme is activated. */
    templates: readonly ResourceDictionary[];

    /** Token catalog — the contract every Scheme must satisfy. Emitted
     *  by the compiler from the theme bundle's `tokens { … }` block.
     *  Used at registration to validate Schemes; at runtime acts as
     *  introspection metadata for tooling. */
    catalog: TokenCatalog;

    /** Schemes declared against this Theme. Compiler-validated; this is
     *  the registration-time list. */
    schemes: readonly Scheme[];

    /** Name of the Scheme to activate when ActivateTheme is called
     *  without an explicit scheme argument. Must match one of `schemes`. */
    defaultScheme: string;
}

export class Theme
{
    public readonly name:          string;
    public readonly templates:     readonly ResourceDictionary[];
    public readonly catalog:       TokenCatalog;
    public readonly schemes:       ReadonlyMap<string, Scheme>;
    public readonly defaultScheme: string;

    constructor(opts: ThemeOptions)
    {
        this.name          = opts.name;
        this.templates     = [...opts.templates];
        this.catalog       = opts.catalog;
        this.defaultScheme = opts.defaultScheme;

        const map = new Map<string, Scheme>();
        for (const s of opts.schemes)
        {
            if (s.theme !== opts.name)
            {
                throw new Error(
                    `Theme '${opts.name}': Scheme '${s.name}' targets theme `
                    + `'${s.theme}', not '${opts.name}'.`);
            }
            if (map.has(s.name))
            {
                throw new Error(
                    `Theme '${opts.name}': duplicate scheme '${s.name}'.`);
            }
            map.set(s.name, s);
        }
        if (!map.has(opts.defaultScheme))
        {
            throw new Error(
                `Theme '${opts.name}': defaultScheme '${opts.defaultScheme}' `
                + `is not one of the registered schemes (${[...map.keys()].join(', ')}).`);
        }
        this.schemes = map;
    }
}

/** Sugar over `new Theme(opts)` — matches the spec's `defineTheme`. */
export function defineTheme(opts: ThemeOptions): Theme
{
    return new Theme(opts);
}

// ── ThemeManager ──────────────────────────────────────────────────────

// Activation options for ActivateTheme — currently just `scheme` (the
// scheme name to activate alongside the theme).
export interface ActivateThemeOptions
{
    scheme?: string;
}

// Configuration for AutoScheme — pairs OS color-scheme preference with
// scheme names. `listen: true` attaches a matchMedia listener that
// re-activates on OS preference change; `listen: false` reads the
// preference once and pins it.
export interface AutoSchemeOptions
{
    light:  string;
    dark:   string;
    listen: boolean;
}

// Opt-in animation policy for scheme swaps. When set, Brush-typed
// tokens animate from their previous values to the new ones at the
// configured duration / easing; non-animatable token types
// (CornerRadius, number, Effect, …) snap regardless. Honours
// PrefersReducedMotion — when the ambient DP is true, every swap
// snaps.
//
// API surface only in v1 — the actual animation hook (a
// SolidColorBrushAnimation install at the DynamicResource level) is a
// follow-up. The property accepts and stores the config today so
// consumers can wire it now; transitions land in a later commit.
export interface SchemeTransition
{
    /** Animation length in milliseconds. */
    duration: number;
    /** Easing curve. Picks any of mural's standard easings. */
    easing?:  unknown;
    /** Which token types to animate. `'brushes-only'` is the default
     *  and only fully-supported value today. */
    tokens?:  'all' | 'brushes-only' | 'none';
}

// Singleton service. One ThemeManager per process — bound to whichever
// Application is current. Activation pushes resources into
// Application.current.Resources; if the current Application changes
// (test harness, multi-app host) the manager re-merges into the new
// one on the next activation call.
export class ThemeManager
{
    // ── Singleton ─────────────────────────────────────────────────────
    private static _instance: ThemeManager | undefined;

    public static get Current(): ThemeManager
    {
        if (ThemeManager._instance === undefined)
        {
            ThemeManager._instance = new ThemeManager();
        }
        return ThemeManager._instance;
    }

    // Test-only — reset all state. Used by tests that build fresh
    // Applications mid-suite and want a clean theme manager too.
    public static _resetForTesting(): void
    {
        ThemeManager._instance = undefined;
    }

    // ── Registered themes ─────────────────────────────────────────────

    private readonly _themes = new Map<string, Theme>();

    /** Register a Theme. Validates each Scheme against the Theme's
     *  catalog (every catalog token must be provided after `basedOn`
     *  merging; types must match). Throws on contract violation. */
    public RegisterTheme(theme: Theme): void
    {
        if (this._themes.has(theme.name))
        {
            throw new Error(`Theme '${theme.name}' is already registered.`);
        }
        // Resolve basedOn for every scheme; validate against catalog.
        for (const scheme of theme.schemes.values())
        {
            const merged = this.resolveBasedOn(scheme);
            this.validateAgainstCatalog(theme, scheme, merged);
        }
        this._themes.set(theme.name, theme);
    }

    /** Look up a registered Theme by name. */
    public GetTheme(name: string): Theme | undefined
    {
        return this._themes.get(name);
    }

    // Resolve `basedOn` chains. Returns the fully merged token dict for
    // the scheme. Detects circular borrowings.
    private resolveBasedOn(scheme: Scheme): Map<string, unknown>
    {
        const visited = new Set<string>();
        const merged  = new Map<string, unknown>();
        const walk = (s: Scheme): void =>
        {
            if (visited.has(s.FullName))
            {
                throw new Error(
                    `Scheme '${s.FullName}': circular basedOn chain.`);
            }
            visited.add(s.FullName);
            if (s.basedOn !== undefined)
            {
                const [parentTheme, parentScheme] = s.basedOn.split('.');
                if (parentTheme === undefined || parentScheme === undefined)
                {
                    throw new Error(
                        `Scheme '${s.FullName}': basedOn must be '<theme>.<scheme>', `
                        + `got '${s.basedOn}'.`);
                }
                const parent = this._themes.get(parentTheme)?.schemes.get(parentScheme);
                if (parent === undefined)
                {
                    throw new Error(
                        `Scheme '${s.FullName}': basedOn references unknown scheme `
                        + `'${s.basedOn}'. (Make sure the parent theme is registered first.)`);
                }
                walk(parent);
            }
            // Overlay this scheme's tokens (later wins).
            for (const [k, v] of s.tokens) merged.set(k, v);
        };
        walk(scheme);
        return merged;
    }

    // Validate that the merged token dict satisfies the theme's catalog.
    // Missing tokens are errors. Tokens beyond the catalog are
    // tolerated at runtime (the compiler issues a warning earlier).
    private validateAgainstCatalog(
        theme:  Theme,
        scheme: Scheme,
        merged: ReadonlyMap<string, unknown>,
    ): void
    {
        const missing: string[] = [];
        for (const name of theme.catalog.keys())
        {
            if (!merged.has(name)) missing.push(name);
        }
        if (missing.length > 0)
        {
            throw new Error(
                `Scheme '${scheme.FullName}' is missing tokens required by theme `
                + `'${theme.name}': ${missing.join(', ')}.`);
        }
    }

    // ── Activation state ──────────────────────────────────────────────

    private _activeTheme:    Theme  | undefined;
    private _activeScheme:   Scheme | undefined;
    private _activeApp:      Application       | undefined;
    private _activeTemplates: ResourceDictionary[]      = [];
    private _activeTokenDict: ResourceDictionary | undefined;

    public get ActiveTheme():  Theme  | undefined { return this._activeTheme; }
    public get ActiveScheme(): Scheme | undefined { return this._activeScheme; }

    // ── Adaptive context ──────────────────────────────────────────────
    //
    // Density is the only app-controlled adaptive DP (no OS source).
    // The other adaptive DPs (Pointer, PrefersContrast,
    // PrefersReducedMotion, PrefersColorScheme, ViewportClass) come
    // from the MediaWatcher service — exposed here as read-only
    // getters that bridge the inherited DP on the Application root.

    private readonly _mediaWatcher = new MediaWatcher();

    public get MediaWatcher(): MediaWatcher { return this._mediaWatcher; }

    /** Attach the MediaWatcher to a Visual (usually Application's
     *  root mount). Idempotent. After this, OS preference / viewport
     *  changes write the corresponding inherited DPs on `root`, which
     *  cascade to every descendant. */
    public StartMediaWatcher(root: Visual): void
    {
        this._mediaWatcher.Start(root);
    }

    /** Detach the MediaWatcher. Safe to call when not started. */
    public StopMediaWatcher(): void
    {
        this._mediaWatcher.Stop();
    }

    private rootVisual(): Visual | undefined
    {
        const app = Application.current;
        return app?.Resources?.Root;
    }

    public get Density(): Density
    {
        const v = this.rootVisual();
        return v !== undefined ? GetDensity(v) : Density.Regular;
    }

    public set Density(value: Density)
    {
        const v = this.rootVisual();
        if (v !== undefined) SetDensity(v, value);
    }

    public get ViewportClass(): ViewportClass
    {
        const v = this.rootVisual();
        return v !== undefined ? GetViewportClass(v) : ViewportClass.Desktop;
    }

    public get Pointer(): Pointer
    {
        const v = this.rootVisual();
        return v !== undefined ? GetPointer(v) : Pointer.Fine;
    }

    public get PrefersContrast(): PrefersContrast
    {
        const v = this.rootVisual();
        return v !== undefined ? GetPrefersContrast(v) : PrefersContrast.Normal;
    }

    public get PrefersReducedMotion(): boolean
    {
        const v = this.rootVisual();
        return v !== undefined ? GetPrefersReducedMotion(v) : false;
    }

    public get PrefersColorScheme(): PreferredScheme
    {
        const v = this.rootVisual();
        return v !== undefined ? GetPrefersColorScheme(v) : PreferredScheme.NoPreference;
    }

    // ── Scheme transitions ────────────────────────────────────────────
    //
    // Opt-in animation policy applied to ActivateScheme. Setting this
    // to a SchemeTransition object expresses intent — the actual
    // animation install at the DynamicResource layer is a follow-up
    // (the API surface ships now so consumers can wire their preferred
    // duration / easing without further code changes when the tween
    // lands). When undefined (default), all scheme swaps snap.
    private _schemeTransition: SchemeTransition | undefined;

    public get SchemeTransition(): SchemeTransition | undefined { return this._schemeTransition; }
    public set SchemeTransition(v: SchemeTransition | undefined) { this._schemeTransition = v; }

    /** Effective transition for the next scheme swap. Returns
     *  `undefined` when no transition was configured OR when the
     *  active PrefersReducedMotion DP is true (a11y override). The
     *  DynamicResource integration consults this before deciding
     *  whether to animate or snap a particular token swap. */
    public get EffectiveSchemeTransition(): SchemeTransition | undefined
    {
        if (this._schemeTransition === undefined) return undefined;
        if (this.PrefersReducedMotion)            return undefined;
        return this._schemeTransition;
    }

    /** Activate a Theme by name. Optionally specify a starting Scheme;
     *  defaults to the Theme's `defaultScheme`. */
    public ActivateTheme(name: string, opts?: ActivateThemeOptions): void
    {
        const theme = this._themes.get(name);
        if (theme === undefined)
        {
            throw new Error(
                `ThemeManager.ActivateTheme: theme '${name}' is not registered.`);
        }
        const schemeName = opts?.scheme ?? theme.defaultScheme;
        const scheme     = theme.schemes.get(schemeName);
        if (scheme === undefined)
        {
            throw new Error(
                `ThemeManager.ActivateTheme: theme '${name}' has no scheme `
                + `'${schemeName}'.`);
        }
        this.activate(theme, scheme);
    }

    /** Swap the scheme on the currently-active theme. */
    public ActivateScheme(name: string): void
    {
        if (this._activeTheme === undefined)
        {
            throw new Error(
                'ThemeManager.ActivateScheme: no active theme — call ActivateTheme first.');
        }
        const scheme = this._activeTheme.schemes.get(name);
        if (scheme === undefined)
        {
            throw new Error(
                `ThemeManager.ActivateScheme: theme '${this._activeTheme.name}' `
                + `has no scheme '${name}'.`);
        }
        this.activate(this._activeTheme, scheme);
    }

    /** Track OS color-scheme preference (`prefers-color-scheme`) and
     *  activate the matching scheme. `listen: true` attaches a
     *  matchMedia listener so future OS changes re-activate; `listen:
     *  false` reads once and pins. */
    public AutoScheme(opts: AutoSchemeOptions): void
    {
        const mq = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
            ? window.matchMedia('(prefers-color-scheme: dark)')
            : undefined;
        const pick = (dark: boolean): string => dark ? opts.dark : opts.light;
        this.ActivateScheme(pick(mq?.matches === true));
        if (opts.listen && mq !== undefined)
        {
            // detachable via removing the listener; for v1 we keep the
            // listener forever — the cost is one matchMedia handler.
            mq.addEventListener('change', e => this.ActivateScheme(pick(e.matches)));
        }
    }

    // The single mutator — merges resources into Application.Resources.
    // Idempotent for the (theme, scheme) pair against the same
    // Application; re-merges if the Application changed since last call.
    private activate(theme: Theme, scheme: Scheme): void
    {
        const app = Application.current;
        if (app === undefined || app === null)
        {
            throw new Error(
                'ThemeManager: no Application.current — construct an Application before activating a theme.');
        }

        // Same (theme, scheme, app) tuple? No-op.
        if (this._activeTheme === theme
            && this._activeScheme === scheme
            && this._activeApp   === app)
        {
            return;
        }

        // Strip out resources we previously merged.
        if (this._activeApp !== undefined)
        {
            for (const d of this._activeTemplates)
            {
                this._activeApp.Resources.RemoveMergedDictionary(d);
            }
            if (this._activeTokenDict !== undefined)
            {
                this._activeApp.Resources.RemoveMergedDictionary(this._activeTokenDict);
            }
        }
        this._activeTemplates  = [];
        this._activeTokenDict  = undefined;

        // Merge theme templates. The compiled `.template.mu.js`
        // dictionaries are immutable in practice — we add them as-is;
        // RemoveMergedDictionary in the deactivate branch is symmetric.
        // (Cloning would require a `Clone` method on the base
        // ResourceDictionary, which it doesn't currently expose — only
        // the .mu-compiled subclasses do.)
        const templateRefs: ResourceDictionary[] = [];
        for (const d of theme.templates)
        {
            app.Resources.AddMergedDictionary(d);
            templateRefs.push(d);
        }

        // Merge scheme token dict.
        const tokenDict = new ResourceDictionary();
        const mergedTokens = this.resolveBasedOn(scheme);
        for (const [k, v] of mergedTokens) tokenDict.Set(k, v);
        app.Resources.AddMergedDictionary(tokenDict);

        this._activeTheme     = theme;
        this._activeScheme    = scheme;
        this._activeApp       = app;
        this._activeTemplates = templateRefs;
        this._activeTokenDict = tokenDict;
    }
}
