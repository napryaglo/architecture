// String-keyed bag of arbitrary values (brushes, templates, converters,
// numbers, …) attached to a Visual. Resolved by Visual.FindResource /
// TryFindResource, which walks the logical tree (with templatedParent
// fallback for template internals) until a matching key is found.
//
// Composition: a dictionary can include MergedDictionaries — other
// ResourceDictionaries whose keys are visible through this one. Lookup
// order matches WPF: local entries first; then merged dictionaries
// walked LAST-to-FIRST (the most recently merged wins on conflict).
// Used to compose theme dictionaries (`base.xaml` + `dark.xaml`),
// shared resource files, etc.
//
// Reactivity: Subscribe(listener) fires for any mutation that could
// affect resolutions through this dictionary — local Set / Delete /
// Clear, merged-dictionary added / removed, or any change inside a
// merged dictionary (transitive). Consumers (`DynamicResource`,
// debugging tools) use it to know when to re-resolve.
//
// URI loading (§ 12.2): consumers can register a global loader via
// `SetResourceDictionaryLoader(fn)` and then call
// `dict.AddMergedDictionaryFromUri(uri)` to fetch + merge. No built-in
// scheme handlers — consumers supply whatever loader makes sense for
// their environment (dynamic `import()` for JS modules in Node /
// browsers, fetch + JSON.parse, a custom .mu interpreter). The
// framework supplies the lifecycle; consumers supply the bytes.
//
// Sealing (§ 12.4): `dict.Seal()` freezes the dictionary — Set /
// Delete / Clear / AddMergedDictionary / RemoveMergedDictionary all
// throw thereafter. Opt-in (no auto-seal-on-first-resolve like WPF).
// Theme bundles typically seal after construction so downstream
// consumers can't accidentally shadow contracted tokens.
//
// Implicit-style lookup keyed by TargetType works through the same
// `Map<string | Function, unknown>` storage — Function keys identify
// the target control class; consumers walk to find one via
// Visual.TryFindResource(this.constructor).
//
// `Root` is the µ-mural extension point for the `x:root` directive:
// a single Visual pointer designating which child of this dictionary
// is the application's main visual, exposed to Application.Mount.
export type ResourceChangeListener = () => void;

// Loader function for URI-based merged-dictionary loading. Takes a URI
// string, returns a Promise resolving to a fully-constructed
// `ResourceDictionary`. Consumers supply this — there is no built-in
// scheme handler. Typical shapes:
//
//   * Dynamic JS module:
//       const loader: DictionaryLoader = async uri => {
//           const mod = await import(uri);
//           return mod.default;        // expect the module to export a dict
//       };
//
//   * Browser-side JSON fetch + decode pass:
//       const loader: DictionaryLoader = async uri => {
//           const json = await (await fetch(uri)).json();
//           const dict = new ResourceDictionary();
//           for (const [k, v] of Object.entries(json)) dict.Set(k, v);
//           return dict;
//       };
//
// Caching, retry, source-map awareness etc. are the loader's
// responsibility. The framework just awaits the result and feeds it
// to `AddMergedDictionary`.
export type DictionaryLoader = (uri: string) => Promise<ResourceDictionary>;

// Module-level default loader registry. Set via the public
// `SetResourceDictionaryLoader` function. Used by
// `AddMergedDictionaryFromUri` when the caller doesn't pass a loader
// explicitly. There is at most one default at a time — setting a new
// one overwrites the previous.
let _defaultLoader: DictionaryLoader | undefined;

// Register the default loader used by `AddMergedDictionaryFromUri`
// when the caller doesn't pass a per-call loader. Pass `undefined`
// to clear the default. Idempotent — calling with the same loader
// twice is a no-op.
export function SetResourceDictionaryLoader(loader: DictionaryLoader | undefined): void
{
    _defaultLoader = loader;
}

// Read the currently registered default loader, or `undefined` when
// none has been set. Test helper — production code rarely needs this.
export function GetResourceDictionaryLoader(): DictionaryLoader | undefined
{
    return _defaultLoader;
}

// String keys cover the usual `dict.Set('AccentBrush', …)` case;
// Function keys cover implicit-style lookup where the key is the
// target control class (`dict.Set(Button, new Style(...))`). Same
// dictionary holds both — Map's identity / value equality
// distinguishes them at lookup time.
export type ResourceKey = string | Function;

// Type-only import — keeps the runtime layering clean (no value import
// from visual.ts into here). At emit time the import is erased; at
// type-check time `Root: Visual | undefined` is properly typed.
import type { Visual } from './visual.js';

export class ResourceDictionary
{
    private readonly entries: Map<ResourceKey, unknown> = new Map();

    // The single child marked with `x:root` in markup, or undefined when
    // none was registered. Read by Application.Mount; written by the
    // RootExtension during the compiler's bind pass (or by callers
    // building dictionaries imperatively). Setting a different non-
    // undefined value over an existing one throws — the
    // "at most one x:root per dictionary" rule has both static and
    // runtime enforcement.
    private _root: Visual | undefined;

    // Merged dictionaries in the order the caller added them. Lookup
    // walks this list back-to-front so the most recent wins.
    private readonly merged: ResourceDictionary[] = [];
    // One unsubscribe callback per merged dictionary, kept in lock-
    // step with `merged` so cleanup is straightforward.
    private readonly mergedSubscriptions: (() => void)[] = [];

    private readonly listeners: ResourceChangeListener[] = [];

    // Sealed dictionaries reject every mutation (Set / Delete / Clear /
    // AddMergedDictionary / RemoveMergedDictionary). Set at Seal()
    // time; cannot be unsealed. WHY: theme bundles want to lock their
    // dictionaries after activation so a downstream consumer can't
    // accidentally Set a token name that shadows the theme's contract
    // value. Opt-in — existing imperative-Set callers stay free unless
    // they explicitly Seal().
    private _sealed: boolean = false;

    // ------------------------------------------------------------------
    // Local entries
    // ------------------------------------------------------------------

    public Set(key: ResourceKey, value: unknown): void
    {
        this.checkUnsealedForMutation('Set');
        // No equality check on the existing value — even setting the
        // same value re-fires the listener. Simpler and matches the
        // WPF behavior of ResourceDictionary being a write-through
        // dictionary; consumers that want dedupe can layer it.
        this.entries.set(key, value);
        this.notify();
    }

    // Returns the value for `key` from THIS dictionary only, ignoring
    // merged ones. Use Resolve for the full lookup that includes
    // merged dicts; use Get when you specifically need "is this key
    // defined locally."
    public Get(key: ResourceKey): unknown | undefined
    {
        return this.entries.get(key);
    }

    public Has(key: ResourceKey): boolean
    {
        return this.entries.has(key);
    }

    public Delete(key: ResourceKey): boolean
    {
        this.checkUnsealedForMutation('Delete');
        const removed = this.entries.delete(key);
        if (removed) this.notify();
        return removed;
    }

    public Clear(): void
    {
        if (this.entries.size === 0) return;
        this.checkUnsealedForMutation('Clear');
        this.entries.clear();
        this.notify();
    }

    public get Size(): number
    {
        return this.entries.size;
    }

    public *Entries(): IterableIterator<[ResourceKey, unknown]>
    {
        yield* this.entries.entries();
    }

    // ------------------------------------------------------------------
    // Root marker (x:root)
    // ------------------------------------------------------------------

    public get Root(): Visual | undefined
    {
        return this._root;
    }

    public set Root(value: Visual | undefined)
    {
        // Allow clearing (undefined) and idempotent re-assignment of the
        // same instance. Reject a second distinct root — that's the
        // duplicate-x:root case the compiler should have already caught.
        if (value !== undefined && this._root !== undefined && this._root !== value)
        {
            throw new Error(
                'ResourceDictionary: Root already set; only one x:root per dictionary.',
            );
        }
        this._root = value;
    }

    // ------------------------------------------------------------------
    // Composite resolution
    // ------------------------------------------------------------------

    // Resolves `key` through THIS dictionary's local entries first,
    // then through merged dictionaries walked from last-added to
    // first-added (last-merged wins on conflict — WPF semantics). Each
    // merged dictionary's own Resolve runs, so the rule recurses
    // through nested merges.
    //
    // Returns undefined when the key is defined nowhere in this
    // dictionary's reachable composition. Local key shadowing
    // (local value defined, merged values irrelevant) is handled by
    // the entries.has check first.
    public Resolve(key: ResourceKey): unknown | undefined
    {
        if (this.entries.has(key)) return this.entries.get(key);
        for (let i = this.merged.length - 1; i >= 0; i--)
        {
            const v = this.merged[i]!.Resolve(key);
            if (v !== undefined) return v;
        }
        return undefined;
    }

    // True when the key is reachable through this dictionary's full
    // composition (local OR any merged dict, transitively).
    public CanResolve(key: ResourceKey): boolean
    {
        if (this.entries.has(key)) return true;
        for (const m of this.merged)
        {
            if (m.CanResolve(key)) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Merged dictionaries
    // ------------------------------------------------------------------

    public get MergedDictionaries(): readonly ResourceDictionary[]
    {
        return this.merged;
    }

    public AddMergedDictionary(dict: ResourceDictionary): void
    {
        this.checkUnsealedForMutation('AddMergedDictionary');
        if (dict === this)
        {
            throw new Error('ResourceDictionary: cannot merge a dictionary into itself.');
        }
        if (dict.containsTransitively(this))
        {
            throw new Error('ResourceDictionary: merging would create a cycle.');
        }
        this.merged.push(dict);
        // Forward the inner dict's changes so subscribers on the outer
        // see every mutation that could affect resolutions through
        // here. Captured in lock-step with merged[] for cleanup.
        this.mergedSubscriptions.push(dict.Subscribe(() => this.notify()));
        this.notify();
    }

    public RemoveMergedDictionary(dict: ResourceDictionary): boolean
    {
        const i = this.merged.indexOf(dict);
        if (i < 0) return false;
        this.checkUnsealedForMutation('RemoveMergedDictionary');
        this.merged.splice(i, 1);
        const unsub = this.mergedSubscriptions.splice(i, 1)[0];
        unsub?.();
        this.notify();
        return true;
    }

    // Load a ResourceDictionary from a URI and merge it into this one.
    // The loader (per-call argument or the module-level default
    // registered via SetResourceDictionaryLoader) returns a Promise
    // resolving to the new dictionary; on resolve it lands in this
    // dict's MergedDictionaries via the standard AddMergedDictionary
    // path, complete with cycle detection and change-forwarding.
    //
    // Throws ahead of the await when this dictionary is sealed —
    // failing fast keeps the caller's await from hanging when the
    // outcome is already determined.
    //
    // Re-loading the same URI is the loader's concern; the framework
    // doesn't cache. A loader that wants cache-on-second-call
    // semantics returns the same dict instance for the same URI, in
    // which case AddMergedDictionary's idempotency rules govern
    // (currently: appends a second reference; the cycle check would
    // catch a self-merge but not a benign duplicate — consumers wanting
    // strict-once should layer that in their loader).
    public async AddMergedDictionaryFromUri(
        uri:    string,
        loader?: DictionaryLoader,
    ): Promise<ResourceDictionary>
    {
        this.checkUnsealedForMutation('AddMergedDictionaryFromUri');
        const fn = loader ?? _defaultLoader;
        if (fn === undefined)
        {
            throw new Error(
                `ResourceDictionary.AddMergedDictionaryFromUri('${uri}'): no loader. `
                + 'Pass a loader argument, or register a default loader via '
                + 'SetResourceDictionaryLoader(...) before calling.',
            );
        }
        const dict = await fn(uri);
        this.AddMergedDictionary(dict);
        return dict;
    }

    private containsTransitively(target: ResourceDictionary): boolean
    {
        if (this === target) return true;
        for (const m of this.merged)
        {
            if (m.containsTransitively(target)) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Change notifications
    // ------------------------------------------------------------------

    // Subscribe to "something changed that could affect lookups
    // through this dictionary." Coarse-grained on purpose — consumers
    // that re-resolve specific keys (DynamicResource) just need a
    // signal, not per-key diffs. Returns an unsubscribe function.
    //
    // Fires for: local Set / Delete / Clear, AddMergedDictionary /
    // RemoveMergedDictionary, and any change inside a merged dict
    // (forwarded through the per-merge subscription).
    public Subscribe(listener: ResourceChangeListener): () => void
    {
        this.listeners.push(listener);
        return () =>
        {
            const i = this.listeners.indexOf(listener);
            if (i >= 0) this.listeners.splice(i, 1);
        };
    }

    // Per-key subscription. The listener fires only when the RESOLVED
    // value for `key` changes — set the same key to the same value,
    // listener stays quiet; mutate an unrelated key, listener stays
    // quiet; mutate a merged dictionary's unrelated key, listener
    // stays quiet. Behaviorally a memoized wrapper around `Subscribe`
    // + per-listener `Resolve` cache.
    //
    // WHY: `Subscribe` is coarse — fine for a few dictionaries with
    // small subscriber counts, wasteful for large theme dictionaries
    // (200+ tokens) where any single Set fires every consumer's
    // re-resolution path. SubscribeKey lets DynamicResource-style
    // consumers register one listener per key they actually consume,
    // skipping no-op resolutions on unrelated changes.
    //
    // Identity semantics for the "changed?" check: strict-equality
    // (===). Brushes / Geometries / numbers all compare correctly;
    // consumers that hand out fresh-but-equal Brush instances on
    // every theme swap pay the same cost they do today via global
    // Subscribe. The Resolve walk includes merged dictionaries, so
    // a merged Set that newly exposes (or hides) the key fires the
    // listener at the moment the resolved value flips.
    //
    // Returns an unsubscribe function — call to drop both the global
    // Subscribe hook and the per-listener cache.
    public SubscribeKey(key: ResourceKey, listener: ResourceChangeListener): () => void
    {
        // Seed the cache with the current resolved value. Initial fire
        // is the consumer's responsibility (same contract as Subscribe);
        // SubscribeKey only fires on CHANGE.
        let last = this.Resolve(key);
        return this.Subscribe(() =>
        {
            const next = this.Resolve(key);
            if (next === last) return;
            last = next;
            listener();
        });
    }

    private notify(): void
    {
        // Snapshot so an unsubscribe-during-notify (common when a
        // subscriber decides to detach after seeing a change) doesn't
        // mutate the array under iteration.
        for (const l of [...this.listeners])
        {
            l();
        }
    }

    // ------------------------------------------------------------------
    // Sealing (§ 12.4)
    // ------------------------------------------------------------------

    // True after Seal() has been called. Cannot be unsealed.
    public get IsSealed(): boolean
    {
        return this._sealed;
    }

    // Freeze the dictionary against further mutations. After Seal(),
    // Set / Delete / Clear / AddMergedDictionary / RemoveMergedDictionary
    // all throw. Reads (Get / Has / Resolve / CanResolve / Entries /
    // MergedDictionaries / Subscribe / SubscribeKey) stay unaffected.
    //
    // Idempotent — calling Seal() on an already-sealed dictionary is a
    // no-op. There is no Unseal: WPF parity, and any unfreeze path
    // would have to invalidate every DynamicResource subscription that
    // assumed the dict was stable. Consumers that need a fresh mutable
    // copy should construct a new dictionary and seed it from
    // `Entries()`.
    //
    // Does NOT recurse into merged dictionaries — a merged dict whose
    // entries should also be frozen has to be sealed independently.
    // Most theme bundles seal their root dict + each merged dict
    // explicitly as part of activation.
    public Seal(): void
    {
        this._sealed = true;
    }

    private checkUnsealedForMutation(operation: string): void
    {
        if (!this._sealed) return;
        throw new Error(
            `ResourceDictionary: ${operation} rejected — dictionary is sealed. `
            + 'Call Seal() makes the dictionary immutable; create a fresh '
            + 'dictionary and re-seed from Entries() if you need a mutable copy.',
        );
    }
}
