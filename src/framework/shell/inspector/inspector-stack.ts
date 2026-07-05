import { DataContextBinding, type Model, type Visual } from '../../../runtime/index.js';
import { ItemsControl } from '../../base/items-control.js';
import { InspectorPanel } from './inspector-panel.js';
import type { IInspector } from '../services/inspector.js';

// The Inspector region's item host: an ItemsControl that wraps each hosted
// inspector in a collapsible InspectorPanel, stacking them vertically (the
// VS-style pinned property panels). Bound `ItemsSource = $Inspectors` and given
// a vertical ItemsPanel in markup (@InspectorStackPanel); it needs no default
// Style — ItemsControl hosts its panel directly when no ControlTemplate is set.
//
// Container contract (WPF ItemsControl overrides):
//   * GetContainerForItemOverride  → a fresh InspectorPanel per inspector.
//   * PrepareContainerForItemOverride → title + body + expand-state wiring.
//   * ClearContainerForItemOverride  → releases that wiring on removal.
export class InspectorStack extends ItemsControl
{
    // A pre-built InspectorPanel in Items is already the right container shape.
    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof InspectorPanel;
    }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        if (item instanceof InspectorPanel) return item;
        return new InspectorPanel();
    }

    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        if (container instanceof InspectorPanel && !(item instanceof InspectorPanel))
        {
            this.bindPanel(container, item as IInspector);
        }
    }

    // Container recycling rebind (plain panels don't recycle, but honour the
    // hook for correctness) — re-point an existing panel at a new inspector.
    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        if (container instanceof InspectorPanel && !(item instanceof InspectorPanel))
        {
            this.bindPanel(container, item as IInspector);
        }
        else
        {
            super.RebindContainerForItemOverride(container, item);
        }
    }

    public override ClearContainerForItemOverride(container: Visual, item: unknown): void
    {
        if (container instanceof InspectorPanel)
        {
            // Drop the body + expand-binding so the removed panel doesn't retain
            // the inspector (and its shared child visuals) after teardown.
            container.Content     = undefined;
            container.DataContext = undefined;
        }
        super.ClearContainerForItemOverride(container, item);
    }

    // Wire an InspectorPanel to its inspector:
    //   * DataContext = the inspector → the panel template binds `$Title` /
    //     `$Id` and reaches `$service(InspectorService)` for its close command.
    //   * Content = the inspector → ContentControl resolves the inspector's
    //     DataTemplate[DataType=<inspector>] and slots the produced body.
    //   * IsExpanded ⇄ the inspector's own IsExpanded (TwoWay) → collapse state
    //     lives on the VM, so it survives container recycling and a re-Add()
    //     surfaces the panel expanded.
    private bindPanel(panel: InspectorPanel, item: IInspector): void
    {
        panel.DataContext = item;
        // Every IInspector is a Model (Inspector base) at runtime; ContentControl
        // resolves it through its DataTemplate[DataType=<inspector>].
        panel.Content     = item as unknown as Model;
        // Install a reactive TwoWay binding: IsExpanded ⇄ item.IsExpanded. The
        // typed key rejects a Binding at compile time (the value type is boolean);
        // the EVD detects and installs the Binding at runtime — same pattern the
        // compiler emits in generated .mu.js. Cast to satisfy the signature.
        panel.set_property_value(
            InspectorPanel.IsExpandedKey,
            DataContextBinding(panel, 'IsExpanded') as unknown as boolean);
    }
}
