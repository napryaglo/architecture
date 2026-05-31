import { Binding, BindingMode } from './binding.js';
import { MetaData } from './metadata.js';
import { Model } from './model.js';
import type { PropertyChangeCallback } from './effective-value.js';
import type { Visual } from './visual.js';

// Internal Model that carries the resolved DataContext-path value as
// its own property. DataContextBinding inherits from Binding with this
// watcher as the source; setting `Value` here fires Binding's change
// machinery which then propagates to the EVD that owns the binding.
//
// Same pattern as `ResourceWatcher` in dynamic-resource.ts. Kept
// private since DataContextBinding owns the lifecycle.
class DataContextWatcher extends Model
{
    static {
        Model.RegisterProperty(DataContextWatcher, 'Value', undefined, MetaData.None);
    }
    public get Value(): unknown { return this.get_property_value('Value'); }
    public set Value(v: unknown) { this.set_property_value('Value', v); }
}

// Binding that resolves a dotted path against the target Visual's
// DataContext, refreshing whenever DataContext changes (DataContext is
// inherited so an ancestor mutation flows down via the existing
// property-inheritance path) or whenever a Model in the resolution
// chain raises a property change on a segment we're watching.
//
// Resolution rules:
//   * `dc instanceof Model` → use `dc.get_property_value(segment)` and
//     subscribe to that segment's property changes for reactivity.
//   * Plain object → use `dc[segment]` (one-shot read; no reactive
//     update on plain-object mutation — out of scope for v0).
//   * `dc === undefined / null` → the binding's value is undefined.
//
// Dotted paths walk segment-by-segment; intermediate undefined/null
// short-circuits to undefined. Only the FIRST segment subscribes for
// reactivity in v0; mutations deeper in the chain (e.g. swapping
// `customer.address` to a different Address instance) won't auto-
// re-resolve. Documented limitation; common cases (one-segment paths
// like `$Name`) work.
class DataContextBindingImpl extends Binding
{
    private readonly watcher: DataContextWatcher;
    private readonly target:  Visual;
    private readonly pathStr: string;
    private readonly dcCallback: PropertyChangeCallback;

    // The Model we're currently subscribed to for property changes on
    // the first path segment, and the callback we registered. Cleared
    // on each refresh so we can detach cleanly.
    private currentSource:    Model | undefined;
    private sourceCallback:   PropertyChangeCallback | undefined;

    constructor(target: Visual, path: string)
    {
        const watcher = new DataContextWatcher();
        super(watcher, 'Value', BindingMode.OneWay);
        this.watcher = watcher;
        this.target  = target;
        this.pathStr = path;

        this.dcCallback = () => this.refresh();
        target.AddPropertyChangedListener('DataContext', this.dcCallback);
        this.refresh();
    }

    public override dispose(): void
    {
        super.dispose();
        this.target.RemovePropertyChangedListener('DataContext', this.dcCallback);
        this.unsubscribeSource();
    }

    private unsubscribeSource(): void
    {
        if (this.currentSource !== undefined && this.sourceCallback !== undefined)
        {
            this.currentSource.RemovePropertyChangedListener(
                this.firstSegment(), this.sourceCallback);
        }
        this.currentSource  = undefined;
        this.sourceCallback = undefined;
    }

    private firstSegment(): string
    {
        const dot = this.pathStr.indexOf('.');
        return dot < 0 ? this.pathStr : this.pathStr.substring(0, dot);
    }

    // Re-resolve the path against the target's current DataContext and
    // wire up a fresh source-side subscription on the first segment so
    // mutations propagate while this binding lives.
    private refresh(): void
    {
        this.unsubscribeSource();
        const dc = this.target.DataContext;
        if (dc === undefined || dc === null)
        {
            this.watcher.Value = undefined;
            return;
        }
        const first = this.firstSegment();
        if (dc instanceof Model)
        {
            this.currentSource  = dc;
            this.sourceCallback = () => { this.watcher.Value = this.walkPath(dc); };
            dc.AddPropertyChangedListener(first, this.sourceCallback);
        }
        this.watcher.Value = this.walkPath(dc);
    }

    // Walk the dotted path starting from `root`. Each segment reads
    // either a Model property or a plain-object field; intermediate
    // undefined/null short-circuits to undefined.
    private walkPath(root: unknown): unknown
    {
        let cur: unknown = root;
        for (const seg of this.pathStr.split('.'))
        {
            if (cur === undefined || cur === null) return undefined;
            if (cur instanceof Model)
            {
                cur = cur.get_property_value(seg);
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

// Public factory — matches the DynamicResource shape so the compiler
// can emit both at value-position uses with the same imperative form.
//
// Usage:
//   border.set_property_value('Background', DataContextBinding(border, 'AccentBrush'));
//
// In Style setters where the target isn't yet known, wrap in a
// SetterFactory so each application gets its own per-target binding:
//   new Setter(Border, 'Background',
//              new SetterFactory(t => DataContextBinding(t, 'AccentBrush')));
export function DataContextBinding(target: Visual, path: string): Binding
{
    return new DataContextBindingImpl(target, path);
}
