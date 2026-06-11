import { ResourceDictionary, type ResourceKey } from './resource-dictionary.js';
import type { Visual } from './visual.js';

/** Theme class accepted by Application.initialize. Any subclass of
 *  `Theme` with the static `Activate(scheme?)` method satisfies this
 *  — the compiler-emitted `.mu` theme class implements it, as does
 *  the hand-written `Material` class. Kept as a structural type so
 *  consumers can author themes that don't share a base import. */
export interface ActivatableTheme extends Function
{
    Activate(scheme?: Function): void;
}

// Options for Application.initialize. Optional — when omitted, the
// theme registered via `Application.RegisterDefaultTheme(...)` is
// activated with its default scheme. Pass class references
// (`Material`, `MaterialLight`), never strings — the no-string-type-
// proxies rule applies here too.
export interface ApplicationInitOptions
{
    /** Theme class to activate. Defaults to whichever theme was
     *  registered first via `Application.RegisterDefaultTheme` when
     *  omitted. */
    theme?:  ActivatableTheme;

    /** Scheme class to activate inside the named theme. Defaults to
     *  the theme's `DefaultScheme` when omitted. */
    scheme?: Function;
}

// Root container for a µ-mural application. Owns app-wide resources
// (themes, implicit styles, keyed templates, named brushes) and
// designates which Visual gets attached to a PresentationTarget at
// mount time.
//
// What Application is NOT: it isn't a Visual, doesn't participate in
// layout or render, doesn't dispatch events. Its only roles are
//   (1) holding the root ResourceDictionary,
//   (2) being the terminal stop of Visual.TryFindResource's ancestor
//       walk so app-level resources resolve from anywhere in the tree,
//   (3) carrying the x:root marker (via Resources.Root) so the host
//       knows what to mount.
//
// `current` is the WPF-style ambient singleton. Set in the constructor
// (last-construction-wins). For multi-app contexts (SSR with concurrent
// requests, embedded surfaces in a host app) callers can ignore
// `current` and pass an Application instance explicitly — the resource
// walk's fallback consults `current` only when the tree's logical
// parent chain exhausts without resolving.
//
// `Mount` is the generic ergonomic entry point: takes any object with
// a writable `Content` slot (typically a PresentationTarget subclass —
// HtmlTarget, HeadlessTarget) and writes Root into it. Duck-typed on
// purpose to keep the runtime layer from importing visual-engine; the
// consumer's import of HtmlTarget (or HeadlessTarget) supplies the
// concrete target type.

export interface MountableTarget
{
    Content: Visual | undefined;
}

export class Application
{
    // Ambient singleton — last constructed instance wins. Cleared
    // explicitly by tests that need isolation.
    public static current: Application | null = null;

    public readonly Resources: ResourceDictionary = new ResourceDictionary();

    constructor()
    {
        Application.current = this;
    }

    // Resolve a resource (typically a default ControlTemplate) by key.
    // Walks `Application.current.Resources`, which the active theme
    // populates via its `dictionaries:` header (BasicTheme, SurfaceTheme,
    // and the theme's own body dict are all merged in by
    // ThemeManager.activate). A theme that hasn't been activated will
    // return undefined — `app.initialize({ theme, scheme })` is
    // mandatory before constructing any control that reads its
    // default Style.
    //
    // Accepts `string | Function` keys: built-in control templates are
    // keyed by the control's class function (Button, ListBox, …) under
    // the no-string-type-proxies rule; ad-hoc resources stay string-keyed.
    //
    // Class-keyed lookups walk the prototype chain on miss: a Style with
    // TargetType = ToggleButton (which doesn't register a theme of its
    // own) cleanly falls back to the Button theme it inherits from. This
    // matches the way DefaultStyleKey resolves and lets `[TargetType=X]`
    // Styles auto-BasedOn the nearest ancestor's theme without forcing
    // each subclass to redeclare its theme entry.
    public static ResolveDefaultResource<T = unknown>(key: ResourceKey): T | undefined
    {
        const app = Application.current;
        if (app === null) return undefined;
        for (let cur: ResourceKey | null = key; cur !== null; cur = nextPrototypeKey(cur))
        {
            const v = app.Resources.Resolve(cur);
            if (v !== undefined) return v as T;
        }
        return undefined;
    }

    // The visual marked with `x:root` in the application's resources.
    // Delegates to Resources.Root so there's a single source of truth
    // and a single setter (the dictionary's). Reads as undefined until
    // the compiler-emitted bind pass registers a root.
    public get Root(): Visual | undefined
    {
        return this.Resources.Root;
    }

    // ── Initialisation lifecycle ─────────────────────────────────────
    //
    // `initialize()` is the canonical "ready before any control gets
    // constructed" hook. Demo bootstraps call it after `new
    // Application()` and BEFORE building the visual tree — that ordering
    // guarantees DynamicResource lookups in the first paint see the
    // active theme's token dictionary, rather than resolving to
    // `undefined` and falling back to default-value brushes.
    //
    // What it does:
    //   1. If `opts.theme` is provided, calls
    //      `ThemeManager.Current.ActivateTheme(theme, { scheme })` —
    //      same effect as the legacy `SetTheme(scheme)` helper, but
    //      generic across theme bundles.
    //   2. Marks the Application as initialised. `IsInitialized` flips
    //      to `true`; future tooling can assert against this.
    //
    // Idempotent — repeat calls are no-ops, so demo modules that import
    // each other can both call `initialize()` without conflict. The
    // first call wins.
    //
    // The named theme must already be registered with ThemeManager
    // BEFORE initialize runs. The standard pattern is to import the
    // theme bundle so its module-load side effect performs the
    // registration:
    //
    //   import '@visualisation-sub/mural/resources/material'; // registers Material
    //   const app = new Application();
    //   app.initialize({ theme: 'material', scheme: 'light' });
    //   // …construct the visual tree…
    private _initialized = false;

    public get IsInitialized(): boolean { return this._initialized; }

    // ── Default-theme registry ───────────────────────────────────────
    //
    // Theme bundles register themselves as default candidates at
    // module-load time. The FIRST class to call this wins; subsequent
    // registrations are ignored. Importing
    // `@visualisation-sub/mural/resources/material` enrols `Material`
    // as the default — every demo that loads the Material bundle gets
    // it for free.
    //
    // This is NOT a callback hook: Application doesn't store a thunk
    // it calls later. The registered value is a CLASS reference whose
    // own static `Activate` method runs the activation. The class owns
    // its behaviour; Application just remembers which class is the
    // default.
    private static _defaultTheme: ActivatableTheme | undefined;

    public static RegisterDefaultTheme(themeClass: ActivatableTheme): void
    {
        if (Application._defaultTheme === undefined)
        {
            Application._defaultTheme = themeClass;
        }
    }

    /** The registered default theme, or `undefined` when no theme
     *  bundle has been imported yet. Test helper — production code
     *  should rely on `initialize()` picking it up implicitly. */
    public static get DefaultTheme(): ActivatableTheme | undefined
    {
        return Application._defaultTheme;
    }

    /** Test-only — drops the registered default so the next theme
     *  bundle re-registers on import. Production code never calls
     *  this; tests use it after `ThemeManager._resetForTesting`. */
    public static _resetDefaultThemeForTesting(): void
    {
        Application._defaultTheme = undefined;
    }

    public initialize(opts?: ApplicationInitOptions): void
    {
        if (this._initialized) return;
        const themeClass = opts?.theme ?? Application._defaultTheme;
        if (themeClass !== undefined)
        {
            themeClass.Activate(opts?.scheme);
        }
        this._initialized = true;
    }

    // Attach Root to a mountable target and return the target. Throws
    // when no x:root marker has been registered — mounting an
    // Application with nothing to show is a programming error worth
    // catching loudly. The target keeps responsibility for layout +
    // render + lifecycle; Application's job ends after the assignment.
    public Mount<T extends MountableTarget>(target: T): T
    {
        if (this.Root === undefined)
        {
            throw new Error(
                'Application.Mount: no x:root marker in Resources — nothing to mount.',
            );
        }
        target.Content = this.Root;
        return target;
    }
}

// Walk the prototype chain of a class-keyed lookup. String keys end
// the walk immediately (they're not class-shaped). For Function keys,
// `Object.getPrototypeOf(C)` is `C`'s parent constructor — `Button`'s
// parent is `ContentControl`, etc. The walk terminates when the chain
// hits the base `Function.prototype` (Object's own constructor proto).
function nextPrototypeKey(key: ResourceKey): ResourceKey | null
{
    if (typeof key !== 'function') return null;
    const proto = Object.getPrototypeOf(key);
    if (typeof proto !== 'function' || proto === Function.prototype) return null;
    return proto;
}
