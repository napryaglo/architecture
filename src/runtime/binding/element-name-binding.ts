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
    private readonly watcher:   ElementNameWatcher;
    private readonly nameSource: Visual;
    private readonly pathStr:   string;

    private sourceCallback: PropertyChangeCallback | undefined;

    constructor(source: Visual, path: string)
    {
        const watcher = new ElementNameWatcher();
        super(watcher, 'Value');
        this.watcher    = watcher;
        this.nameSource = source;
        this.pathStr    = path;

        this.subscribeSource();
        this.watcher.Value = this.walkPath(source);
    }

    public override dispose(): void
    {
        super.dispose();
        this.unsubscribeSource();
    }

    // TwoWay writeback: when the target DP is mutated, push the new
    // value back to the source Visual via the path. WPF parity with
    // ElementName + Path TwoWay. Returns true when the path resolved
    // and the leaf write went through.
    public override set_value(value: unknown): boolean
    {
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
        const first = this.firstSegment();
        if (!Model.HasProperty(this.nameSource.constructor, first)) return;
        const key = resolveKey(this.nameSource, undefined, first);
        this.sourceKey      = key;
        this.sourceCallback = () => { this.watcher.Value = this.walkPath(this.nameSource); };
        this.nameSource.AddPropertyChangedListener(key, this.sourceCallback);
    }

    private unsubscribeSource(): void
    {
        if (this.sourceCallback === undefined || this.sourceKey === undefined) return;
        this.nameSource.RemovePropertyChangedListener(this.sourceKey, this.sourceCallback);
        this.sourceCallback = undefined;
        this.sourceKey      = undefined;
    }

    private walkPath(root: unknown): unknown
    {
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
export function ElementNameBinding(source: Visual, path: string): Binding
{
    return new ElementNameBindingImpl(source, path);
}
