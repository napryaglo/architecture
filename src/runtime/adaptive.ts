// Adaptive context — ambient inherited DPs on Visual that surface OS
// preferences, device class, and user-controlled density to every
// Visual via the same inheritance cascade DataContext uses. Templates
// consume them via the existing `when (...)` trigger syntax; imperative
// consumers subscribe via standardized routed events (deferred to a
// later slice).
//
// ThemeManager writes the adaptive DPs on the Application root; the
// MediaWatcher service feeds them from matchMedia + ResizeObserver in
// browser environments. Test code can set them directly on any Visual
// (including the Application root) without needing a browser context.
//
// See theme-architecture.md for the full design.

import { MetaData } from './metadata.js';
import { Model } from './model.js';
import { Visual } from './visual.js';

// ── Adaptive enums ────────────────────────────────────────────────────

/** User / app-controlled density. M3 calls this "spec density"; mural
 *  exposes the three M3-canonical values. Apps decide whether to flip
 *  this manually or honour a hypothetical OS density preference. */
export enum Density
{
    Compact      = 'Compact',
    Regular      = 'Regular',
    Comfortable  = 'Comfortable',
}

/** Viewport size bucket. Default thresholds match M3 baseline (mobile
 *  ≤ 600dp, tablet 600..840dp, desktop > 840dp). MediaWatcher updates
 *  this from a ResizeObserver on the root surface. */
export enum ViewportClass
{
    Mobile   = 'Mobile',
    Tablet   = 'Tablet',
    Desktop  = 'Desktop',
}

/** Primary pointer kind. `Coarse` = touch / pen (≥ 44dp targets);
 *  `Fine` = mouse / trackpad. Driven by `matchMedia('(pointer:
 *  coarse)')`. */
export enum Pointer
{
    Fine   = 'Fine',
    Coarse = 'Coarse',
}

/** OS-level contrast preference. Driven by `matchMedia('(prefers-
 *  contrast: more)')`. */
export enum PrefersContrast
{
    Normal  = 'Normal',
    More    = 'More',
}

/** OS-level color-scheme preference. Driven by `matchMedia('(prefers-
 *  color-scheme: dark)')`. Apps that call `ThemeManager.AutoScheme`
 *  use this as the source of truth; apps that pin a scheme via
 *  `SetTheme(...)` ignore it. */
export enum PreferredScheme
{
    NoPreference = 'NoPreference',
    Light        = 'Light',
    Dark         = 'Dark',
}

// ── DP registration on Visual ─────────────────────────────────────────
//
// All DPs are `MetaData.Inherits` so a write to the root Application
// Visual cascades to every descendant — the same path DataContext
// uses. Templates trigger on these names just like any other inherited
// DP (`when (Density = Compact) { ... }`).
//
// Defaults: Regular density, Desktop viewport, Fine pointer, normal
// contrast / motion / color-scheme preference. ThemeManager + the
// MediaWatcher overwrite these on the Application root at startup;
// apps and subtree overrides can write them locally to force a
// different value on any subtree.

export const DensityKey = Model.RegisterAttachedProperty<Density>(
    Visual, 'Density', Density.Regular, MetaData.Inherits);

export const ViewportClassKey = Model.RegisterAttachedProperty<ViewportClass>(
    Visual, 'ViewportClass', ViewportClass.Desktop, MetaData.Inherits);

export const PointerKey = Model.RegisterAttachedProperty<Pointer>(
    Visual, 'Pointer', Pointer.Fine, MetaData.Inherits);

export const PrefersContrastKey = Model.RegisterAttachedProperty<PrefersContrast>(
    Visual, 'PrefersContrast', PrefersContrast.Normal, MetaData.Inherits);

export const PrefersReducedMotionKey = Model.RegisterAttachedProperty<boolean>(
    Visual, 'PrefersReducedMotion', false, MetaData.Inherits);

export const PrefersColorSchemeKey = Model.RegisterAttachedProperty<PreferredScheme>(
    Visual, 'PrefersColorScheme', PreferredScheme.NoPreference, MetaData.Inherits);

// ── Helpers ───────────────────────────────────────────────────────────
//
// Static getters/setters mirror the WPF attached-property API (e.g.
// `DockPanel.GetDock`). Convenient for code that wants typed reads
// without going through `_get_property_value_by_name`.

export function GetDensity(v: Visual): Density
{
    return v.get_property_value(DensityKey);
}
export function SetDensity(v: Visual, value: Density): void
{
    v.set_property_value(DensityKey, value);
}

export function GetViewportClass(v: Visual): ViewportClass
{
    return v.get_property_value(ViewportClassKey);
}
export function SetViewportClass(v: Visual, value: ViewportClass): void
{
    v.set_property_value(ViewportClassKey, value);
}

export function GetPointer(v: Visual): Pointer
{
    return v.get_property_value(PointerKey);
}
export function SetPointer(v: Visual, value: Pointer): void
{
    v.set_property_value(PointerKey, value);
}

export function GetPrefersContrast(v: Visual): PrefersContrast
{
    return v.get_property_value(PrefersContrastKey);
}
export function SetPrefersContrast(v: Visual, value: PrefersContrast): void
{
    v.set_property_value(PrefersContrastKey, value);
}

export function GetPrefersReducedMotion(v: Visual): boolean
{
    return v.get_property_value(PrefersReducedMotionKey);
}
export function SetPrefersReducedMotion(v: Visual, value: boolean): void
{
    v.set_property_value(PrefersReducedMotionKey, value);
}

export function GetPrefersColorScheme(v: Visual): PreferredScheme
{
    return v.get_property_value(PrefersColorSchemeKey);
}
export function SetPrefersColorScheme(v: Visual, value: PreferredScheme): void
{
    v.set_property_value(PrefersColorSchemeKey, value);
}

// ── Viewport breakpoints ──────────────────────────────────────────────
//
// M3 baseline thresholds in dp (device-independent pixels — for mural
// today, equivalent to CSS pixels). Configurable in case an app needs
// different breakpoints; MediaWatcher reads the live values on every
// ResizeObserver tick.

export interface ViewportBreakpoints
{
    /** Strictly less than this width → Mobile. */
    readonly mobileMax: number;
    /** Less than this width and ≥ mobileMax → Tablet; else Desktop. */
    readonly tabletMax: number;
}

export const M3_BREAKPOINTS: ViewportBreakpoints = {
    mobileMax: 600,
    tabletMax: 840,
};

/** Pick a ViewportClass for the given width using the provided
 *  breakpoint thresholds. Pure — testable without a DOM. */
export function classifyViewport(width: number, bps: ViewportBreakpoints = M3_BREAKPOINTS): ViewportClass
{
    if (width <  bps.mobileMax) return ViewportClass.Mobile;
    if (width <  bps.tabletMax) return ViewportClass.Tablet;
    return ViewportClass.Desktop;
}

// ── MediaWatcher ──────────────────────────────────────────────────────
//
// Wires matchMedia + ResizeObserver outputs to the adaptive DPs on the
// Application root. Activated explicitly by ThemeManager via
// `ThemeManager.Current.StartMediaWatcher(rootVisual)`. Idempotent —
// calling it twice is a no-op. `Stop()` detaches listeners.
//
// Browser-only — when matchMedia / ResizeObserver are unavailable
// (Node/test environments) the watcher is a no-op. Tests that want to
// simulate viewport / OS-pref changes write the DPs directly on a
// Visual instead.
//
// Held on ThemeManager so the manager can re-attach when the
// Application changes; consumers don't construct MediaWatchers
// themselves.

export class MediaWatcher
{
    private _root:   Visual            | undefined;
    private _bps:    ViewportBreakpoints       = M3_BREAKPOINTS;
    private _attached                          = false;
    private _resizeObs: ResizeObserver | undefined;
    private _mqDark:    MediaQueryList | undefined;
    private _mqCoarse:  MediaQueryList | undefined;
    private _mqHC:      MediaQueryList | undefined;
    private _mqRM:      MediaQueryList | undefined;
    private readonly _disposers: (() => void)[] = [];

    public get Breakpoints(): ViewportBreakpoints { return this._bps; }
    public set Breakpoints(v: ViewportBreakpoints)
    {
        this._bps = v;
        if (this._attached) this.reclassifyViewport();
    }

    /** Attach to `root`. Writes the current adaptive state into root's
     *  DPs and starts listening for changes. */
    public Start(root: Visual): void
    {
        if (this._attached && this._root === root) return;
        if (this._attached) this.Stop();
        this._root = root;
        this.attach();
        this._attached = true;
    }

    /** Detach all listeners. Safe to call when not attached. */
    public Stop(): void
    {
        for (const d of this._disposers) d();
        this._disposers.length = 0;
        this._resizeObs = undefined;
        this._mqDark    = undefined;
        this._mqCoarse  = undefined;
        this._mqHC      = undefined;
        this._mqRM      = undefined;
        this._attached  = false;
    }

    private attach(): void
    {
        // Bail out gracefully in non-browser environments. Tests don't
        // exercise this path; production always has window + matchMedia.
        const g: typeof globalThis & {
            window?:           typeof globalThis & { matchMedia?(query: string): MediaQueryList };
            matchMedia?:       (query: string) => MediaQueryList;
            ResizeObserver?:   typeof ResizeObserver;
        } = globalThis;
        const win = g.window;
        const matchMedia = (typeof win?.matchMedia === 'function')
            ? win.matchMedia.bind(win)
            : (typeof g.matchMedia === 'function' ? g.matchMedia : undefined);
        if (matchMedia === undefined) return;

        // matchMedia queries — each one writes its corresponding DP on
        // the root on construction AND on subsequent change events.
        this._mqDark   = matchMedia('(prefers-color-scheme: dark)');
        this._mqCoarse = matchMedia('(pointer: coarse)');
        this._mqHC     = matchMedia('(prefers-contrast: more)');
        this._mqRM     = matchMedia('(prefers-reduced-motion: reduce)');

        const writeDark   = (e: MediaQueryListEvent | MediaQueryList): void =>
        {
            if (this._root === undefined) return;
            SetPrefersColorScheme(this._root,
                e.matches ? PreferredScheme.Dark : PreferredScheme.Light);
        };
        const writeCoarse = (e: MediaQueryListEvent | MediaQueryList): void =>
        {
            if (this._root === undefined) return;
            SetPointer(this._root, e.matches ? Pointer.Coarse : Pointer.Fine);
        };
        const writeHC     = (e: MediaQueryListEvent | MediaQueryList): void =>
        {
            if (this._root === undefined) return;
            SetPrefersContrast(this._root,
                e.matches ? PrefersContrast.More : PrefersContrast.Normal);
        };
        const writeRM     = (e: MediaQueryListEvent | MediaQueryList): void =>
        {
            if (this._root === undefined) return;
            SetPrefersReducedMotion(this._root, e.matches);
        };

        // Initial sync — pass the MediaQueryList itself (it has the
        // .matches getter so the same writer works for both initial
        // and event-driven calls).
        writeDark(this._mqDark);
        writeCoarse(this._mqCoarse);
        writeHC(this._mqHC);
        writeRM(this._mqRM);

        // Subscribe to changes. Browsers older than Chrome 76 / Safari
        // 14 used `addListener` instead of `addEventListener`; modern
        // browsers support both — we use the modern API.
        const subscribe = (
            mq:    MediaQueryList,
            write: (e: MediaQueryListEvent) => void,
        ): void =>
        {
            mq.addEventListener('change', write);
            this._disposers.push(() => mq.removeEventListener('change', write));
        };
        subscribe(this._mqDark,   writeDark);
        subscribe(this._mqCoarse, writeCoarse);
        subscribe(this._mqHC,     writeHC);
        subscribe(this._mqRM,     writeRM);

        // ResizeObserver on the root surface for ViewportClass. The
        // root is typically the Application's mount element; if it
        // isn't a DOM element (test harness), skip the observer.
        const RO = g.ResizeObserver;
        if (RO !== undefined && this._root !== undefined)
        {
            const target = this.resolveDomTarget(this._root);
            if (target !== undefined)
            {
                this._resizeObs = new RO(entries =>
                {
                    if (this._root === undefined) return;
                    const w = entries[0]?.contentRect.width;
                    if (w !== undefined)
                    {
                        SetViewportClass(this._root,
                            classifyViewport(w, this._bps));
                    }
                });
                this._resizeObs.observe(target);
                this._disposers.push(() => this._resizeObs?.disconnect());

                // Initial sync from the target's current width.
                SetViewportClass(this._root,
                    classifyViewport(target.clientWidth ?? 0, this._bps));
            }
        }
    }

    // Re-classify the viewport on demand — used when Breakpoints
    // changes mid-watch so the active value reflects the new thresholds.
    private reclassifyViewport(): void
    {
        if (this._root === undefined) return;
        const target = this.resolveDomTarget(this._root);
        if (target === undefined) return;
        SetViewportClass(this._root,
            classifyViewport(target.clientWidth ?? 0, this._bps));
    }

    // Best-effort DOM-target resolution. Mural's host bindings (HtmlTarget)
    // expose the mount element via various paths; we duck-type through
    // the common ones. Returns undefined for non-DOM hosts (tests).
    private resolveDomTarget(root: Visual): Element | undefined
    {
        const probe = root as Visual & {
            HostElement?:   Element;
            hostElement?:   Element;
            DomNode?:       Element;
        };
        return probe.HostElement ?? probe.hostElement ?? probe.DomNode;
    }
}
