import {
    MetaData,
    Model,
    type PropertyDescriptor,
    type CollectionChange,
} from '../../runtime/index.js';
import { resolveKey } from '../../runtime/model-internals.js';
import { ContentControl } from '../content-control.js';
import { ContentPresenter } from '../../basic/templates/content-presenter.js';
import { ControlTemplate } from '../../basic/templates/control-template.js';

// A container control for a set of Figure-like members, modeled on the
// ListBox grouping primitive (GroupItem). Holds NO Members collection
// of its own — it reads Members from its DataContext (the consumer's
// group VM), which makes Group agnostic to the consumer's VM class. The
// data-side contract is duck-typed:
//
//   * `DataContext.Members` — collection of member entries, each exposing
//     `Left` / `Top` / `Width` / `Height` as DPs on a `Model`.
//
// Group exposes its own `Left` / `Top` / `Width` / `Height` as READ-ONLY
// DPs derived from the union bbox of its Members. They re-derive whenever
// (a) any member's geometry DP changes, or (b) the Members collection
// itself mutates (when it's an ObservableCollection — plain arrays
// don't notify, so the consumer reattaches via a DataContext flip).
//
// `Translate(dx, dy)` shifts every member's `Left` / `Top` by the delta
// in lock-step. The internal `_shiftSuppressed` gate prevents per-member
// PropertyChanged cascades from re-running the bbox math during the
// shift — a single recompute fires after every member has moved.
//
// Pointer-driven drag is wired up in a later phase (see
// [src/document/diagram-control.md § 4](../../document/diagram-control.md)).
// Group's `Translate` is the underlying primitive any drag handler invokes.
export class Group extends ContentControl
{
    public static readonly LeftKey            = Model.RegisterReadOnlyProperty<number>(
        Group, 'Left',   0, MetaData.Arrange);
    public static readonly TopKey             = Model.RegisterReadOnlyProperty<number>(
        Group, 'Top',    0, MetaData.Arrange);
    public static override readonly WidthKey  = Model.RegisterReadOnlyProperty<number>(
        Group, 'Width',  0, MetaData.Measure);
    public static override readonly HeightKey = Model.RegisterReadOnlyProperty<number>(
        Group, 'Height', 0, MetaData.Measure);

    // Per-member detach thunks, keyed by member identity. The collection
    // listener (when Members is observable) lives in `_membersUnsubscribe`.
    private readonly _memberListeners: Map<Model, () => void> = new Map();
    private _membersUnsubscribe: (() => void) | undefined = undefined;

    // Reentrancy gate — true during a Translate() shift so per-member
    // PropertyChanged callbacks skip the bbox recompute. One final
    // recompute fires at the end of the shift.
    private _shiftSuppressed: boolean = false;

    constructor()
    {
        super();
        // Minimal default template — a single ContentPresenter. Group's
        // chrome (dashed border when selected, etc.) lands later via
        // framework.resources.mu Style triggers. Tests can replace the
        // Template if they need a different shape.
        this.Template = new ControlTemplate(() => new ContentPresenter());
    }

    public get Left():            number { return this.get_property_value(Group.LeftKey); }
    public get Top():             number { return this.get_property_value(Group.TopKey); }
    public override get Width():  number { return this.get_property_value(Group.WidthKey); }
    public override get Height(): number { return this.get_property_value(Group.HeightKey); }

    // Shift every member by (dx, dy) in lock-step. Suppresses the
    // per-member bbox recompute cascade and fires one final recompute
    // when the shift completes. Used by the future drag handler and
    // also directly by tests / programmatic translations.
    public Translate(dx: number, dy: number): void
    {
        if (dx === 0 && dy === 0) return;
        const members = this._currentMembers();
        if (members.length === 0) return;
        this._shiftSuppressed = true;
        try
        {
            for (const m of members)
            {
                const mm = m as unknown as { Left: number; Top: number };
                if (dx !== 0) mm.Left = mm.Left + dx;
                if (dy !== 0) mm.Top  = mm.Top  + dy;
            }
        }
        finally
        {
            this._shiftSuppressed = false;
        }
        this._recomputeBounds();
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        // DataContext flip — reattach all listeners against the new
        // members collection. Symbol-keyed comparison via the inherited
        // ContentControl.DataContextKey (lives on Element).
        if (descriptor.Name === 'DataContext')
        {
            this._reattachMembers();
        }
    }

    private _reattachMembers(): void
    {
        // Detach the per-member listeners + the collection-change listener.
        this._membersUnsubscribe?.();
        this._membersUnsubscribe = undefined;
        for (const detach of this._memberListeners.values()) detach();
        this._memberListeners.clear();

        const members = this._readMembersFromDataContext();
        if (members === undefined)
        {
            this._recomputeBounds();   // → (0, 0, 0, 0)
            return;
        }

        // Subscribe to collection mutations when Members is an
        // ObservableCollection-shaped value (duck-type on Subscribe +
        // Count + Get). Plain arrays don't notify; the consumer can
        // reattach by flipping DataContext.
        const observable = members as { Subscribe?: (l: (e: CollectionChange<unknown>) => void) => () => void };
        if (typeof observable.Subscribe === 'function')
        {
            this._membersUnsubscribe = observable.Subscribe(change => this._handleMembersChange(change));
        }

        // Attach per-member geometry listeners.
        for (const m of this._iterateMembers(members))
        {
            this._memberListeners.set(m, this._listenMember(m));
        }

        this._recomputeBounds();
    }

    private _handleMembersChange(change: CollectionChange<unknown>): void
    {
        switch (change.kind)
        {
            case 'inserted':
                for (const m of change.items)
                {
                    if (m instanceof Model && !this._memberListeners.has(m))
                    {
                        this._memberListeners.set(m, this._listenMember(m));
                    }
                }
                break;
            case 'removed':
                for (const m of change.items)
                {
                    if (m instanceof Model)
                    {
                        this._memberListeners.get(m)?.();
                        this._memberListeners.delete(m);
                    }
                }
                break;
            case 'replaced':
            {
                const oldItem = change.oldItem;
                const newItem = change.newItem;
                if (oldItem instanceof Model)
                {
                    this._memberListeners.get(oldItem)?.();
                    this._memberListeners.delete(oldItem);
                }
                if (newItem instanceof Model && !this._memberListeners.has(newItem))
                {
                    this._memberListeners.set(newItem, this._listenMember(newItem));
                }
                break;
            }
            case 'cleared':
                for (const detach of this._memberListeners.values()) detach();
                this._memberListeners.clear();
                break;
            // 'moved' doesn't change identity or geometry — listener set
            // is unchanged, bbox is unchanged. No-op.
        }
        if (change.kind !== 'moved') this._recomputeBounds();
    }

    // Attach a PropertyChangedListener for each of Left / Top / Width /
    // Height on a single member. Returns a detach thunk that removes all
    // four.
    //
    // Uses `resolveKey` instead of the by-name accessor family — that
    // surface was retired in the typed-key migration (see
    // src/document/property-system.md). The lookup walks the member's
    // class hierarchy once per key; the resulting PropertyKey is then
    // reused for the listener add + remove pair.
    private _listenMember(m: Model): () => void
    {
        const leftKey = resolveKey(m, undefined, 'Left');
        const topKey  = resolveKey(m, undefined, 'Top');
        const wKey    = resolveKey(m, undefined, 'Width');
        const hKey    = resolveKey(m, undefined, 'Height');
        const handler = (): void => {
            if (this._shiftSuppressed) return;
            this._recomputeBounds();
        };
        m.AddPropertyChangedListener(leftKey, handler);
        m.AddPropertyChangedListener(topKey,  handler);
        m.AddPropertyChangedListener(wKey,    handler);
        m.AddPropertyChangedListener(hKey,    handler);
        return (): void => {
            m.RemovePropertyChangedListener(leftKey, handler);
            m.RemovePropertyChangedListener(topKey,  handler);
            m.RemovePropertyChangedListener(wKey,    handler);
            m.RemovePropertyChangedListener(hKey,    handler);
        };
    }

    private _recomputeBounds(): void
    {
        const members = this._currentMembers();
        if (members.length === 0)
        {
            this.set_property_value_with_key(Group.LeftKey,   0);
            this.set_property_value_with_key(Group.TopKey,    0);
            this.set_property_value_with_key(Group.WidthKey,  0);
            this.set_property_value_with_key(Group.HeightKey, 0);
            return;
        }
        let minLeft = Number.POSITIVE_INFINITY;
        let minTop  = Number.POSITIVE_INFINITY;
        let maxRight  = Number.NEGATIVE_INFINITY;
        let maxBottom = Number.NEGATIVE_INFINITY;
        for (const m of members)
        {
            const mm = m as unknown as { Left: number; Top: number; Width: number; Height: number };
            if (mm.Left < minLeft) minLeft = mm.Left;
            if (mm.Top  < minTop)  minTop  = mm.Top;
            if (mm.Left + mm.Width  > maxRight)  maxRight  = mm.Left + mm.Width;
            if (mm.Top  + mm.Height > maxBottom) maxBottom = mm.Top  + mm.Height;
        }
        this.set_property_value_with_key(Group.LeftKey,   minLeft);
        this.set_property_value_with_key(Group.TopKey,    minTop);
        this.set_property_value_with_key(Group.WidthKey,  maxRight  - minLeft);
        this.set_property_value_with_key(Group.HeightKey, maxBottom - minTop);
    }

    private _currentMembers(): Model[] {
        const members = this._readMembersFromDataContext();
        if (members === undefined) return [];
        const out: Model[] = [];
        for (const m of this._iterateMembers(members))
        {
            out.push(m);
        }
        return out;
    }

    private _readMembersFromDataContext(): unknown | undefined
    {
        const dc = this.DataContext as { Members?: unknown } | undefined;
        return dc?.Members;
    }

    // Iterate both ObservableCollection (Count + Get) and plain arrays
    // / Symbol.iterator-bearing collections. Skips non-Model members
    // silently — listening to non-Model entries via resolveKey would
    // throw on the first lookup.
    private *_iterateMembers(members: unknown): Iterable<Model>
    {
        const indexable = members as { Count?: number; Get?(i: number): unknown };
        if (typeof indexable.Count === 'number' && typeof indexable.Get === 'function')
        {
            for (let i = 0; i < indexable.Count; i++)
            {
                const m = indexable.Get(i);
                if (m instanceof Model) yield m;
            }
            return;
        }
        const iterable = members as Iterable<unknown>;
        if (typeof (iterable as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function')
        {
            for (const m of iterable)
            {
                if (m instanceof Model) yield m;
            }
        }
    }
}
