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

// Selector that extracts the child-items iterable from a parent data
// item, used by HierarchicalDataTemplate. Returning undefined means
// "leaf" — the item has no children. Returning an iterable (array,
// ObservableCollection, etc.) means the consumer (a TreeView-style
// ItemsControl) should recursively realize containers for each child.
export type HierarchicalChildSelector = (data: unknown) => Iterable<unknown> | undefined;

// DataTemplate variant that announces a child-items relationship in
// addition to building the parent container. Used by hierarchical
// ItemsControls (TreeView and friends) to discover sub-items without
// the data model needing a fixed interface.
//
// Three fields beyond DataTemplate's factory:
//   * `itemsSelector` — pulls children off the parent data
//   * `itemTemplate`  — DataTemplate for the children; when undefined,
//     consumers typically fall back to the same HierarchicalDataTemplate
//     (recursive realization with one template throughout the tree).
//   * `itemContainerStyle` — optional Style applied to each child
//     container (TreeView passes this down to nested ItemsControls).
//
// The template itself doesn't realize children — that's the consumer's
// responsibility. HierarchicalDataTemplate just carries the policy.
export class HierarchicalDataTemplate extends DataTemplate
{
    constructor(
        factory: DataTemplateFactory,
        public readonly itemsSelector: HierarchicalChildSelector,
        public readonly itemTemplate: DataTemplate | undefined = undefined,
        public readonly itemContainerStyle: unknown | undefined = undefined,
    )
    {
        super(factory);
    }

    // Walk the child-items pulled from `data` via itemsSelector.
    // Returns an empty iterable when the selector returns undefined,
    // so callers can iterate uniformly without an extra branch.
    public *ItemsOf(data: unknown): Iterable<unknown>
    {
        const it = this.itemsSelector(data);
        if (it === undefined) return;
        yield* it;
    }
}
