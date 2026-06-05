import type { VisualHost } from '../runtime/index.js';
import type { Grid } from './grid.js';

// Cross-Grid track-size coordination.
//
// A `SharedSizeGroup` is a named bucket of Auto tracks (rows on
// RowDefinition / columns on ColumnDefinition). Every Grid mounted
// under the same presentation target that owns a track with the
// matching group name contributes its measured natural-Auto size to
// the bucket; the bucket's running max is what each member uses as
// the track's resolved size.
//
// Mirrors WPF's `Grid.SharedSizeGroup` (with `Grid.IsSharedSizeScope`
// implicitly true at the presentation-target root — explicit scope
// roots aren't shipping today; that's a follow-up).
//
// Lifecycle is bounded by the presentation target. One registry per
// VisualHost, lazily created on first access via `registryFor(host)`.
// When a host is GC'd the registry is GC'd along with it (WeakMap).
//
// Implementation strategy: member-set invalidation. When a Grid
// reports a new contribution, the registry recomputes the bucket's
// max; if the max changed, every OTHER Grid with a track in this
// bucket is invalidated so they re-measure against the new max.
// Converges in O(layout-passes) — typically 1–2 — for the common
// case where shared tracks reach a stable arrangement.

interface GroupState
{
    // Per-Grid contribution to this group. A Grid may contribute MORE
    // than one entry if it has multiple tracks declared with the same
    // group name (rare but legal). We collapse to one entry per Grid
    // by keeping only the largest contribution per Grid — that's the
    // effective contribution from that Grid's perspective, since its
    // multiple tracks would all read the same max anyway.
    contributions: Map<Grid, number>;
    max: number;
}

export class SharedSizeRegistry
{
    private readonly _groups = new Map<string, GroupState>();
    // Reverse index — Grid → set of group names it contributes to. Used
    // by unregisterGrid for O(member-group-count) cleanup instead of
    // walking every group.
    private readonly _byGrid = new Map<Grid, Set<string>>();

    // Report a Grid's contribution to a group. Returns the new max,
    // which is what the contributing Grid should use as the track's
    // resolved size. Triggers InvalidateMeasure on every OTHER member
    // when the group's max actually changes.
    public report(groupName: string, grid: Grid, size: number): number
    {
        let group = this._groups.get(groupName);
        if (group === undefined)
        {
            group = { contributions: new Map(), max: 0 };
            this._groups.set(groupName, group);
        }
        const previousMax  = group.max;
        const previousSize = group.contributions.get(grid) ?? 0;
        if (previousSize === size && group.contributions.has(grid))
        {
            // No change — most common path when measure cycles converge.
            return group.max;
        }
        group.contributions.set(grid, size);
        let memberGroups = this._byGrid.get(grid);
        if (memberGroups === undefined)
        {
            memberGroups = new Set();
            this._byGrid.set(grid, memberGroups);
        }
        memberGroups.add(groupName);
        // Recompute max from scratch — the only way to know whether the
        // mutation changed the max without bookkeeping which contribution
        // was previously the max. Cheap; member count per group is
        // typically small.
        let newMax = 0;
        for (const v of group.contributions.values())
        {
            if (v > newMax) newMax = v;
        }
        group.max = newMax;
        if (newMax !== previousMax)
        {
            // Invalidate every OTHER member so they re-read the new
            // max on their next measure pass. The contributing Grid
            // is about to use newMax as its return value, so it doesn't
            // need to be re-invalidated by us.
            for (const member of group.contributions.keys())
            {
                if (member !== grid) member.InvalidateMeasure();
            }
        }
        return newMax;
    }

    // Read the current max without contributing. Used by Grids whose
    // group contains only OTHER Grids' tracks — e.g. a Grid whose Auto
    // row would naturally be 30 but shares a group with another Grid
    // whose contribution is 100; the first Grid still wants to size to
    // 100. In practice every Grid with a track in a group both
    // contributes AND reads, so this is rarely called standalone.
    public getMax(groupName: string): number
    {
        return this._groups.get(groupName)?.max ?? 0;
    }

    // Remove every contribution from `grid`. Recomputes affected
    // groups' maxes and invalidates surviving members whose max
    // actually shrank. Called when a Grid leaves its presentation
    // target (see grid.ts SetTarget override).
    public unregisterGrid(grid: Grid): void
    {
        const memberGroups = this._byGrid.get(grid);
        if (memberGroups === undefined) return;
        for (const name of memberGroups)
        {
            const group = this._groups.get(name);
            if (group === undefined) continue;
            const previousMax = group.max;
            group.contributions.delete(grid);
            // Recompute max from remaining members; drops to 0 if no
            // contributors remain.
            let newMax = 0;
            for (const v of group.contributions.values())
            {
                if (v > newMax) newMax = v;
            }
            group.max = newMax;
            if (newMax !== previousMax)
            {
                for (const member of group.contributions.keys())
                {
                    member.InvalidateMeasure();
                }
            }
            // Drop empty groups so a host that cycles through many
            // group names doesn't accumulate dead entries.
            if (group.contributions.size === 0)
            {
                this._groups.delete(name);
            }
        }
        this._byGrid.delete(grid);
    }
}

// Per-host lookup. WeakMap keys by VisualHost identity so a host that
// goes away takes its registry with it without an explicit cleanup
// call. `registryFor(undefined)` returns undefined — a Grid not
// currently attached to a host has no shared-size context.
const _registries = new WeakMap<VisualHost, SharedSizeRegistry>();

export function registryFor(host: VisualHost | undefined): SharedSizeRegistry | undefined
{
    if (host === undefined) return undefined;
    let r = _registries.get(host);
    if (r === undefined)
    {
        r = new SharedSizeRegistry();
        _registries.set(host, r);
    }
    return r;
}
