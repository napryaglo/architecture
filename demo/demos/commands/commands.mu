// VM references — every [DataType=…] / [TargetType=…] below must be
// backed by an import so the compiler emits a real Function key, not a
// string.
import CommandsVM from "./commands-vm.mjs"
import RectFigure from "./commands-vm.mjs"
import EllipseFigure from "./commands-vm.mjs"
import NoteFigure from "./commands-vm.mjs"

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
    // Toolbar icons baked from the shared Material Symbols font at compile
    // time (one PathGeometry per name); a bare Shape paints each with the
    // toolbar's inherited ink (@OnSurfaceVariant).
    glyphs "../../assets/material-symbols-outlined.ttf" {
        save
        content_cut
        content_copy
        content_paste
        delete
        copy_all
        format_align_left
        format_align_center
        format_align_right
        vertical_align_top
        vertical_align_center
        vertical_align_bottom
        horizontal_distribute
        vertical_distribute
        undo
        redo
        // Text-placement 3x3 gallery — compass points + centre.
        north_west
        north
        north_east
        west
        filter_center_focus
        east
        south_west
        south
        south_east
    }

    // Split-button primary label — glyph + text. Inline attribute values
    // can't host a child block, so the composed label rides a keyed
    // resource referenced once by the ToolBarSplitButton's Content.
    StackPanel x:key="AlignSplitLabel" [ Orientation = Horizontal, VerticalAlignment = Center ] {
        Shape [ Geometry = @format_align_left, Width = 16, Height = 16, VerticalAlignment = Center ]
        TextBlock [ Text = "Align", Margin = (6,0,0,0), VerticalAlignment = Center ]
    }

    // Text-placement split button: the primary label + the 3x3 gallery layout.
    // The gallery IS the split button's popup — swapping its ItemsPanel to a
    // UniformGrid is what turns the default vertical menu into an icon grid.
    StackPanel x:key="PlacementSplitLabel" [ Orientation = Horizontal, VerticalAlignment = Center ] {
        Shape [ Geometry = @filter_center_focus, Width = 16, Height = 16, VerticalAlignment = Center ]
        TextBlock [ Text = "Placement", Margin = (6,0,0,0), VerticalAlignment = Center ]
    }
    ItemsPanelTemplate x:key="PlacementGrid" {
        UniformGrid [ Columns = 3 ]
    }

    // ── Shared Canvas ItemsPanel ────────────────────────────────────
    ItemsPanelTemplate x:key="CommandsCanvasPanel" {
        Canvas
    }

    // Selection-state Pen — every kind swaps Stroke to this on
    // IsSelected. Shared across the three Figure subclasses.
    Pen x:key="CommandsSelectedPen" [ Brush = #f97316, Thickness = 2 ]

    // ── Shared per-node ContextMenu ─────────────────────────────────
    ContextMenu x:key="NodeContextMenu" {
        MenuItem [ Header = "Cut", InputGestureText = "Ctrl+X", Command = $CutCommand ]
        MenuItem [ Header = "Copy", InputGestureText = "Ctrl+C", Command = $CopyCommand ]
        MenuItem [ Header = "Duplicate", InputGestureText = "Ctrl+D", Command = $DuplicateCommand ]
        MenuSeparator
        MenuItem [ Header = "Delete", InputGestureText = "Del", Command = $DeleteCommand ]
    }

    // ── Per-kind Styles — ContextMenu attached + selection chrome ──
    // Each Style auto-BasedOn's the framework Figure default Template
    // (Application.ResolveDefaultResource walks the prototype chain
    // from the subclass to Figure to find the theme entry). So the
    // catalog-rendered Shape stays intact; only ContextMenu and the
    // selection-state Stroke ride on top.
    Style [TargetType = RectFigure] {
        ContextMenuService.ContextMenu = @NodeContextMenu;
        when ( IsSelected ) { Stroke = @CommandsSelectedPen; }
    }
    Style [TargetType = EllipseFigure] {
        ContextMenuService.ContextMenu = @NodeContextMenu;
        when ( IsSelected ) { Stroke = @CommandsSelectedPen; }
    }
    Style [TargetType = NoteFigure] {
        ContextMenuService.ContextMenu = @NodeContextMenu;
        when ( IsSelected ) { Stroke = @CommandsSelectedPen; }
    }

    // ── Demo shell ──────────────────────────────────────────────────
    DataTemplate [DataType = CommandsVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ], BorderThickness = (1) ] {
            DockPanel {
                // Header — title + Classic/Ribbon mode toggle
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,10,16,10) ] {
                    DockPanel [ LastChildFill = true ] {
                        Checkbox
                            [ DockPanel.Dock = Right,
                              Content        = "Ribbon mode",
                              IsChecked      = $IsRibbonMode ]
                        TextBlock
                            [ Text              = "Menu + ToolBar + ContextMenu (Classic) or a tabbed Ribbon over one shared ICommand catalog. Select nodes to reveal the contextual Format tab.",
                              FontSize          = 14,
                              FontWeight        = Bold,
                              Foreground        = @OnPrimary,
                              VerticalAlignment = Center ]
                    }
                }

                // ── Classic chrome — Menu strip + ToolBar. Collapsed in
                //    Ribbon mode by the DataTemplate trigger below.
                StackPanel x:name="ClassicChrome" [ DockPanel.Dock = Top, Orientation = Vertical ] {

                // MenuButton strip (above the toolbar)
                Border
                    [ Fill      = @SurfaceContainerLow,
                      Stroke     = Pen [ Brush = @OutlineVariant ],
                      BorderThickness = (0,0,0,1),
                      Padding         = (8,6,8,6) ] {
                    StackPanel [ Orientation = Horizontal ] {
                        MenuButton [ Header = "☰  File", Margin = (0,0,8,0) ] {
                            MenuItem
                                [ Header           = "Save",
                                  InputGestureText = "Ctrl+S",
                                  Command          = $SaveCommand ]
                            MenuItem
                                [ Header           = "Load",
                                  InputGestureText = "Ctrl+O",
                                  Command          = $LoadCommand ]
                            MenuSeparator
                            MenuItem
                                [ Header           = "Cut",
                                  InputGestureText = "Ctrl+X",
                                  Command          = $CutCommand ]
                            MenuItem
                                [ Header           = "Copy",
                                  InputGestureText = "Ctrl+C",
                                  Command          = $CopyCommand ]
                            MenuItem
                                [ Header           = "Paste",
                                  InputGestureText = "Ctrl+V",
                                  Command          = $PasteCommand ]
                            MenuItem
                                [ Header           = "Delete",
                                  InputGestureText = "Del",
                                  Command          = $DeleteCommand ]
                            MenuSeparator
                            MenuItem
                                [ Header           = "Duplicate",
                                  InputGestureText = "Ctrl+D",
                                  Command          = $DuplicateCommand ]
                            MenuItem
                                [ Header           = "Select All",
                                  InputGestureText = "Ctrl+A",
                                  Command          = $SelectAllCommand ]
                            MenuSeparator
                            MenuItem
                                [ Header           = "Undo",
                                  InputGestureText = "Ctrl+Z",
                                  Command          = $UndoCommand ]
                            MenuItem
                                [ Header           = "Redo",
                                  InputGestureText = "Ctrl+Y",
                                  Command          = $RedoCommand ]
                        }
                        TextBlock
                            [ Text       = $Status,
                              FontSize   = 12,
                              Foreground = @OnSurface,
                              Margin     = (12,8,0,0) ]
                    }
                }

                // ToolBar strip
                Border
                    [ DockPanel.Dock  = Top,
                      Fill      = @Surface,
                      Stroke     = Pen [ Brush = @OutlineVariant ],
                      BorderThickness = (0,0,0,1) ] {
                    ToolBar {
                        ToolBarButton [ Command = $SaveCommand ] {
                            Shape [ Geometry = @save, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarSeparator
                        ToolBarButton [ Command = $CutCommand ] {
                            Shape [ Geometry = @content_cut, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarButton [ Command = $CopyCommand ] {
                            Shape [ Geometry = @content_copy, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarButton [ Command = $PasteCommand ] {
                            Shape [ Geometry = @content_paste, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarButton [ Command = $DeleteCommand ] {
                            Shape [ Geometry = @delete, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarButton [ Command = $DuplicateCommand ] {
                            Shape [ Geometry = @copy_all, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarSeparator
                        ToolBarButton [ Command = $AlignLeftCommand ] {
                            Shape [ Geometry = @format_align_left, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarButton [ Command = $AlignCenterCommand ] {
                            Shape [ Geometry = @format_align_center, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarButton [ Command = $AlignRightCommand ] {
                            Shape [ Geometry = @format_align_right, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarSeparator
                        ToolBarButton [ Command = $AlignTopCommand ] {
                            Shape [ Geometry = @vertical_align_top, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarButton [ Command = $AlignMiddleCommand ] {
                            Shape [ Geometry = @vertical_align_center, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarButton [ Command = $AlignBottomCommand ] {
                            Shape [ Geometry = @vertical_align_bottom, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarSeparator
                        ToolBarButton [ Command = $UndoCommand ] {
                            Shape [ Geometry = @undo, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        ToolBarButton [ Command = $RedoCommand ] {
                            Shape [ Geometry = @redo, Width = 16, Height = 16, VerticalAlignment = Center ]
                        }
                        // Split button — the primary half runs the default
                        // action (Align Left); the chevron opens a menu of the
                        // other arrange commands. Children are the dropdown
                        // MenuItems (they auto-close on click); the primary
                        // label rides the Content DP.
                        ToolBarSeparator
                        ToolBarSplitButton
                            [ Command = $AlignLeftCommand,
                              Content = @AlignSplitLabel ] {
                            MenuItem [ Header = "Align Left",   Command = $AlignLeftCommand,   Icon = Shape [ Geometry = @format_align_left,   Width = 16, Height = 16, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
                            MenuItem [ Header = "Align Center", Command = $AlignCenterCommand, Icon = Shape [ Geometry = @format_align_center, Width = 16, Height = 16, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
                            MenuItem [ Header = "Align Right",  Command = $AlignRightCommand,  Icon = Shape [ Geometry = @format_align_right,  Width = 16, Height = 16, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
                            MenuItem [ Header = "Align Top",    Command = $AlignTopCommand,    Icon = Shape [ Geometry = @vertical_align_top,   Width = 16, Height = 16, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
                            MenuItem [ Header = "Align Middle", Command = $AlignMiddleCommand, Icon = Shape [ Geometry = @vertical_align_center, Width = 16, Height = 16, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
                            MenuSeparator
                            MenuItem [ Header = "Distribute Horizontally", Command = $DistributeHorizontalCommand, Icon = Shape [ Geometry = @horizontal_distribute, Width = 16, Height = 16, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
                            MenuItem [ Header = "Distribute Vertically",   Command = $DistributeVerticalCommand,   Icon = Shape [ Geometry = @vertical_distribute,   Width = 16, Height = 16, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
                        }
                        // Gallery split button — same control, ICON-GRID variant.
                        // Setting ItemsPanel to a 3x3 UniformGrid swaps the popup
                        // from the default vertical menu to a matrix of icon-only
                        // ToolBarButtons (text placement: 4 sides, 4 corners,
                        // centre). Each button runs a $nodes.SetTextPlacement*
                        // command and, being a Button, closes the popup on click —
                        // the Gallery base wires that for any container kind.
                        ToolBarSeparator
                        ToolBarSplitButton
                            [ Content    = @PlacementSplitLabel,
                              ItemsPanel = @PlacementGrid ] {
                            ToolBarButton [ Command = $nodes.SetTextPlacementTopLeftCommand ]     { Shape [ Geometry = @north_west,           Width = 16, Height = 16, VerticalAlignment = Center ] }
                            ToolBarButton [ Command = $nodes.SetTextPlacementTopCommand ]         { Shape [ Geometry = @north,                Width = 16, Height = 16, VerticalAlignment = Center ] }
                            ToolBarButton [ Command = $nodes.SetTextPlacementTopRightCommand ]    { Shape [ Geometry = @north_east,           Width = 16, Height = 16, VerticalAlignment = Center ] }
                            ToolBarButton [ Command = $nodes.SetTextPlacementLeftCommand ]        { Shape [ Geometry = @west,                 Width = 16, Height = 16, VerticalAlignment = Center ] }
                            ToolBarButton [ Command = $nodes.SetTextPlacementCenterCommand ]      { Shape [ Geometry = @filter_center_focus,  Width = 16, Height = 16, VerticalAlignment = Center ] }
                            ToolBarButton [ Command = $nodes.SetTextPlacementRightCommand ]       { Shape [ Geometry = @east,                 Width = 16, Height = 16, VerticalAlignment = Center ] }
                            ToolBarButton [ Command = $nodes.SetTextPlacementBottomLeftCommand ]  { Shape [ Geometry = @south_west,           Width = 16, Height = 16, VerticalAlignment = Center ] }
                            ToolBarButton [ Command = $nodes.SetTextPlacementBottomCommand ]      { Shape [ Geometry = @south,                Width = 16, Height = 16, VerticalAlignment = Center ] }
                            ToolBarButton [ Command = $nodes.SetTextPlacementBottomRightCommand ] { Shape [ Geometry = @south_east,           Width = 16, Height = 16, VerticalAlignment = Center ] }
                        }
                    }
                }

                } // ── end ClassicChrome ──────────────────────────────

                // ── Ribbon chrome — tabbed grouped surface over the SAME
                //    ICommand catalog. Hidden by default; the DataTemplate
                //    trigger below reveals it in Ribbon mode. The contextual
                //    "Format" group activates on selection ($HasSelection).
                Border x:name="RibbonChrome" [ DockPanel.Dock = Top, Visibility = Collapsed ] {
                    Ribbon {
                        RibbonTab [ Header = "Home" ] {
                            RibbonGroup [ Header = "Clipboard" ] {
                                RibbonButton [ Text = "✂ Cut",   Command = $CutCommand ]
                                RibbonButton [ Text = "📋 Copy",  Command = $CopyCommand ]
                                RibbonButton [ Text = "📄 Paste", Command = $PasteCommand ]
                            }
                            RibbonGroup [ Header = "File", LaunchCommand = $SaveCommand ] {
                                RibbonButton [ Text = "💾 Save", Command = $SaveCommand ]
                                RibbonButton [ Text = "📂 Load", Command = $LoadCommand ]
                            }
                        }
                        RibbonTab [ Header = "Insert" ] {
                            RibbonGroup [ Header = "Nodes" ] {
                                RibbonButton [ Text = "⎘ Duplicate",  Command = $DuplicateCommand ]
                                RibbonButton [ Text = "Select All",   Command = $SelectAllCommand ]
                            }
                        }
                        RibbonTab [ Header = "View" ] {
                            RibbonGroup [ Header = "History" ] {
                                RibbonButton [ Text = "↶ Undo", Command = $UndoCommand ]
                                RibbonButton [ Text = "↷ Redo", Command = $RedoCommand ]
                            }
                        }
                        ContextualGroups {
                            RibbonContextualGroup
                                [ Header   = "Drawing Tools",
                                  Color    = #f97316,
                                  IsActive = $HasSelection ] {
                                RibbonTab [ Header = "Format" ] {
                                    RibbonGroup [ Header = "Edit" ] {
                                        RibbonButton [ Text = "🗑 Delete",     Command = $DeleteCommand ]
                                        RibbonButton [ Text = "⎘ Duplicate", Command = $DuplicateCommand ]
                                    }
                                    RibbonGroup [ Header = "Z-order" ] {
                                        RibbonButton [ Text = "Bring Front", Command = $BringFrontCommand ]
                                        RibbonButton [ Text = "Send Back",   Command = $SendBackCommand ]
                                    }
                                    RibbonGroup [ Header = "Align", LaunchCommand = $AlignLeftCommand ] {
                                        RibbonSmallButtonColumn {
                                            RibbonButton [ Text = "⬅ Left",   Command = $AlignLeftCommand ]
                                            RibbonButton [ Text = "⇔ Center", Command = $AlignCenterCommand ]
                                            RibbonButton [ Text = "➡ Right",  Command = $AlignRightCommand ]
                                        }
                                        RibbonSmallButtonColumn {
                                            RibbonButton [ Text = "⬆ Top",    Command = $AlignTopCommand ]
                                            RibbonButton [ Text = "↕ Middle", Command = $AlignMiddleCommand ]
                                            RibbonButton [ Text = "⬇ Bottom", Command = $AlignBottomCommand ]
                                        }
                                    }
                                }
                            }
                        }
                        QuickAccessItems {
                            RibbonButton [ Text = "💾", Command = $SaveCommand ]
                            RibbonButton [ Text = "↶", Command = $UndoCommand ]
                            RibbonButton [ Text = "↷", Command = $RedoCommand ]
                        }
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
                    [ ItemsSource             = $Nodes,
                      ItemsPanel              = @CommandsCanvasPanel,
                      SelectionMode           = Extended,
                      AllowMarqueeSelection   = true,
                      ReflectSelectionToItems = true,
                      Focusable               = true ]
            }
        }
        // Classic ↔ Ribbon swap. One flag drives both containers; when
        // false both revert to their base Visibility (Classic visible,
        // Ribbon collapsed).
        when ( $IsRibbonMode ) {
            ClassicChrome.Visibility = Collapsed;
            RibbonChrome.Visibility  = Visible;
        }
    }
}
