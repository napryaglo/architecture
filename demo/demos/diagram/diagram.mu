// diagram.mu — node-only Visio-/drawio-style scene backed by the
// framework's DiagramDocument. Items inside the canvas ARE Figure /
// Group instances directly (no data/visual split, no DataTemplate
// dispatch for items). The toolbox rail enumerates ToolboxShape
// instances; dropping a tile onto the canvas calls the Document's
// CreateNode method through the Mutator wiring.

import DiagramTool from "./diagram-tools.mjs"

resources DiagramDemo {
    // ── Boolean-combine glyphs ──────────────────────────────────────
    //
    // The Group/Combine toolbar's set-operation icons are baked from the
    // Material Symbols font into PathGeometry resources at COMPILE TIME
    // (the `glyphs` keyword → one PathGeometry per entry, keyed by glyph
    // name). The IconButtons paint true vector geometry with a theme
    // brush — `Shape[Geometry=@join, Fill=@OnSurfaceVariant]` — instead
    // of font-dependent TextBlock math symbols (∪ ∩ − ⊕). The Venn-style
    // join glyphs map onto the boolean ops:
    //
    //   union     → @join        (both circles)
    //   intersect → @join_inner  (overlap only)
    //   subtract  → @join_left   (left minus overlap)
    //   exclude   → @difference  (both minus overlap)
    glyphs "../../assets/material-symbols-outlined.ttf" {
        join
        join_inner
        join_left
        difference
    }

    // ── Shared Canvas ItemsPanel ────────────────────────────────────
    //
    // Canvas.MeasureOverride returns the union bounding box of its
    // children — so the canvas extent grows automatically as nodes
    // are moved / dropped past the previous bounds. The surrounding
    // ScrollViewer's scrollable extent tracks that growth because
    // Canvas.Left / Canvas.Top are flagged Measure | Arrange; a
    // position change cascades the child's InvalidateMeasure up to
    // the Canvas itself, the new DesiredSize bubbles up to the
    // ScrollViewer, and a new scrollbar thumb extent is published in
    // the same layout pass.
    ItemsPanelTemplate x:key="DiagramCanvasPanel" {
        PaginatedCanvas [ PageWidth = 800, PageHeight = 600 ]
    }

    // ── Toolbox ItemsPanel — 2-column UniformGrid so 35 tiles fit in
    // a reasonable vertical footprint inside the 200-wide rail.
    ItemsPanelTemplate x:key="DiagramToolboxPanel" {
        UniformGrid [ Columns = 2 ]
    }

    // ── Toolbox tile template ───────────────────────────────────────
    //
    // ONE tile template — the picture is a ContentControl hosting the
    // ToolboxShape's PreviewNode (a per-Kind Figure sized 48×48).
    // ContentControl's Visual-content path slots the Figure directly
    // (no DataTemplate dispatch) and the Figure renders itself.
    DataTemplate x:key="DiagramTileTemplate" [DataType = ToolboxShape] {
        Border x:root
            [ IsDraggable     = true,
              OnDragStart     = $BeginKindDragData,
              Background      = @Surface,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (1),
              CornerRadius    = 4,
              Padding         = (4,8,4,8),
              Margin          = (2,0,2,4) ] {
            StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                ContentControl
                    [ Content             = $PreviewNode,
                      Width               = 48,
                      Height              = 48,
                      HorizontalAlignment = Center ]
                TextBlock
                    [ Text                = $Label,
                      FontSize            = 10,
                      Foreground          = @OnSurface,
                      Margin              = (0,4,0,0),
                      HorizontalAlignment = Center ]
            }
        }
    }

    // ── Command-toolbar tile ────────────────────────────────────────
    // One ToolBarButton per DiagramTool descriptor. The four header
    // toolbars each bind ItemsSource to an inline DiagramTool[] array;
    // this shared template renders every entry — the Shape paints the
    // tool's Icon geometry and the button invokes its Command. The
    // descriptors carry both because they're authored INSIDE this
    // template's scope, where the @icon resources and the
    // $nodes.<X>Command element-source bindings both resolve (the latter
    // lowers to a lexical `_nodes` thunk, so it binds fine onto a
    // non-visual data object).
    DataTemplate x:key="DiagramToolTemplate" [DataType = DiagramTool] {
        ToolBarButton [ Command = $Command ] {
            Shape [ Geometry = $Icon, Fill = @OnSurfaceVariant, Width = 20, Height = 20 ]
        }
    }

    // ── Diagram workspace ──────────────────────────────────────────
    DataTemplate x:key="DiagramTemplate" [DataType = DiagramDocument] {
        Border x:root
            [ Background      = @Surface,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (1) ] {
            DockPanel {
                // Header strip.
                Border [ DockPanel.Dock = Top, Height = 44, Background = @Primary ] {
                    StackPanel [ Orientation = Horizontal, Margin = (16,0,0,0) ] {
                        Shape
                            [ Geometry          = @home,
                              Fill              = @OnPrimary,
                              Width             = 24,
                              Height            = 24,
                              VerticalAlignment = Center ]
                        TextBlock
                            [ Text              = "Diagrammer",
                              FontSize          = 15,
                              FontWeight        = Bold,
                              Foreground        = @OnPrimary,
                              VerticalAlignment = Center,
                              Margin            = (8,0,0,0) ]
                        TextBlock
                            [ Text              = $Status,
                              FontSize          = 12,
                              Foreground        = @OnPrimary,
                              VerticalAlignment = Center,
                              Margin            = (20,0,0,0) ]
                    }
                }

                // Align / Distribute / Group / Combine — four ToolBars in
                // a row (WPF ToolBarTray-style; no Tray control ships, so a
                // horizontal StackPanel hosts them). Each ToolBar is
                // data-driven: ItemsSource is an inline DiagramTool[] array
                // pairing an @icon geometry with one of the framework
                // Diagram's RelayCommands (via the named `nodes` x:name
                // forward ref), rendered through @DiagramToolTemplate.
                // Items past the strip width collapse into each ToolBar's
                // overflow chevron popup.
                Border
                    [ DockPanel.Dock  = Top,
                      Background      = @SurfaceContainer,
                      BorderBrush     = @OutlineVariant,
                      BorderThickness = (0,0,0,1),
                      Padding         = (8,4,8,4) ] {
                    StackPanel [ Orientation = Horizontal ] {
                        ToolBar
                            [ ItemTemplate = @DiagramToolTemplate,
                              ItemsSource  = [
                                DiagramTool [ Icon = @alignLeft,   Command = $nodes.AlignLeftCommand ],
                                DiagramTool [ Icon = @alignRight,  Command = $nodes.AlignRightCommand ],
                                DiagramTool [ Icon = @alignTop,    Command = $nodes.AlignTopCommand ],
                                DiagramTool [ Icon = @alignMiddle, Command = $nodes.AlignMiddleCommand ],
                                DiagramTool [ Icon = @alignCenter, Command = $nodes.AlignCenterCommand ] ] ]
                        ToolBar
                            [ Margin       = (8,0,0,0),
                              ItemTemplate = @DiagramToolTemplate,
                              ItemsSource  = [
                                DiagramTool [ Icon = @distributeHorizontal, Command = $nodes.DistributeHorizontalCommand ],
                                DiagramTool [ Icon = @distributeVertical,   Command = $nodes.DistributeVerticalCommand ] ] ]
                        ToolBar
                            [ Margin       = (8,0,0,0),
                              ItemTemplate = @DiagramToolTemplate,
                              ItemsSource  = [
                                DiagramTool [ Icon = @group,   Command = $nodes.GroupCommand ],
                                DiagramTool [ Icon = @ungroup, Command = $nodes.UngroupCommand ] ] ]
                        ToolBar
                            [ Margin       = (8,0,0,0),
                              ItemTemplate = @DiagramToolTemplate,
                              ItemsSource  = [
                                DiagramTool [ Icon = @join,       Command = $nodes.CombineUnionCommand ],
                                DiagramTool [ Icon = @join_inner, Command = $nodes.CombineIntersectCommand ],
                                DiagramTool [ Icon = @join_left,  Command = $nodes.CombineSubtractCommand ],
                                DiagramTool [ Icon = @difference, Command = $nodes.CombineExcludeCommand ] ] ]
                    }
                }

                // Toolbox strip — Document.ToolboxShapes drives an
                // ItemsControl bound through DiagramTileTemplate.
                Border
                    [ DockPanel.Dock  = Left,
                      Width           = 200,
                      Background      = @SurfaceContainerLow,
                      BorderBrush     = @OutlineVariant,
                      BorderThickness = (0,0,1,0),
                      Padding         = (8) ] {
                    DockPanel {
                        TextBlock
                            [ DockPanel.Dock = Top,
                              Text           = "Shapes",
                              FontSize       = 11,
                              FontWeight     = Bold,
                              Foreground     = @OnSurfaceVariant,
                              Margin         = (2,0,0,8) ]
                        StackPanel [ DockPanel.Dock = Bottom ] {
                            TextBlock
                                [ Text       = "Document",
                                  FontSize   = 11,
                                  FontWeight = Bold,
                                  Foreground = @OnSurfaceVariant,
                                  Margin     = (2,12,0,8) ]
                            StackPanel [ Orientation = Horizontal, Margin = (0,0,0,8) ] {
                                Button [ Command = $SaveCommand, Margin = (0,0,4,0) ] {
                                    TextBlock [ Text = "Save", FontSize = 11 ]
                                }
                                Button [ Command = $LoadCommand ] {
                                    TextBlock [ Text = "Load", FontSize = 11 ]
                                }
                            }
                            TextBlock
                                [ Text         = "Drag a shape onto the canvas to\n                                            place it. Click a node to\n                                            select; Ctrl-click to toggle;\n                                            Shift-click to range-extend.\n                                            Drag-rectangle on empty space\n                                            for marquee. Click empty space\n                                            to clear. Delete removes every\n                                            selected node.",
                                  TextWrapping = Wrap,
                                  FontSize     = 10,
                                  Foreground   = @OnSurfaceVariant,
                                  Margin       = (2,4,2,0) ]
                        }
                        ScrollViewer [ IsAutoHideScrollBars = false ] {
                            ItemsControl
                                [ ItemsSource = $ToolboxShapes,
                                  ItemsPanel  = @DiagramToolboxPanel ]
                        }
                    }
                }

                // Right-side Format Shape pane — bound to the framework
                // Diagram's SelectionFormatFill / SelectionFormatStroke
                // (the FormatMirror collaborator seeds these from the
                // first selected leaf and broadcasts edits onto every
                // selected leaf).
                Border
                    [ DockPanel.Dock  = Right,
                      Width           = 320,
                      Background      = @SurfaceContainerLow,
                      BorderBrush     = @OutlineVariant,
                      BorderThickness = (1,0,0,0),
                      Padding         = (12) ] {
                    DockPanel {
                        TextBlock
                            [ DockPanel.Dock = Top,
                              Text           = "Format Shape",
                              FontSize       = 12,
                              FontWeight     = Bold,
                              Foreground     = @OnSurfaceVariant,
                              Margin         = (0,0,0,8) ]
                        // HorizontalScrollEnabled = false so the pane is
                        // width-constrained to the viewport (never measured
                        // with +Infinity width for horizontal scroll). Its
                        // content — the empty-state message and the editor
                        // grid — then wraps / fits the pane width instead of
                        // running off one line. A format pane only ever
                        // scrolls vertically.
                        ScrollViewer [ IsAutoHideScrollBars = false,
                                       HorizontalScrollEnabled = false ] {
                            ShapeFormatControl
                                [ Fill              = $nodes.SelectionFormatFill,
                                  Stroke            = $nodes.SelectionFormatStroke,
                                  SourceCapTemplate = $nodes.SelectionFormatSourceCap,
                                  TargetCapTemplate = $nodes.SelectionFormatTargetCap,
                                  SourceCapScale    = $nodes.SelectionFormatSourceCapScale,
                                  TargetCapScale    = $nodes.SelectionFormatTargetCapScale,
                                  ShowCaps          = $nodes.SelectionIsConnector,
                                  CapOptions        = $nodes.ConnectorCapOptions ]
                        }
                    }
                }
                Splitter
                    [ DockPanel.Dock   = Right,
                      Width            = 6,
                      Orientation      = Vertical,
                      ReverseDirection = true ]

                // Drawing area — the framework Diagram's default
                // Template already includes a ScrollViewer wrapping the
                // ItemsPresenter, so no enclosing Border / ScrollViewer
                // is needed here. ItemsSource is bound to Document.Nodes
                // (the flat collection of Figure + Group instances);
                // items are Visuals themselves so
                // GetContainerForItemOverride returns each item
                // unchanged.
                //
                //   DropReceiver = $Self   — relative-source-self
                //     binding: resolves to THIS Diagram (the Visual
                //     where the binding is authored), NOT to
                //     DataContext.Self. The Diagram-internal
                //     ScrollViewer is on the bubble path of every
                //     canvas drop, so the Diagram is the right
                //     receiver.
                //   Mutator        — NOT bound in markup. The Diagram
                //     auto-wires Mutator from DataContext when the DC
                //     structurally implements DiagramMutator (Group /
                //     Ungroup / CombineSelection / DeleteNodes /
                //     CreateNode all defined). DiagramDocument satisfies
                //     that surface, so the doc becomes the structural
                //     mutator without an extra binding line.
                Diagram x:name="nodes"
                    [ ItemsSource                  = $Nodes,
                      Connectors                   = $Connectors,
                      ItemsPanel                   = @DiagramCanvasPanel,
                      SelectionMode                = Extended,
                      AllowMarqueeSelection        = true,
                      AlignmentGuidesEnabled       = true,
                      SelectionResizeEnabled       = true,
                      ConnectorInteractionsEnabled = true,
                      ReflectSelectionToItems      = true,
                      DropReceiver                 = $Self,
                      Focusable                    = true ]
            }
        }
    }
}
