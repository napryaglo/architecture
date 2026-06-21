import { MetaData, Model, Rect, type KeyEventArgs, type Visual } from '../../runtime/index.js';
import { Figure } from './figure.js';
import { Selector } from '../list/selector.js';

// §19.3 follow-up — position snap callback. Consumers (e.g., the
// diagram demo's align-edges behavior) set this DP to a pure function
// that returns the snapped rect for a given cursor-derived candidate
// rect. Figure.OnPointerMove consults the parent Diagram and
// applies the snap before writing X / Y, so alignment guides
// translate into real snap-on-drag behavior without behaviors having
// to fight the framework's drag positioning.
export type DiagramPositionSnap = (rect: Rect) => Rect;

// Selector flavour that materializes each item into a Figure
// container instead of the default ContentPresenter wrap. The Selector
// base supplies the SelectedItem / SelectedIndex / SelectedValue surface
// out of the box, so a Diagram consumer can data-bind selection the
// same way ListBox / ComboBox do; per-container highlight rides on the
// matching DataTemplate trigger (`when($IsSelected)`).
//
// The override below is the entire point of the subclass — a Visio-/
// drawio-style surface needs its containers to own position + drag-to-
// move, and Figure bakes both into a single ContentControl.
// Everything else (ItemsPanel, ItemTemplate, ItemContainerStyle, item
// binding, selection) is inherited unchanged.
//
// Pair with `ItemsPanel = ItemsPanelTemplate { Canvas }` so the
// Figure containers are placed on a Canvas that honours their
// Canvas.Left / Canvas.Top — Figure mirrors its own X / Y onto
// those attached properties so a parent Canvas places it.
export class Diagram extends Selector
{
    // §19.3 — `PositionSnap` callback. Default `undefined` = no snap,
    // identity behavior. When set, Figure.OnPointerMove calls it
    // with the cursor-derived candidate rect and uses the returned
    // rect's X / Y for its position write.
    public static readonly PositionSnapKey = Model.RegisterProperty<DiagramPositionSnap | undefined>(
        Diagram, 'PositionSnap', undefined, MetaData.None);

    public get PositionSnap():  DiagramPositionSnap | undefined { return this.get_property_value(Diagram.PositionSnapKey); }
    public set PositionSnap(v: DiagramPositionSnap | undefined) { this.set_property_value(Diagram.PositionSnapKey, v); }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        const node = new Figure();
        this.bindContainer(node, item);
        return node;
    }

    // Arrow keys nudge selected nodes' position rather than navigate
    // selection (Visio / drawio / Figma convention). The Selector base
    // treats ArrowDown / ArrowUp as ListBox-style "move focus to next
    // row" — wrong shape for a free-positioned canvas surface, so the
    // override intercepts arrows BEFORE super.OnKeyDown runs.
    //
    // Step size: 1 dp plain, 10 dp with Shift (matches the canonical
    // "snap-to-grid"-ish increment in every drawing tool). Each
    // selected Figure's X / Y bumps directly; the BindsTwoWayByDefault
    // contract on Figure.X / Y back-propagates the new position to
    // the bound item VM through ItemContainerStyle, so the data layer
    // sees the move without the Diagram reaching into item shape.
    //
    // No-op (and falls through to Selector base) when nothing is
    // selected — so arrow keys on an empty selection still drive
    // selection navigation should the consumer rely on it.
    protected override OnKeyDown(args: KeyEventArgs): void
    {
        const key = args.Key;
        const isArrow = key === 'ArrowLeft' || key === 'ArrowRight'
                     || key === 'ArrowUp'   || key === 'ArrowDown';
        if (isArrow && this._selectedContainers.size > 0)
        {
            const step = args.Modifiers.Shift ? 10 : 1;
            const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
            const dy = key === 'ArrowUp'   ? -step : key === 'ArrowDown'  ? step : 0;
            for (const container of this._selectedContainers)
            {
                if (container instanceof Figure)
                {
                    container.X = container.X + dx;
                    container.Y = container.Y + dy;
                }
            }
            args.Handled = true;
            return;
        }
        super.OnKeyDown(args);
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        // Symmetric with GetContainerForItemOverride: a recycled
        // Figure re-binds to the new item — DataContext flips so
        // ItemContainerStyle bindings retarget, and Content flips so
        // the DataTemplate dispatch resolves against the new constructor.
        if (container instanceof Figure)
        {
            this.bindContainer(container, item);
            return;
        }
        super.RebindContainerForItemOverride(container, item);
    }

    // Wire a freshly-created OR recycled Figure to its data row.
    // Mirrors ListBox.bindContainer: the container subclass owns the
    // DataContext setup so ItemContainerStyle bindings on the container
    // (`X = $X`, `Y = $Y`, …) resolve against the per-item Model rather
    // than against whatever the surrounding inheritance chain exposes.
    // ContentControl's own DataContext is NOT set by Content assignment —
    // that's a WPF parity decision (a ContentControl's outer bindings see
    // the outer scope). For container-shaped subclasses like Figure
    // we want the item exposed; that's this method's job.
    //
    // Tag is set so Selector.exposedValueOf returns the bound item — so
    // SelectedItem / SelectedItems / SelectionChanged surface the
    // NodeVM, not the Figure container. Same pattern as ListBox.
    private bindContainer(node: Figure, item: unknown): void
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
