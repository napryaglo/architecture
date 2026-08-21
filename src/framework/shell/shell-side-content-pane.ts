import { Element, MetaData, MuralBase } from '../../runtime/index.js';
import { HeaderedContentControl } from '../base/headered-content-control.js';

// A titled side pane for the shell's side regions — the VSCode Explorer/panel
// shape. A header row pairs a title (left) with a commands block (right), above
// the pane's Content.
//
// Derives from HeaderedContentControl and reuses its slots:
//   * Header  — the pane TITLE (a string, e.g. "EXPLORER"). Rendered
//               left-aligned in the header bar with muted section-header
//               typography.
//   * Content — the pane body (inherited from ContentControl), filling the
//               area below the header.
//
// Adds one DP:
//   * Commands — right-aligned header content: the pane's command affordances
//                (a StackPanel / ToolBar of IconButtons, a "…" overflow menu, an
//                add / collapse button, …). A free content slot — the consumer
//                supplies whatever the pane needs; unset leaves the right side
//                empty.
//
//     const pane = new ShellSideContentPane();
//     pane.Header   = 'EXPLORER';
//     pane.Commands = commandBar;          // a StackPanel of IconButtons
//     pane.Content  = fileTree;
//
// The default Style + ControlTemplate live in shell.template.mu
// (@DefaultShellSideContentPane): a Border chrome wrapping a header bar
// (title + commands) over the content presenter.
export class ShellSideContentPane extends HeaderedContentControl
{
    // Right-aligned header content. `unknown` — like Header — so it can carry a
    // Visual (the usual case: a button row), a MuralBase rendered via a DataTemplate,
    // or a plain string. Measure + Render: it participates in the header row's
    // layout and paints.
    public static readonly CommandsKey = MuralBase.RegisterProperty<unknown>(
        ShellSideContentPane, 'Commands', undefined, MetaData.Measure | MetaData.Render);

    static
    {
        // Resolve the default Style keyed by this class function — the theme
        // dictionary holds Style[TargetType=ShellSideContentPane]. Without this
        // block applyDefaultStyle() silently no-ops.
        MuralBase.OverrideMetadata(
            ShellSideContentPane, Element.DefaultStyleKeyKey,
            { default_value: ShellSideContentPane });
    }

    constructor()
    {
        super();
        this.applyDefaultStyle();
    }

    public get Commands(): unknown { return this.get_property_value(ShellSideContentPane.CommandsKey); }
    public set Commands(v: unknown) { this.set_property_value(ShellSideContentPane.CommandsKey, v); }
}
