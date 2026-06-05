import type { Panel } from '../runtime/index.js';

// Factory signature for an items panel — produces ONE Panel per
// ItemsControl instance (not per item; the panel hosts all containers).
// Same shape as the JS-side ItemsPanelFactory that existed before
// ItemsPanelTemplate was introduced; both forms are accepted by
// ItemsControl.ItemsPanel for backwards compatibility with hand-rolled
// JS callers.
export type ItemsPanelFactory = () => Panel;

// Thin template wrapper around a panel factory. Mirrors WPF's
// ItemsPanelTemplate: a *recipe* for the layout panel that an
// ItemsControl drops its realized item containers into. Created either
// declaratively via the `.mu` compiler (`ItemsPanelTemplate x:key="…" { … }`
// resource form, or inline as a slot-assign value) or in code by
// passing a closure to the constructor.
//
// Single-shot — `Apply()` runs the factory once and returns the produced
// Panel. ItemsControl invokes this when the ItemsPanel property changes
// to a new template.
export class ItemsPanelTemplate
{
    constructor(public readonly factory: ItemsPanelFactory) {}

    public Apply(): Panel
    {
        return this.factory();
    }
}
