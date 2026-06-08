// VM references — every [DataType=…] below must be backed by an
// import so the compiler emits a real Function key, not a string.
import CommandsVM    from "./commands-vm.mjs"
import RectNodeVM    from "./commands-vm.mjs"
import EllipseNodeVM from "./commands-vm.mjs"
import NoteNodeVM    from "./commands-vm.mjs"

// commands.mu — integration showcase: ToolBar + MenuButton + ContextMenu
// over a Diagram of selectable / movable nodes.
//
//   * Top strip: a hamburger MenuButton (File + Edit groups) and a
//     ToolBar with icon-only buttons (Save / Cut / Copy / Paste /
//     Delete / Duplicate + AlignLeft / AlignCenter / AlignRight).
//   * Body: a Diagram populated with three pre-seeded shapes. Click /
//     Ctrl-click / Shift-click / marquee selects; Delete removes
//     selected; the alignment commands operate on the selected
//     subset.
//   * Each node carries an attached ContextMenu — right-click the
//     node for Cut / Copy / Duplicate / Delete in-place.
//
// Selection-gated commands (Cut / Copy / Delete / Duplicate / Align*)
// dim across all three surfaces in lockstep because they share the
// same RelayCommand instances. The bootstrap subscribes to the
// Diagram's SelectionChanged event and calls
// CommandsVM.PublishSelectionState — that pulse drives
// CanExecuteChanged on every gated command.

ResourceDictionary {

    // ── Per-node container style (drag-to-move + selection click) ───
    Style x:key="CommandsNodeStyle" [TargetType=DiagramNode] {
        X = $X;
        Y = $Y;
    }

    // ── Shared Canvas ItemsPanel ────────────────────────────────────
    ItemsPanelTemplate x:key="CommandsCanvasPanel" { Canvas }

    // ── Chrome styles per shape kind ────────────────────────────────
    Style x:key="CommandsRectChromeStyle"    [TargetType=Border]  { BorderBrush = #1d4ed8; }
    Style x:key="CommandsNoteChromeStyle"    [TargetType=Border]  { BorderBrush = #a16207; }
    Style x:key="CommandsEllipseChromeStyle" [TargetType=Ellipse] { Stroke      = #15803d; }

    // ── Shared per-node ContextMenu ─────────────────────────────────
    ContextMenu x:key="NodeContextMenu" {
        MenuItem[Header="Cut",       InputGestureText="Ctrl+X", Command=$CutCommand]
        MenuItem[Header="Copy",      InputGestureText="Ctrl+C", Command=$CopyCommand]
        MenuItem[Header="Duplicate", InputGestureText="Ctrl+D", Command=$DuplicateCommand]
        MenuSeparator
        MenuItem[Header="Delete",    InputGestureText="Del",    Command=$DeleteCommand]
    }

    // ── Per-shape DataTemplates ──────────────────────────────────────
    DataTemplate [DataType=RectNodeVM] {
        Border x:name="chrome"
              [Style=@CommandsRectChromeStyle,
               Width=130, Height=60,
               Background=$FillBrush,
               BorderThickness=(1.5), CornerRadius=4,
               ContextMenuService.ContextMenu=@NodeContextMenu]{
            TextBlock [Text=$LabelText, FontSize=13,
                       Foreground=#1f2937,
                       HorizontalAlignment=Center,
                       VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.BorderBrush = #f97316; }
    }

    DataTemplate [DataType=EllipseNodeVM] {
        Canvas x:root [Width=130, Height=60,
                       ContextMenuService.ContextMenu=@NodeContextMenu]{
            Ellipse x:name="chrome"
                   [Style=@CommandsEllipseChromeStyle,
                    Width=130, Height=60,
                    Fill=$FillBrush, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=130, Height=60,
                       Text=$LabelText, FontSize=13,
                       Foreground=#1f2937,
                       HorizontalAlignment=Center,
                       VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=NoteNodeVM] {
        Border x:name="chrome"
              [Style=@CommandsNoteChromeStyle,
               Width=130, Height=60,
               Background=$FillBrush,
               BorderThickness=(1.5), CornerRadius=2,
               ContextMenuService.ContextMenu=@NodeContextMenu]{
            TextBlock [Text=$LabelText, FontSize=13,
                       Foreground=#1f2937,
                       HorizontalAlignment=Center,
                       VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.BorderBrush = #f97316; }
    }

    // ── Demo shell ──────────────────────────────────────────────────
    DataTemplate x:key="CommandsTemplate" [DataType=CommandsVM] {
        Border [Background=#ffffff, BorderBrush=#e2e8f0,
                BorderThickness=(1)]{

            DockPanel {
                // Header
                Border[DockPanel.Dock=Top,
                       Background=#1976d2, Padding=(16,10,16,10)]{
                    TextBlock[Text="ToolBar + Menu + ContextMenu over a Diagram. Select nodes (click / Ctrl-click / marquee) and use the commands.",
                              FontSize=14, FontWeight=Bold,
                              Foreground=#ffffff]
                }

                // MenuButton strip (above the toolbar)
                Border[DockPanel.Dock=Top,
                       Background=#f8fafc,
                       BorderBrush=#e2e8f0,
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
                            MenuItem[Header="Duplicate", InputGestureText="Ctrl+D", Command=$DuplicateCommand]
                            MenuItem[Header="Select All", InputGestureText="Ctrl+A", Command=$SelectAllCommand]
                            MenuSeparator
                            MenuItem[Header="Undo", InputGestureText="Ctrl+Z", Command=$UndoCommand]
                            MenuItem[Header="Redo", InputGestureText="Ctrl+Y", Command=$RedoCommand]
                        }
                        TextBlock[Text=$Status, FontSize=12, Foreground=#1f2937,
                                  Margin=(12,8,0,0)]
                    }
                }

                // ToolBar strip
                Border[DockPanel.Dock=Top,
                       Background=#ffffff,
                       BorderBrush=#e2e8f0,
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

                // Canvas — fills remaining space
                Border x:name="surface" [Background=#f1f5f9]{
                    Diagram x:name="nodes"
                           [ItemsSource = $Nodes,
                            ItemsPanel = @CommandsCanvasPanel,
                            ItemContainerStyle = @CommandsNodeStyle,
                            SelectionMode = Extended,
                            AllowMarqueeSelection = true]
                }
            }
        }
    }
}
