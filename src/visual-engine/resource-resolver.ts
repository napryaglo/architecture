import { Application } from '../runtime/application.js';
import type { PropertyDescriptor } from '../runtime/property-descriptor.js';
import type { ResourceDictionary, ResourceKey } from '../runtime/resource-dictionary.js';
import type { Visual } from './visual.js';
import type { Element } from './element.js';
import type { StyleApplicator } from './style-applicator.js';

// Friend-interface for ResourceResolver to walk the target's
// ancestor chain + reach the active Style. Per CLAUDE.md cross-class
// internals pattern — the fields are conceptually internal to the
// (Visual, ResourceResolver) pair, so we declare a named interface
// and cast through it. Mural-internal: never re-exported.
interface VisualResourceHost
{
    _logicalParent:    Visual              | undefined;
    _templatedParent:  Visual              | undefined;
    _resources:        ResourceDictionary  | undefined;
    _styleApplicator:  StyleApplicator     | undefined;
}

// ResourceResolver — § 1.9. The per-Element collaborator that owns
// resource lookup along the four-tier precedence chain:
//
//   1. active Style's `Resources` (covers
//      `SetterFactory(t => DynamicResource(t, 'Accent'))` patterns
//      where the resource lives on the Style itself rather than on
//      any tree-attached dict).
//   2. ancestor `ResourceDictionary` walk via
//      `_logicalParent ?? _templatedParent` — closer ancestors
//      shadow farther ones.
//   3. ambient string-token lookup — ThemeManager's
//      Scheme / Theme cascade (§ 17.1 / § 17.2).
//   4. Application defaults via `Application.ResolveDefaultResource`.
//
// One instance per Element, created lazily on first TryFindResource
// call. Visuals that never trigger a resource lookup pay no
// allocation.
//
// The ambient-token resolver and the ambient-resource trigger DP
// registry live as static state on this class. ThemeManager
// registers itself at module load via the two `_xxx` setters below
// — the previous design hung them off Visual as static fields, which
// made `theme/theme.ts → visual.ts → ` (no theme import) cyclic
// against any future ThemeManager-facing collaborator on Visual.
// Moving them to a dedicated collaborator class lets `theme.ts`
// depend on `resource-resolver.ts` directly without touching Visual,
// matching the [feedback_avoid-hooks-do-more-design] memory's
// preference for cleaner module shape over function-pointer hooks.
export class ResourceResolver
{
    // The runtime layer can't import ThemeManager directly (theme.ts
    // imports Visual already, so visual.ts can't import theme.ts).
    // The hook surfaces here on ResourceResolver, and ThemeManager's
    // static block registers itself via `_setAmbientTokenResolver` at
    // module load. Module-level: at most one resolver in scope.
    private static _ambientTokenResolver: ((v: Visual, key: string) => unknown | undefined) | undefined;

    // Descriptors that should re-fire DynamicResource subscribers
    // when they change on a Visual (§ 17.1 — Scheme / Theme
    // cascades). Populated by ThemeManager at module load via
    // `_registerAmbientResourceTriggerDp`. Independent of the
    // resolver hook because subscribers (DynamicResource bindings)
    // need re-resolution even on the cascade's intermediate frames.
    private static _ambientResourceTriggerDps: Set<PropertyDescriptor> = new Set();

    /** @internal — ThemeManager only. Installs the function that
     *  consults the inherited `ThemeManager.Scheme` / `ThemeManager.Theme`
     *  DP cascade for ambient token resolution. Pass `undefined` to
     *  detach the hook (test-only). */
    public static _setAmbientTokenResolver(
        resolver: ((v: Visual, key: string) => unknown | undefined) | undefined,
    ): void
    {
        ResourceResolver._ambientTokenResolver = resolver;
    }

    /** @internal — ThemeManager only. Marks `descriptor` as an
     *  inherited DP whose value changes should re-fire DynamicResource
     *  subscribers on the affected Visual (so the next refresh pulls
     *  from the new scheme / theme). */
    public static _registerAmbientResourceTriggerDp(descriptor: PropertyDescriptor): void
    {
        ResourceResolver._ambientResourceTriggerDps.add(descriptor);
    }

    /** Read-only probe: is the given descriptor registered as an
     *  ambient-resource trigger? Visual's property-change handler
     *  uses this to decide whether to re-fire DynamicResource
     *  subscribers when the descriptor changes. */
    public static IsAmbientResourceTriggerDp(descriptor: PropertyDescriptor): boolean
    {
        return ResourceResolver._ambientResourceTriggerDps.has(descriptor);
    }

    constructor(private readonly _target: Element) {}

    /** Walk the four-tier precedence chain. Returns the first
     *  matching value, or `undefined` if no tier resolves the key.
     *  Function keys (e.g. `DefaultStyleKey` constructor references)
     *  skip the ambient string-token tier; the rest of the chain is
     *  identical for string and Function keys. */
    public TryFindResource(key: ResourceKey): unknown | undefined
    {
        const host = this._target as unknown as VisualResourceHost;

        // 1. Active Style's Resources first.
        const active = host._styleApplicator?.ActiveStyle;
        if (active !== undefined)
        {
            const v = active.TryResolveResource(key);
            if (v !== undefined) return v;
        }

        // 2. Ancestor walk via logical parent (with templated-parent
        //    fallback) — closer ancestors shadow farther ones.
        let cursor: Visual | undefined = this._target;
        while (cursor !== undefined)
        {
            const c = cursor as unknown as VisualResourceHost;
            const r = c._resources;
            if (r !== undefined && r.CanResolve(key))
            {
                return r.Resolve(key);
            }
            cursor = c._logicalParent ?? c._templatedParent;
        }

        // 3. Ambient string-token lookup. Function keys
        //    (DefaultStyleKey, etc.) skip this — Scheme tokens are
        //    always string-named.
        if (typeof key === 'string')
        {
            const hookResult = ResourceResolver._ambientTokenResolver?.(this._target, key);
            if (hookResult !== undefined) return hookResult;
        }

        // 4. Application-level fallback. The tree walk exhausts at
        //    the topmost mounted root; when a key isn't found there,
        //    consult the app's root resources THEN the bundled
        //    default factories. Matches WPF's
        //    `FrameworkElement.FindResource` (which walks theme
        //    dictionaries at the end) and parity's the eager-template
        //    path: a Visual whose DefaultStyleKey resolves through
        //    the bundled theme should find its Style here even
        //    before `Application.current` is set OR when running in
        //    a test harness without an Application instance.
        //    Delegate to `Application.ResolveDefaultResource` so the
        //    precedence rules (user overrides on
        //    `Application.Resources` beat bundled defaults) live in
        //    one place.
        return Application.ResolveDefaultResource(key);
    }

    /** Walk the resource-scope chain applying a per-dictionary MATCHER
     *  instead of resolving a single key. Mirrors TryFindResource's ancestor
     *  walk (logical parent, with templated-parent fallback) ending at the
     *  Application resources — closer scopes shadow farther ones — so `match`
     *  runs against each `ResourceDictionary` in nearest-first order and the
     *  first non-undefined result wins.
     *
     *  This is the generalization for resource kinds that AREN'T a plain keyed
     *  lookup — e.g. an implicit DataTemplate, resolved by scanning each
     *  dictionary for an entry whose DataType matches the data's class (walking
     *  the prototype chain). Routing those through the same walk as
     *  TryFindResource is what lets EVERY resource kind honor local
     *  dictionaries, not just Application.Resources. Tiers 1 (active Style's
     *  Resources) and 3 (ambient string tokens) don't apply to matcher-based
     *  kinds and are omitted. */
    public FindInChain<T>(match: (rd: ResourceDictionary) => T | undefined): T | undefined
    {
        // Ancestor walk (tier 2) — closer ancestors shadow farther ones.
        let cursor: Visual | undefined = this._target;
        while (cursor !== undefined)
        {
            const c = cursor as unknown as VisualResourceHost;
            const r = c._resources;
            if (r !== undefined)
            {
                const hit = match(r);
                if (hit !== undefined) return hit;
            }
            cursor = c._logicalParent ?? c._templatedParent;
        }

        // Application resources (tier 4) — the terminal scope. The tree walk
        // exhausts at the topmost mounted root; the app dict isn't a Visual
        // ancestor, so it's matched explicitly here, after every local scope.
        const app = Application.current;
        if (app !== null) return match(app.Resources);
        return undefined;
    }
}
