import { type ICommand, Element, MetaData, Model, RelayCommand } from '../../../runtime/index.js';
import { HeaderedContentControl } from '../../base/headered-content-control.js';

// A single titled, collapsible section in the shell's Inspector region — the
// VS-style pinned property panel. Produced as the per-item container by
// InspectorStack (one per hosted inspector).
//
// Derives from HeaderedContentControl and reuses its slots:
//   * Header  — the section TITLE (a string, e.g. "Format Shape").
//   * Content — the inspector BODY (inherited from ContentControl): the hosted
//               inspector VM, rendered below the header through its
//               DataTemplate[DataType=<inspector>] (ContentControl's implicit
//               by-type dispatch).
//
// Adds one DP:
//   * IsExpanded — collapse state. When false the default template hides the
//                  body via a `when (IsExpanded = false)` trigger so the panel
//                  shrinks to its header. BindsTwoWayByDefault: the header
//                  toggle round-trips it, and InspectorStack binds it TwoWay to
//                  the inspector VM's own IsExpanded so state persists across
//                  container recycling.
//
// The default Style + ControlTemplate live in shell.template.mu
// (@DefaultInspectorPanel): header bar (collapse toggle + title + close) over a
// collapsible ContentPresenter.
export class InspectorPanel extends HeaderedContentControl
{
    public static readonly IsExpandedKey = Model.RegisterProperty<boolean>(
        InspectorPanel, 'IsExpanded', true,
        MetaData.Measure | MetaData.Arrange | MetaData.Render | MetaData.BindsTwoWayByDefault);

    // Flips IsExpanded — the header's collapse toggle binds it
    // (`Command = $$ToggleExpandedCommand`). A command (read-only from the
    // template's view) instead of a TwoWay TemplateBinding on IsChecked, so the
    // header stays a plain Button and the toggle path is unambiguous.
    public static readonly ToggleExpandedCommandKey = Model.RegisterProperty<ICommand>(
        InspectorPanel, 'ToggleExpandedCommand',
        undefined as unknown as ICommand, MetaData.None);

    static
    {
        // Resolve the default Style keyed by this class function — the theme
        // dictionary holds Style[TargetType=InspectorPanel]. Without this block
        // applyDefaultStyle() silently no-ops.
        Model.OverrideMetadata(
            InspectorPanel, Element.DefaultStyleKeyKey,
            { default_value: InspectorPanel });
    }

    constructor()
    {
        super();
        this.set_property_value(
            InspectorPanel.ToggleExpandedCommandKey,
            new RelayCommand(() => { this.IsExpanded = !this.IsExpanded; }, undefined,
                { Text: 'Collapse', Description: 'Collapse or expand this inspector panel.' }));
        this.applyDefaultStyle();
    }

    public get IsExpanded():  boolean { return this.get_property_value(InspectorPanel.IsExpandedKey); }
    public set IsExpanded(v: boolean) { this.set_property_value(InspectorPanel.IsExpandedKey, v); }

    public get ToggleExpandedCommand(): ICommand
    {
        return this.get_property_value(InspectorPanel.ToggleExpandedCommandKey);
    }
}
