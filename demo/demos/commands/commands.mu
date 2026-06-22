// VM references — every [DataType=…] / [TargetType=…] below must be
// backed by an import so the compiler emits a real Function key, not a
// string.
import CommandsVM    from "./commands-vm.mjs"
import RectFigure    from "./commands-vm.mjs"
import EllipseFigure from "./commands-vm.mjs"
import NoteFigure    from "./commands-vm.mjs"

// commands.mu — integration showcase: ToolBar + MenuButton + ContextMenu
// over a Diagram of selectable / movable nodes.
//
//   * Top strip: a hamburger MenuButton (File + Edit groups) and a
//     ToolBar with icon-only buttons (Save / Cut / Copy / Paste /
//     Delete / Duplicate + AlignLeft / AlignCenter / AlignRight).
//   * Body: a Diagram populated with three pre-seeded Figures. Click /
//     Ctrl-click / Shift-click / marquee selects; Delete removes
//     selected; the alignment commands operate on the selected
//     subset.
//   * Each node carries an attached ContextMenu (via a TargetType-keyed
//     Style on each Figure subclass) — right-click the node for Cut /
//     Copy / Duplicate / Delete in-place. The Styles auto-BasedOn the
//     framework Figure default Template, so the catalog-driven Shape
//     chrome still renders.
//
// Selection-gated commands (Cut / Copy / Delete / Duplicate / Align*)
// dim across all three surfaces in lockstep because they share the
// same RelayCommand instances. The bootstrap subscribes to the
// Diagram's SelectionChanged event and calls
// CommandsVM.PublishSelectionState — that pulse drives
// CanExecuteChanged on every gated command.

resources CommandsDemo {

    // ── Shared Canvas ItemsPanel ────────────────────────────────────
    ItemsPanelTemplate x:key="CommandsCanvasPanel" { Canvas }

    // Selection-state Pen — every kind swaps Stroke to this on
    // IsSelected. Shared across the three Figure subclasses.
    Pen x:key="CommandsSelectedPen" [Brush=#f97316, Thickness=2]

    // ── Shared per-node ContextMenu ─────────────────────────────────
    ContextMenu x:key="NodeContextMenu" {
        MenuItem[Header="Cut",       InputGestureText="Ctrl+X", Command=$CutCommand]
        MenuItem[Header="Copy",      InputGestureText="Ctrl+C", Command=$CopyCommand]
        MenuItem[Header="Duplicate", InputGestureText="Ctrl+D", Command=$DuplicateCommand]
        MenuSeparator
        MenuItem[Header="Delete",    InputGestureText="Del",    Command=$DeleteCommand]
    }

    // ── Per-kind Styles — ContextMenu attached + selection chrome ──
    // Each Style auto-BasedOn's the framework Figure default Template
    // (Application.ResolveDefaultResource walks the prototype chain
    // from the subclass to Figure to find the theme entry). So the
    // catalog-rendered Shape stays intact; only ContextMenu and the
    // selection-state Stroke ride on top.
    Style [TargetType=RectFigure] {
        ContextMenuService.ContextMenu = @NodeContextMenu;
        when ( IsSelected ) { Stroke = @CommandsSelectedPen; }
    }
    Style [TargetType=EllipseFigure] {
        ContextMenuService.ContextMenu = @NodeContextMenu;
        when ( IsSelected ) { Stroke = @CommandsSelectedPen; }
    }
    Style [TargetType=NoteFigure] {
        ContextMenuService.ContextMenu = @NodeContextMenu;
        when ( IsSelected ) { Stroke = @CommandsSelectedPen; }
    }

    // ── Demo shell ──────────────────────────────────────────────────
    DataTemplate x:key="CommandsTemplate" [DataType=CommandsVM] {
        Border [Background=@Surface, BorderBrush=@OutlineVariant,
                BorderThickness=(1)]{

            DockPanel {
                // Header
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,10,16,10)]{
                    TextBlock[Text="ToolBar + Menu + ContextMenu over a Diagram. Select nodes (click / Ctrl-click / marquee) and use the commands.",
                              FontSize=14, FontWeight=Bold,
                              Foreground=@OnPrimary]
                }

                // MenuButton strip (above the toolbar)
                Border[DockPanel.Dock=Top,
                       Background=@SurfaceContainerLow,
                       BorderBrush=@OutlineVariant,
                       BorderThickness=(0,0,0,1),
                       Padding=(8,6,8,6)]{
                    StackPanel[Orientation=Horizontal]{
                        MenuButton[Header="☰  File", Margin=(0,0,8,0)]{
                            MenuItem[Header="Save",   InputGestureText="Ctrl+S", Command=$SaveCommand]
                            MenuItem[Header="Load",   InputGestureText="Ctrl+O", Command=$LoadCommand]
                            MenuSeparator
                            MenuItem[Header="Cut",    InputGestureText="Ctrl+X", Command=$CutCommand]
                            MenuItem[Header="Copy",   InputGestureText="Ctrl+C", Command=$CopyCommand]
                            MenuItem[Header="Paste",  InputGestureText="Ctrl+V", Command=$PasteCommand]
                            MenuItem[Header="Delete", InputGestureText="Del",    Command=$DeleteCommand]
                            MenuSeparator
                            MenuItem[Header="Duplicate",  InputGestureText="Ctrl+D", Command=$DuplicateCommand]
                            MenuItem[Header="Select All", InputGestureText="Ctrl+A", Command=$SelectAllCommand]
                            MenuSeparator
                            MenuItem[Header="Undo", InputGestureText="Ctrl+Z", Command=$UndoCommand]
                            MenuItem[Header="Redo", InputGestureText="Ctrl+Y", Command=$RedoCommand]
                        }
                        TextBlock[Text=$Status, FontSize=12, Foreground=@OnSurface,
                                  Margin=(12,8,0,0)]
                    }
                }

                // ToolBar strip
                Border[DockPanel.Dock=Top,
                       Background=@Surface,
                       BorderBrush=@OutlineVariant,
                       BorderThickness=(0,0,0,1)]{
                    ToolBar {
                        ToolBarButton[Command=$SaveCommand]{      TextBlock[Text="💾"] }
                        ToolBarSeparator
                        ToolBarButton[Command=$CutCommand]{       TextBlock[Text="✂"]  }
                        ToolBarButton[Command=$CopyCommand]{      TextBlock[Text="📋"] }
                        ToolBarButton[Command=$PasteCommand]{     TextBlock[Text="📄"] }
                        ToolBarButton[Command=$DeleteCommand]{    TextBlock[Text="🗑"]  }
                        ToolBarButton[Command=$DuplicateCommand]{ TextBlock[Text="⎘"]  }
                        ToolBarSeparator
                        ToolBarButton[Command=$AlignLeftCommand]{   TextBlock[Text="⬅"] }
                        ToolBarButton[Command=$AlignCenterCommand]{ TextBlock[Text="⇔"] }
                        ToolBarButton[Command=$AlignRightCommand]{  TextBlock[Text="➡"] }
                        ToolBarSeparator
                        ToolBarButton[Command=$AlignTopCommand]{    TextBlock[Text="⬆"] }
                        ToolBarButton[Command=$AlignMiddleCommand]{ TextBlock[Text="↕"] }
                        ToolBarButton[Command=$AlignBottomCommand]{ TextBlock[Text="⬇"] }
                        ToolBarSeparator
                        ToolBarButton[Command=$UndoCommand]{ TextBlock[Text="⤺"] }
                        ToolBarButton[Command=$RedoCommand]{ TextBlock[Text="⤻"] }
                    }
                }

                // Canvas — the Diagram's default Template already wraps
                // an ItemsPresenter in a ScrollViewer, so no enclosing
                // Border / ScrollViewer is needed here. Items are
                // Figures themselves (RectFigure / EllipseFigure /
                // NoteFigure); ReflectSelectionToItems pushes the
                // marquee / Ctrl-click selection state onto each item's
                // IsSelected DP so the Style triggers fire.
                Diagram x:name="nodes"
                       [ItemsSource = $Nodes,
                        ItemsPanel  = @CommandsCanvasPanel,
                        SelectionMode = Extended,
                        AllowMarqueeSelection = true,
                        ReflectSelectionToItems = true,
                        Focusable = true]
            }
        }
    }
}
