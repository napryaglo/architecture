import { Model, type Visual } from '../../runtime/index.js';
import { DiagramNode } from './diagram-node.js';
import { Selector } from '../list/selector.js';

// Selector flavour that materializes each item into a DiagramNode
// container instead of the default ContentPresenter wrap. The Selector
// base supplies the SelectedItem / SelectedIndex / SelectedValue surface
// out of the box, so a Diagram consumer can data-bind selection the
// same way ListBox / ComboBox do; per-container highlight rides on the
// matching DataTemplate trigger (`when($IsSelected)`).
//
// The override below is the entire point of the subclass — a Visio-/
// drawio-style surface needs its containers to own position + drag-to-
// move, and DiagramNode bakes both into a single ContentControl.
// Everything else (ItemsPanel, ItemTemplate, ItemContainerStyle, item
// binding, selection) is inherited unchanged.
//
// Pair with `ItemsPanel = ItemsPanelTemplate { Canvas }` so the
// DiagramNode containers are placed on a Canvas that honours their
// Canvas.Left / Canvas.Top — DiagramNode mirrors its own X / Y onto
// those attached properties so a parent Canvas places it.
export class Diagram extends Selector
{
    public override GetContainerForItemOverride(item: unknown): Visual
    {
        const node = new DiagramNode();
        this.bindContainer(node, item);
        return node;
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        // Symmetric with GetContainerForItemOverride: a recycled
        // DiagramNode re-binds to the new item — DataContext flips so
        // ItemContainerStyle bindings retarget, and Content flips so
        // the DataTemplate dispatch resolves against the new constructor.
        if (container instanceof DiagramNode)
        {
            this.bindContainer(container, item);
            return;
        }
        super.RebindContainerForItemOverride(container, item);
    }

    // Wire a freshly-created OR recycled DiagramNode to its data row.
    // Mirrors ListBox.bindContainer: the container subclass owns the
    // DataContext setup so ItemContainerStyle bindings on the container
    // (`X = $X`, `Y = $Y`, …) resolve against the per-item Model rather
    // than against whatever the surrounding inheritance chain exposes.
    // ContentControl's own DataContext is NOT set by Content assignment —
    // that's a WPF parity decision (a ContentControl's outer bindings see
    // the outer scope). For container-shaped subclasses like DiagramNode
    // we want the item exposed; that's this method's job.
    //
    // Tag is set so Selector.exposedValueOf returns the bound item — so
    // SelectedItem / SelectedItems / SelectionChanged surface the
    // NodeVM, not the DiagramNode container. Same pattern as ListBox.
    private bindContainer(node: DiagramNode, item: unknown): void
    {
        if (item instanceof Model)
        {
            node.Tag         = item;
            node.DataContext = item;
            node.Content     = item;
        }
        else
        {
            node.Tag         = undefined;
            node.DataContext = undefined;
            node.Content     = undefined;
        }
    }
}
