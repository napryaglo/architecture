import type { MetaData } from './metadata.js';
import type { Model } from './model.js';

// Invoked to coerce a property's base value into its allowed range,
// returning the value that becomes the coerced entry.
export type CoerceValue = (model: Model, base_value: any) => any;

// Per-class metadata options. Root registrations must supply default_value
// and meta_data; overrides may omit any field, in which case reads fall
// through to the parent descriptor's value (WPF-style metadata merge).
export interface PropertyMetadata
{
    default_value?: any;
    meta_data?: MetaData;
    coerce_value?: CoerceValue;
}

// Class-level schema entry for a registered property. One descriptor per
// (class, property) pair; subclasses can chain a descriptor with a parent
// reference via Model.OverrideMetadata so unspecified fields fall through.
//
// `propertyClass` is the class this particular descriptor is filed under
// (the class passed to RegisterProperty or OverrideMetadata). `RootOwner`
// walks the override chain to find the class that originally registered
// the property — that's the one used to compose the per-instance storage
// key, so overrides don't accidentally change a property's identity.
export class PropertyDescriptor
{
    private propertyClass: Function;
    private name: string;
    private own: PropertyMetadata;
    private parent_descriptor: PropertyDescriptor | undefined;
    private readOnly: boolean;

    constructor(
        owner: Function,
        name: string,
        own: PropertyMetadata,
        parent_descriptor?: PropertyDescriptor,
        readOnly: boolean = false,
    )
    {
        this.propertyClass = owner;
        this.name = name;
        this.own = own;
        this.parent_descriptor = parent_descriptor;
        this.readOnly = readOnly;
    }

    // Read-only-ness lives on the root descriptor — OverrideMetadata
    // can change metadata fields but not access semantics. Walking the
    // parent chain ensures override descriptors inherit the root's flag.
    public get IsReadOnly(): boolean
    {
        return this.parent_descriptor !== undefined
            ? this.parent_descriptor.IsReadOnly
            : this.readOnly;
    }

    public get Owner(): Function
    {
        return this.propertyClass;
    }

    // The class that originally registered this property (walks past any
    // metadata-override descriptors). Used as the canonical identity for
    // composing the per-instance storage key.
    public get RootOwner(): Function
    {
        return this.parent_descriptor?.RootOwner ?? this.propertyClass;
    }

    public get Name(): string
    {
        return this.name;
    }

    public get DefaultValue(): any
    {
        if ('default_value' in this.own) return this.own.default_value;
        return this.parent_descriptor?.DefaultValue;
    }

    public get MetaData(): MetaData
    {
        if ('meta_data' in this.own) return this.own.meta_data!;
        return this.parent_descriptor!.MetaData;
    }

    public get CoerceValue(): CoerceValue | undefined
    {
        if ('coerce_value' in this.own) return this.own.coerce_value;
        return this.parent_descriptor?.CoerceValue;
    }
}
