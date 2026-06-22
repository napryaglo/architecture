import { Binding } from './binding.js';
import type { PropertyChangeCallback } from './effective-value.js';
import { MetaData } from '../metadata.js';
import { Model } from '../model.js';
import type { PropertyKey } from '../model.js';
import { resolveKey } from '../model-internals.js';
import type { Visual } from '../../visual-engine/visual.js';

// Watcher Model — same shape as DataContextWatcher: a Model with a
// single registered Value property. Bindings feed their resolved value
// into this slot; the consumer EVD subscribes to it as the binding's
// source.
class ElementNameWatcher extends Model
{
    public static readonly ValueKey = Model.RegisterProperty<unknown>(
        ElementNameWatcher, 'Value', undefined, MetaData.None);

    public get Value(): unknown      { return this.get_property_value(ElementNameWatcher.ValueKey); }
    public set Value(value: unknown) { this.set_property_value(ElementNameWatcher.ValueKey, value); }
}

// Binding whose source is a fixed Visual — typically an x:name'd
// descendant inside a template. Mirrors WPF's
// `{Binding ElementName=foo, Path=Bar}`. The path walks against the
// source Visual the same way DataContextBinding's walks against the
// target's DataContext, but the source itself never re-resolves —
// element identity is fixed at binding install time, so there's no
// DataContext-change listener.
//
// Mode is left unset so EVD.ResolveDefaultMode upgrades it to TwoWay
// when the target DP declares BindsTwoWayByDefault — matches the
// DataContextBinding policy for consistency.
class ElementNameBindingImpl extends Binding
{
    private readonly watcher:     ElementNameWatcher;
    private readonly sourceThunk: () => Visual | undefined;
    private readonly pathStr:     string;

    private nameSource:     Visual | undefined;
    private sourceCallback: PropertyChangeCallback | undefined;
    private disposed = false;

    constructor(source: Visual | (() => Visual | undefined), path: string)
    {
        const watcher = new ElementNameWatcher();
        super(watcher, 'Value');
        this.watcher     = watcher;
        this.sourceThunk = typeof source === 'function' ? source : () => source;
        this.pathStr     = path;
        this.activate();
    }

    // Resolve the source. Backward x:name references (declared earlier
    // in the same template body) return a defined Visual on the first
    // call and the binding subscribes + walks immediately. FORWARD
    // references (the named element is constructed LATER in the same
    // factory body) return undefined the first time — the binding
    // re-attempts on the next microtask, by which point the factory's
    // synchronous run has completed and the var holding the named
    // element is initialized.
    private activate(): void
    {
        if (this.disposed) return;
        const src = this.sourceThunk();
        if (src === undefined)
        {
            queueMicrotask(() => this.activate());
            return;
        }
        this.nameSource = src;
        this.subscribeSource();
        this.watcher.Value = this.walkPath(src);
    }

    public override dispose(): void
    {
        this.disposed = true;
        super.dispose();
        this.unsubscribeSource();
    }

    // TwoWay writeback: when the target DP is mutated, push the new
    // value back to the source Visual via the path. WPF parity with
    // ElementName + Path TwoWay. Returns true when the path resolved
    // and the leaf write went through. No-op (returns false) when the
    // source hasn't resolved yet — a TwoWay write in that window would
    // have nowhere to land.
    public override set_value(value: unknown): boolean
    {
        if (this.nameSource === undefined) return false;
        if (!super.set_value(value)) return false;
        const segments = this.pathStr.split('.');
        let cur: unknown = this.nameSource;
        for (let i = 0; i < segments.length - 1; i++)
        {
            const seg = segments[i]!;
            if (cur instanceof Model)
            {
                cur = cur.get_property_value(resolveKey(cur, undefined, seg));
            }
            else if (cur !== null && typeof cur === 'object')
            {
                cur = (cur as Record<string, unknown>)[seg];
            }
            else
            {
                return true;
            }
            if (cur === undefined || cur === null) return true;
        }
        const lastSeg = segments[segments.length - 1]!;
        if (cur instanceof Model)
        {
            cur.set_property_value(resolveKey(cur, undefined, lastSeg), value);
        }
        else if (cur !== null && typeof cur === 'object')
        {
            (cur as Record<string, unknown>)[lastSeg] = value;
        }
        return true;
    }

    private firstSegment(): string
    {
        const dot = this.pathStr.indexOf('.');
        return dot < 0 ? this.pathStr : this.pathStr.substring(0, dot);
    }

    // Resolved at subscribeSource() time; reused by unsubscribeSource()
    // so detach doesn't re-walk the descriptor map.
    private sourceKey: PropertyKey<unknown> | undefined;

    private subscribeSource(): void
    {
        const src = this.nameSource;
        if (src === undefined) return;
        // Empty path → the binding's value IS the source itself. No
        // per-property subscription needed; the source reference is
        // fixed at activate time. Used for `Foo = $elem` shape bindings
        // that surface the named element itself rather than one of
        // its properties.
        if (this.pathStr === '') return;
        const first = this.firstSegment();
        if (!Model.HasProperty(src.constructor, first)) return;
        const key = resolveKey(src, undefined, first);
        this.sourceKey      = key;
        this.sourceCallback = () => { this.watcher.Value = this.walkPath(src); };
        src.AddPropertyChangedListener(key, this.sourceCallback);
    }

    private unsubscribeSource(): void
    {
        if (this.sourceCallback === undefined || this.sourceKey === undefined) return;
        if (this.nameSource === undefined) return;
        this.nameSource.RemovePropertyChangedListener(this.sourceKey, this.sourceCallback);
        this.sourceCallback = undefined;
        this.sourceKey      = undefined;
    }

    private walkPath(root: unknown): unknown
    {
        // Empty path → bind directly to the source Visual itself.
        // Mirrors WPF's `{Binding ElementName=foo}` with no Path —
        // the binding's value IS the named element.
        if (this.pathStr === '') return root;
        let cur: unknown = root;
        for (const seg of this.pathStr.split('.'))
        {
            if (cur === undefined || cur === null) return undefined;
            if (cur instanceof Model)
            {
                if (!Model.HasProperty(cur.constructor, seg)) return undefined;
                cur = cur.get_property_value(resolveKey(cur, undefined, seg));
            }
            else if (typeof cur === 'object')
            {
                cur = (cur as Record<string, unknown>)[seg];
            }
            else
            {
                return undefined;
            }
        }
        return cur;
    }
}

// Public factory — same shape as DataContextBinding so the compiler
// can emit both at value position with the same imperative form.
// `source` is the named element (an x:name'd Visual in a template
// body); `path` is the dotted property path to follow on it.
//
// A function-typed `source` is the compiler's emit shape for forward
// references in DataTemplate / ControlTemplate bodies — the named
// element is constructed LATER in the same factory body, so a direct
// Visual reference would be `undefined` at binding install time. The
// thunk defers resolution to the next microtask, by which point the
// factory's synchronous run has populated the var.
export function ElementNameBinding(source: Visual | (() => Visual | undefined), path: string): Binding
{
    return new ElementNameBindingImpl(source, path);
}
