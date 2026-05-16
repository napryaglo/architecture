import type { PropertyChangeCallback } from './effective-value.js';
import { Model } from './model.js';

// Internal: one parsed segment of a property path. Tracks the Model the
// segment is currently bound to so listeners can be detached on rebind.
// For attached-property syntax — `(Owner.Property)` — `ownerName` holds
// the owner-class name (resolved to a class via Model.find_class at
// traversal time) and `propertyName` holds the property name. For
// regular dotted segments, `ownerName` is undefined.
class PropertyPathSegment
{
    private propertyName: string;
    private ownerName: string | undefined;
    private object: Model | undefined;

    constructor(
        propertyName: string,
        ownerName: string | undefined,
        object: Model | undefined,
    )
    {
        this.propertyName = propertyName;
        this.ownerName = ownerName;
        this.object = object;
    }

    set Model(value: Model | undefined)
    {
        this.object = value;
    }

    get Model(): Model | undefined
    {
        return this.object;
    }

    get PropertyName(): string
    {
        return this.propertyName;
    }

    get OwnerName(): string | undefined
    {
        return this.ownerName;
    }
}

// Internal to the binding subsystem. Parses a WPF-style property path,
// traverses a Model graph at construction (registering per-instance
// listeners on each Model along the way), and propagates terminal-value
// changes to a subscriber when a chain mutation alters what the path
// resolves to.
class PropertyPath
{
    readonly path: string;
    private readonly segments: ReadonlyArray<PropertyPathSegment>;
    private readonly onChangedBound: PropertyChangeCallback;
    private resolvedValue: any;
    private onValueChanged: ((old_value: any, new_value: any) => void) | undefined;
    model: Model | undefined;

    constructor(source: Model, path: string)
    {
        this.path = path;
        this.segments = PropertyPath.parse(path);
        this.onChangedBound = this.OnChanged.bind(this);
        this.model = source;
        this.Traverse();
    }

    // Subscribe to terminal-value changes. The callback fires when a chain
    // mutation causes the path-resolved value to differ from the previous
    // resolved value. Pass undefined to detach.
    setOnValueChanged(cb: ((old_value: any, new_value: any) => void) | undefined): void
    {
        this.onValueChanged = cb;
    }

    // Removes every listener registered by Traverse/OnChanged from chain
    // Models and clears the callback. Idempotent. After disposal the path
    // is detached: get_value/set_value still walk the source argument, but
    // no chain mutation can push notifications back through this path.
    dispose(): void
    {
        for (const segment of this.segments)
        {
            if (segment.Model !== undefined)
            {
                this.detach_segment(segment);
                segment.Model = undefined;
            }
        }
        this.onValueChanged = undefined;
        this.resolvedValue = undefined;
        this.model = undefined;
    }

    // Splits a path into segments. Supports:
    //   * dotted members        a.b.c           → ['a', 'b', 'c']
    //   * indexed accessors     items[0]        → ['items', '0']
    //   * attached property     (Owner.Prop)    → one segment with ownerName='Owner', name='Prop'
    //   * mixed                 dept.(Grid.Row).color
    //
    // Quoted indexer keys ('foo' / "foo") have their surrounding quotes
    // stripped after the split.
    private static parse(path: string): ReadonlyArray<PropertyPathSegment>
    {
        // Match either a `(Owner.Property)` group OR a run of chars that
        // aren't structural separators. The capture in group 1 only fires
        // for the parenthesised form.
        const pattern = /\(([^)]+)\)|[^.[\]()]+/g;
        const segments: PropertyPathSegment[] = [];
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(path)) !== null)
        {
            const attached = match[1];
            if (attached !== undefined)
            {
                const dot = attached.indexOf('.');
                if (dot === -1)
                {
                    throw new Error(
                        `Invalid attached-property segment '(${attached})' — expected 'Owner.Property'.`,
                    );
                }
                const ownerName = attached.slice(0, dot).trim();
                const propertyName = attached.slice(dot + 1).trim();
                segments.push(new PropertyPathSegment(propertyName, ownerName, undefined));
            }
            else
            {
                const raw = match[0]!.trim().replace(/^["']|["']$/g, '');
                segments.push(new PropertyPathSegment(raw, undefined, undefined));
            }
        }
        return segments;
    }

    // Reads `segment` from `current`, dispatching to the right Model
    // overload (implicit-owner or explicit-owner) when `current` is a
    // Model. For non-Model values, falls back to bracket access.
    private static read_segment(current: any, segment: PropertyPathSegment): any
    {
        if (current === undefined || current === null) return undefined;
        if (current instanceof Model)
        {
            const ownerName = segment.OwnerName;
            if (ownerName === undefined)
            {
                return current.get_property_value(segment.PropertyName);
            }
            const owner = Model.find_class(ownerName);
            if (owner === undefined) return undefined;
            return current.get_property_value(owner, segment.PropertyName);
        }
        return current[segment.PropertyName];
    }

    // Writes value into `segment` on `parent`. Same dispatch rules as
    // read_segment. Plain (non-Model) parents use bracket assignment.
    private static write_segment(parent: any, segment: PropertyPathSegment, value: any): void
    {
        if (parent instanceof Model)
        {
            const ownerName = segment.OwnerName;
            if (ownerName === undefined)
            {
                parent.set_property_value(segment.PropertyName, value);
            }
            else
            {
                const owner = Model.find_class(ownerName);
                if (owner === undefined) return;
                parent.set_property_value(owner, segment.PropertyName, value);
            }
        }
        else
        {
            parent[segment.PropertyName] = value;
        }
    }

    // Attaches the path's onChanged listener to `current` for `segment`,
    // using the right Model overload. Sets segment.Model for later
    // detachment. Returns the next value along the chain.
    private attach_and_step(current: any, segment: PropertyPathSegment): any
    {
        if (current === undefined || current === null)
        {
            segment.Model = undefined;
            return undefined;
        }
        if (current instanceof Model)
        {
            segment.Model = current;
            const ownerName = segment.OwnerName;
            if (ownerName === undefined)
            {
                current.AddPropertyChangedListener(segment.PropertyName, this.onChangedBound);
                return current.get_property_value(segment.PropertyName);
            }
            const owner = Model.find_class(ownerName);
            if (owner === undefined) return undefined;
            current.AddPropertyChangedListener(owner, segment.PropertyName, this.onChangedBound);
            return current.get_property_value(owner, segment.PropertyName);
        }
        segment.Model = undefined;
        return current[segment.PropertyName];
    }

    // Detaches the path's onChanged listener for a previously-attached
    // segment. Mirrors attach_and_step.
    private detach_segment(segment: PropertyPathSegment): void
    {
        if (segment.Model === undefined) return;
        const ownerName = segment.OwnerName;
        if (ownerName === undefined)
        {
            segment.Model.RemovePropertyChangedListener(segment.PropertyName, this.onChangedBound);
        }
        else
        {
            const owner = Model.find_class(ownerName);
            if (owner !== undefined)
            {
                segment.Model.RemovePropertyChangedListener(owner, segment.PropertyName, this.onChangedBound);
            }
        }
    }

    OnChanged(model: Model, property: string, _old_value: any, new_value: any): void
    {
        for (let i = 0; i < this.segments.length; i++)
        {
            const seg_i = this.segments[i];
            if (seg_i?.Model === model && seg_i?.PropertyName === property)
            {
                let current: any = new_value;
                for (let j = i + 1; j < this.segments.length; j++)
                {
                    const seg_j = this.segments[j];
                    if (seg_j === undefined) continue;
                    this.detach_segment(seg_j);
                    current = this.attach_and_step(current, seg_j);
                }

                const previous = this.resolvedValue;
                this.resolvedValue = current;
                if (previous !== current)
                {
                    this.onValueChanged?.(previous, current);
                }
                break;
            }
        }
    }

    Traverse(): void
    {
        let current: any = this.model;
        for (const segment of this.segments)
        {
            current = this.attach_and_step(current, segment);
        }
        this.resolvedValue = current;
    }

    get_value(root: any): any
    {
        let current: any = root;
        for (const segment of this.segments)
        {
            if (current === undefined || current === null) return undefined;
            current = PropertyPath.read_segment(current, segment);
        }
        return current;
    }

    // Assigns value to the final segment of the path, after resolving the
    // parent object. For Model parents, the final write goes through
    // set_property_value so it participates in EffectiveValue priority and
    // PropertyChanged notifications; everything else is a plain assignment.
    // Returns false when the path is empty or the parent cannot be reached.
    set_value(root: any, value: any): boolean
    {
        if (this.segments.length === 0)
        {
            return false;
        }

        let parent: any = root;
        for (let i = 0; i < this.segments.length - 1; i++)
        {
            if (parent === undefined || parent === null)
            {
                return false;
            }
            parent = PropertyPath.read_segment(parent, this.segments[i]!);
        }

        if (parent === undefined || parent === null)
        {
            return false;
        }

        // Attached-segment writes require a resolvable owner class; if
        // the class isn't registered, the write silently no-ops (matches
        // read_segment's behavior). For plain Models / objects, write
        // through.
        const leaf = this.segments[this.segments.length - 1]!;
        if (leaf.OwnerName !== undefined && Model.find_class(leaf.OwnerName) === undefined)
        {
            return false;
        }
        PropertyPath.write_segment(parent, leaf, value);
        return true;
    }
}

export enum BindingMode
{
    OneWay,
    TwoWay,
    OneTime,
    OneWayToSource
}

// User-supplied value transformer applied between source and target.
// `convert` runs source → target; `convertBack` (if present) runs target → source
// for TwoWay / OneWayToSource writeback. Converters without `convertBack`
// pass writeback values through unchanged.
export interface ValueConverter
{
    convert(value: any): any;
    convertBack?(value: any): any;
}

// Optional configuration for a Binding. Fields are independent — any
// subset can be supplied. The resolved value flows through this
// pipeline (in order): converter → stringFormat → targetNullValue →
// fallbackValue. For TwoWay writeback, only converter.convertBack
// reverses; stringFormat is one-way by design.
export interface BindingOptions
{
    converter?: ValueConverter;
    // Format string applied after the converter. Currently supports
    // '{0}' substitution only (e.g., '$ {0}' → '$ 42'). Richer
    // formatting (number/date formats) can layer on later.
    stringFormat?: string;
    // Used when the resolved value is null (after Convert/Format).
    targetNullValue?: any;
    // Used when the resolved value is undefined (path couldn't reach
    // the source) OR — if you want WPF parity later — when anything
    // in the pipeline threw.
    fallbackValue?: any;
}

// Composes two converters: outer(inner(value)) for convert; for
// convertBack, only the inner one applies (outer is treated as one-way,
// since StringFormat composition uses this and string formatting is
// inherently lossy).
function compose_converters(inner: ValueConverter, outer: ValueConverter): ValueConverter
{
    return {
        convert(v: any): any { return outer.convert(inner.convert(v)); },
        convertBack: inner.convertBack ? (v: any) => inner.convertBack!(v) : undefined,
    };
}

// A Binding pairs a source root with a PropertyPath. get_value walks the
// path lazily and applies the converter / stringFormat / fallback pipeline;
// set_value (TwoWay / OneWayToSource only) writes back to the leaf via
// the path, running the value through convertBack first if a converter
// supplies one. Lifecycle is owned by whoever installs the Binding
// (typically a Model property's EVD, which disposes the previous Binding
// on replacement).
export class Binding
{
    private readonly source: any;
    private readonly path: PropertyPath;
    readonly mode: BindingMode;

    private readonly converter: ValueConverter | undefined;
    private readonly hasFallback: boolean;
    private readonly fallbackValue: any;
    private readonly hasTargetNull: boolean;
    private readonly targetNullValue: any;

    constructor(
        source: Model,
        path: string,
        mode: BindingMode = BindingMode.OneWay,
        opts?: BindingOptions,
    )
    {
        this.source = source;
        this.path = new PropertyPath(source, path);
        this.mode = mode;

        // Compose converter + stringFormat into a single converter.
        if (opts?.stringFormat !== undefined)
        {
            const fmt = opts.stringFormat;
            const formatter: ValueConverter = {
                convert(v: any): any { return fmt.replace('{0}', String(v)); },
            };
            this.converter = opts.converter
                ? compose_converters(opts.converter, formatter)
                : formatter;
        }
        else
        {
            this.converter = opts?.converter;
        }

        // `'field' in opts` distinguishes "not provided" from "explicitly
        // undefined" — lets callers use undefined as a fallback value.
        this.hasFallback = opts !== undefined && 'fallbackValue' in opts;
        this.fallbackValue = opts?.fallbackValue;
        this.hasTargetNull = opts !== undefined && 'targetNullValue' in opts;
        this.targetNullValue = opts?.targetNullValue;
    }

    // Source → target transformation: converter, then stringFormat
    // (folded into converter), then targetNullValue / fallbackValue
    // substitution. Used by get_value and by EVD push notifications so
    // consumer listeners see the post-pipeline value.
    public apply_transform(raw: any): any
    {
        const converted = this.converter ? this.converter.convert(raw) : raw;
        if (converted === undefined && this.hasFallback) return this.fallbackValue;
        if (converted === null && this.hasTargetNull) return this.targetNullValue;
        return converted;
    }

    // Resolves the current value of the bound source property,
    // post-pipeline.
    get_value(): any
    {
        return this.apply_transform(this.path.get_value(this.source));
    }

    // Subscribe to terminal-value changes on the underlying path. The
    // callback fires when a chain mutation alters the resolved value. Pass
    // undefined to detach (used when the consumer is replaced by another
    // base value).
    setOnValueChanged(cb: ((old_value: any, new_value: any) => void) | undefined): void
    {
        this.path.setOnValueChanged(cb);
    }

    // Tears down the underlying path: removes every listener it registered
    // on chain Models and clears its callback. Call when the Binding is
    // no longer needed (the EVD does this automatically when one Binding
    // replaces another).
    dispose(): void
    {
        this.path.dispose();
    }

    // Pushes a value back to the source property. Only meaningful for
    // TwoWay / OneWayToSource bindings; returns false otherwise, or when
    // the source path cannot be written. Runs through convertBack first
    // if the converter supplies one; otherwise the value passes through.
    set_value(value: any): boolean
    {
        if (this.mode !== BindingMode.TwoWay && this.mode !== BindingMode.OneWayToSource)
        {
            return false;
        }
        const back = this.converter?.convertBack !== undefined
            ? this.converter.convertBack(value)
            : value;
        return this.path.set_value(this.source, back);
    }
}
