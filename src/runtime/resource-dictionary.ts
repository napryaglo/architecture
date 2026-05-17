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
// WPF parity is intentionally partial:
//   * No XAML <ResourceDictionary> markup.
//   * No MergedDictionaries.Source URI loading (consumers construct
//     dictionaries imperatively).
//   * No implicit-style lookup keyed by TargetType — Style support is
//     a separate effort.
//   * No keyed-sealing (WPF's lock-once-set behavior) — Set is
//     re-assignable.
export type ResourceChangeListener = () => void;

// String keys cover the usual `dict.Set('AccentBrush', …)` case;
// Function keys cover implicit-style lookup where the key is the
// target control class (`dict.Set(Button, new Style(...))`). Same
// dictionary holds both — Map's identity / value equality
// distinguishes them at lookup time.
export type ResourceKey = string | Function;

export class ResourceDictionary
{
    private readonly entries: Map<ResourceKey, unknown> = new Map();

    // Merged dictionaries in the order the caller added them. Lookup
    // walks this list back-to-front so the most recent wins.
    private readonly merged: ResourceDictionary[] = [];
    // One unsubscribe callback per merged dictionary, kept in lock-
    // step with `merged` so cleanup is straightforward.
    private readonly mergedSubscriptions: (() => void)[] = [];

    private readonly listeners: ResourceChangeListener[] = [];

    // ------------------------------------------------------------------
    // Local entries
    // ------------------------------------------------------------------

    public Set(key: ResourceKey, value: unknown): void
    {
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
        const removed = this.entries.delete(key);
        if (removed) this.notify();
        return removed;
    }

    public Clear(): void
    {
        if (this.entries.size === 0) return;
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
        this.merged.splice(i, 1);
        const unsub = this.mergedSubscriptions.splice(i, 1)[0];
        unsub?.();
        this.notify();
        return true;
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
}
