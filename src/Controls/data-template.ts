import type { Visual } from '../runtime/index.js';

// Factory signature for a DataTemplate. Constructs a fresh visual
// subtree for one item of data — typically run once per item by
// ItemsControl's container generator.
//
// The data is opaque to the framework — it can be a Model (so the
// factory can wire Bindings against it), a plain object, a primitive,
// or anything else. The factory is responsible for knowing what shape
// the data is in.
export type DataTemplateFactory = (data: unknown) => Visual;

// A DataTemplate describes how to render a single data item as a
// Visual. Distinct from ControlTemplate (which builds a control's
// visual structure from its properties) — DataTemplate is data-driven,
// applied once per item.
//
// WPF parity is intentionally partial:
//   * No DataType field — selecting a template by data type (the
//     `{x:Type customer}` form) requires a registry; can be layered
//     on later as DataTemplateSelector if needed.
//   * No template caching across instances — each Apply call runs
//     the factory and produces a fresh Visual subtree.
//   * No DataTrigger.
//
// Used by ItemsControl.ItemTemplate to render each item in its Items
// collection.
export class DataTemplate
{
    constructor(public readonly factory: DataTemplateFactory) {}

    public Apply(data: unknown): Visual
    {
        return this.factory(data);
    }
}
