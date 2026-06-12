import { Binding, BindingMode } from './binding.js';
import { MetaData } from '../metadata.js';
import { Model } from '../model.js';
import type { PropertyChangeCallback } from './effective-value.js';
import type { Visual } from '../visual.js';

// Watcher Model carrying the converter's combined output. Same pattern
// as DataContextWatcher in data-context-binding.ts — the underlying
// Binding pushes the resolved value through this Model's "Value"
// property so the EVD machinery picks it up.
class MultiBindingWatcher extends Model
{
    public static readonly ValueKey = Model.RegisterProperty<unknown>(
        MultiBindingWatcher, 'Value', undefined, MetaData.None);

    public get Value(): unknown { return this.get_property_value(MultiBindingWatcher.ValueKey); }
    public set Value(v: unknown) { this.set_property_value(MultiBindingWatcher.ValueKey, v); }
}

// MultiBinding: resolves N dotted paths against the host Visual's
// DataContext, calls the converter with the resolved values in path
// order, and pushes the result through the underlying Binding so the
// target property sees the recomputed value.
//
// Built specifically for inline expressions like `{{ $a + $b * 2 }}`,
// which the compiler lowers to:
//
//   set_property_value("Width", MultiBinding(target, ["a","b"],
//                                            (a, b) => a + b * 2));
//
// Reactivity matches DataContextBinding's contract: the host's
// DataContext changes refresh everything; first-segment property
// changes on each path's source Model refresh too. Mutations deeper
// than the first segment don't auto-refresh — documented limitation,
// inherited from the same one-segment subscription policy.
class MultiBindingImpl extends Binding
{
    private readonly watcher:   MultiBindingWatcher;
    private readonly target:    Visual;
    private readonly paths:     ReadonlyArray<string>;
    private readonly multiConverter: (...values: unknown[]) => unknown;
    private readonly dcCallback: PropertyChangeCallback;

    // For each path, the Model we're currently subscribed to on its
    // first segment, and the callback we installed. Cleared on every
    // refresh so re-resolution is idempotent.
    private currentSources:    (Model | undefined)[];
    private sourceCallbacks:   (PropertyChangeCallback | undefined)[];

    constructor(
        target:    Visual,
        paths:     ReadonlyArray<string>,
        converter: (...values: unknown[]) => unknown,
    )
    {
        const watcher = new MultiBindingWatcher();
        super(watcher, 'Value', BindingMode.OneWay);
        this.watcher   = watcher;
        this.target    = target;
        this.paths     = paths;
        this.multiConverter = converter;
        this.currentSources  = new Array(paths.length).fill(undefined);
        this.sourceCallbacks = new Array(paths.length).fill(undefined);

        this.dcCallback = () => this.refresh();
        target._add_property_changed_listener_by_name('DataContext', this.dcCallback);
        this.refresh();
    }

    public override dispose(): void
    {
        super.dispose();
        this.target._remove_property_changed_listener_by_name('DataContext', this.dcCallback);
        this.unsubscribeAll();
    }

    private unsubscribeAll(): void
    {
        for (let i = 0; i < this.paths.length; i++)
        {
            const src = this.currentSources[i];
            const cb  = this.sourceCallbacks[i];
            if (src !== undefined && cb !== undefined)
            {
                src._remove_property_changed_listener_by_name(firstSegment(this.paths[i]!), cb);
            }
            this.currentSources[i]  = undefined;
            this.sourceCallbacks[i] = undefined;
        }
    }

    // Re-resolve every path against the host's current DataContext, wire
    // up fresh first-segment subscriptions, and push the converter's
    // result through the underlying Binding.
    private refresh(): void
    {
        this.unsubscribeAll();
        const dc = this.target.DataContext;

        const values: unknown[] = new Array(this.paths.length);
        for (let i = 0; i < this.paths.length; i++)
        {
            const path = this.paths[i]!;
            values[i] = walkPath(dc, path);

            // Subscribe to the first segment for this path if the
            // current DataContext is a Model. Mutations to deeper
            // segments aren't picked up — matching DataContextBinding.
            if (dc instanceof Model)
            {
                const first = firstSegment(path);
                const cb: PropertyChangeCallback = () => this.recompute();
                dc._add_property_changed_listener_by_name(first, cb);
                this.currentSources[i]  = dc;
                this.sourceCallbacks[i] = cb;
            }
        }

        this.watcher.Value = this.safeConvert(values);
    }

    // Lightweight re-fire: read every path's current value off the
    // current DataContext and call the converter again, without
    // touching the subscription wiring. Used by first-segment property
    // change notifications where the DC itself didn't change.
    private recompute(): void
    {
        const dc = this.target.DataContext;
        const values: unknown[] = new Array(this.paths.length);
        for (let i = 0; i < this.paths.length; i++)
        {
            values[i] = walkPath(dc, this.paths[i]!);
        }
        this.watcher.Value = this.safeConvert(values);
    }

    // Converter exceptions shouldn't kill the binding pipeline — surface
    // undefined and let the target property apply its own fallback /
    // targetNullValue logic.
    private safeConvert(values: unknown[]): unknown
    {
        try { return this.multiConverter(...values); }
        catch { return undefined; }
    }
}

function firstSegment(path: string): string
{
    const dot = path.indexOf('.');
    return dot < 0 ? path : path.substring(0, dot);
}

function walkPath(root: unknown, path: string): unknown
{
    let cur: unknown = root;
    for (const seg of path.split('.'))
    {
        if (cur === undefined || cur === null) return undefined;
        if (cur instanceof Model) cur = cur._get_property_value_by_name(seg);
        else if (typeof cur === 'object') cur = (cur as Record<string, unknown>)[seg];
        else return undefined;
    }
    return cur;
}

// Watcher Model for the general (child-bindings) MultiBinding /
// PriorityBinding forms. Each child is a full Binding (potentially
// with its own source, converter, ValidationRules, etc.); the watcher
// holds the composed result and the outer Binding subclass listens on
// its Value property the same way as the inline-expression form.
class CombinedBindingWatcher extends Model
{
    public static readonly ValueKey = Model.RegisterProperty<unknown>(
        CombinedBindingWatcher, 'Value', undefined, MetaData.None);

    public get Value(): unknown { return this.get_property_value(CombinedBindingWatcher.ValueKey); }
    public set Value(v: unknown) { this.set_property_value(CombinedBindingWatcher.ValueKey, v); }
}

// Backing class for MultiBinding(bindings, converter) and
// PriorityBinding(bindings). Subscribes to each child Binding's value
// notifications; on any change, re-runs the `recompute` strategy and
// pushes the result through the watcher. Exception safety: child or
// recompute throws surface as `undefined` so fallbackValue can apply
// on the outer target.
class CombinedBindingImpl extends Binding
{
    private readonly watcher:  CombinedBindingWatcher;
    private readonly children: readonly Binding[];
    private readonly recompute: () => unknown;

    constructor(children: readonly Binding[], recompute: () => unknown)
    {
        const watcher = new CombinedBindingWatcher();
        super(watcher, 'Value', BindingMode.OneWay);
        this.watcher   = watcher;
        this.children  = children;
        this.recompute = recompute;

        // Each child's resolved value changing — for any reason
        // (path mutation, source DataContext flip, collection
        // pulse) — triggers a fresh combine.
        for (const child of children)
        {
            child.setOnValueChanged(() => this.fire());
            child.setOnCollectionPulse(() => this.fire());
        }
        this.fire();
    }

    public override dispose(): void
    {
        super.dispose();
        for (const child of this.children) child.dispose();
    }

    private fire(): void
    {
        let next: unknown;
        try { next = this.recompute(); }
        catch { next = undefined; }
        this.watcher.Value = next;
    }
}

// Public factory — matches the shape of DataContextBinding / DynamicResource
// so the compiler can emit a uniform `set_property_value("Foo",
// MultiBinding(target, paths, converter))` line.
//
// In Style setters where the target isn't yet known, wrap in a
// SetterFactory so each application gets its own per-target binding:
//   new Setter(Border, 'Width',
//              new SetterFactory(t =>
//                  MultiBinding(t, ['a','b'], (a, b) => a + b)));
//
// Overload (general WPF form):
//   MultiBinding(bindings: Binding[], converter)
// Each child Binding carries its own source / path / converter. The
// converter receives the children's resolved values in array order.
// Useful when sources differ (e.g., mixing DataContext and ElementName
// bindings) or when each child needs its own pipeline.
export function MultiBinding(
    target:    Visual,
    paths:     ReadonlyArray<string>,
    converter: (...values: unknown[]) => unknown,
): Binding;
export function MultiBinding(
    bindings:  ReadonlyArray<Binding>,
    converter: (...values: unknown[]) => unknown,
): Binding;
export function MultiBinding(
    arg1: Visual | ReadonlyArray<Binding>,
    arg2: ReadonlyArray<string> | ((...values: unknown[]) => unknown),
    arg3?: (...values: unknown[]) => unknown,
): Binding
{
    if (Array.isArray(arg1))
    {
        // General form: children + converter.
        const children = arg1 as ReadonlyArray<Binding>;
        const converter = arg2 as (...values: unknown[]) => unknown;
        const values = (): unknown[] => children.map(c => c.get_value());
        return new CombinedBindingImpl(children, () => converter(...values()));
    }
    // Inline-expression form: target Visual + paths + converter.
    return new MultiBindingImpl(
        arg1 as Visual,
        arg2 as ReadonlyArray<string>,
        arg3!,
    );
}

// Resolves to the first child whose value is not `undefined`. Used for
// fallback chains — e.g., a TextBlock that prefers a user-set Title,
// then the VM's Title, then a resource lookup. Mirrors WPF's
// PriorityBinding. When every child resolves to undefined, the
// combined value is undefined and the outer binding's fallbackValue
// applies on the consumer side.
export function PriorityBinding(bindings: ReadonlyArray<Binding>): Binding
{
    return new CombinedBindingImpl(bindings, () =>
    {
        for (const b of bindings)
        {
            const v = b.get_value();
            if (v !== undefined) return v;
        }
        return undefined;
    });
}
