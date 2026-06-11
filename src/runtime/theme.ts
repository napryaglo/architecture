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
import type { AnimationTimeline, EasingFunction } from './animation/index.js';
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

    /** Resource dictionaries the theme owns — ControlTemplates,
     *  default Styles, DataTemplates, and any other resources the
     *  theme ships. Authored declaratively in the `.mu` theme block's
     *  `dictionaries: [BasicTheme, SurfaceTheme, …]` header plus any
     *  body content (the theme's own resources). ThemeManager merges
     *  the whole list into Application.Resources when the Theme is
     *  activated, in array order — earlier entries are shadowed by
     *  later ones for the same key. */
    dictionaries: readonly ResourceDictionary[];

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
    public readonly dictionaries:  readonly ResourceDictionary[];
    public readonly catalog:       TokenCatalog;
    public readonly schemes:       ReadonlyMap<string, Scheme>;
    public readonly defaultScheme: string;

    /** Activate this theme's instance on the global ThemeManager,
     *  optionally with a specific scheme. Base implementation throws —
     *  the compiler-emitted subclass (`class Foo extends Theme` from a
     *  `.mu` theme bundle) supplies a concrete override that resolves
     *  its singleton instance and calls ThemeManager.ActivateTheme.
     *
     *  Application.initialize calls this on the registered theme class,
     *  so a hand-authored subclass that forgets to override surfaces as
     *  a clear runtime error rather than silently doing nothing. */
    public static Activate(_scheme?: typeof Scheme): void
    {
        throw new Error(
            `Theme.Activate: base implementation invoked on '${this.name}'. ` +
            `Theme subclasses must override the static Activate method.`);
    }

    constructor(opts: ThemeOptions)
    {
        this.name          = opts.name;
        this.dictionaries  = [...opts.dictionaries];
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
// The actual animation install runs at the DynamicResource layer.
// Whoever owns the animatable value type (visual-engine for
// SolidColorBrush) registers a SchemeTransitionAnimatorFactory via
// `registerSchemeTransitionAnimator`; DynamicResource consults the
// factory on each resolved-value change and Begins a Storyboard on
// its watcher when a timeline is produced.
export interface SchemeTransition
{
    /** Animation length in milliseconds. */
    duration: number;
    /** Easing curve applied to the produced timeline. The animator
     *  factory copies this onto the timeline it returns. */
    easing?:  EasingFunction;
    /** Which token types to animate. `'brushes-only'` is the default
     *  and only fully-supported value today. `'none'` skips the
     *  factory call entirely — every swap snaps. */
    tokens?:  'all' | 'brushes-only' | 'none';
}

// Builder that produces a timeline for a single resolved-value change.
// Receives the old and new values plus the active SchemeTransition.
// Return `undefined` to snap (caller falls back to direct
// watcher.Value = newValue). The returned timeline targets the
// DynamicResource's internal watcher.Value — the factory must build a
// timeline whose Evaluate produces values assignable to the bound
// resource slot.
//
// Registration is a process-global hook installed at module load —
// visual-engine's SolidColorBrush integration registers one. Only one
// factory is supported (last registration wins); a future
// multi-animator setup can layer this as a composite.
export type SchemeTransitionAnimatorFactory = (
    oldValue: unknown,
    newValue: unknown,
    transition: SchemeTransition,
) => AnimationTimeline | undefined;

let _schemeTransitionAnimatorFactory: SchemeTransitionAnimatorFactory | undefined;

/** Register the process-global animator factory. Pass `undefined` to
 *  unregister (test helper — production code calls this once at
 *  startup from whichever module owns the animatable value types). */
export function registerSchemeTransitionAnimator(
    factory: SchemeTransitionAnimatorFactory | undefined,
): void
{
    _schemeTransitionAnimatorFactory = factory;
}

/** Read the currently-registered animator factory. DynamicResource
 *  calls this on every resolved-value change while a SchemeTransition
 *  is effective. */
export function getSchemeTransitionAnimator(): SchemeTransitionAnimatorFactory | undefined
{
    return _schemeTransitionAnimatorFactory;
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
    private _activeDictionaries: ResourceDictionary[]   = [];
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
            for (const d of this._activeDictionaries)
            {
                this._activeApp.Resources.RemoveMergedDictionary(d);
            }
            if (this._activeTokenDict !== undefined)
            {
                this._activeApp.Resources.RemoveMergedDictionary(this._activeTokenDict);
            }
        }
        this._activeDictionaries = [];
        this._activeTokenDict    = undefined;

        // Merge the theme's dictionaries in array order — later entries
        // shadow earlier ones for the same key. The compiled
        // `.template.mu.js` outputs are mutable per-instance (each
        // .Clone() in the Theme ctor produces a fresh ResourceDictionary
        // subclass) so re-activation is symmetric without aliasing.
        const dictionaryRefs: ResourceDictionary[] = [];
        for (const d of theme.dictionaries)
        {
            app.Resources.AddMergedDictionary(d);
            dictionaryRefs.push(d);
        }

        // Merge scheme token dict.
        const tokenDict = new ResourceDictionary();
        const mergedTokens = this.resolveBasedOn(scheme);
        for (const [k, v] of mergedTokens) tokenDict.Set(k, v);
        app.Resources.AddMergedDictionary(tokenDict);

        this._activeTheme        = theme;
        this._activeScheme       = scheme;
        this._activeApp          = app;
        this._activeDictionaries = dictionaryRefs;
        this._activeTokenDict    = tokenDict;
    }
}
