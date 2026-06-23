// diagram.mu — node-only Visio-/drawio-style scene backed by the
// framework's DiagramDocument. Items inside the canvas ARE Figure /
// Group instances directly (no data/visual split, no DataTemplate
// dispatch for items). The toolbox rail enumerates ToolboxShape
// instances; dropping a tile onto the canvas calls the Document's
// CreateNode method through the Mutator wiring.

resources DiagramDemo {

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
    ItemsPanelTemplate x:key="DiagramCanvasPanel"
    {
        PaginatedCanvas [PageWidth=800, PageHeight=600]
    }

    // ── Toolbox ItemsPanel — 2-column UniformGrid so 35 tiles fit in
    // a reasonable vertical footprint inside the 200-wide rail.
    ItemsPanelTemplate x:key="DiagramToolboxPanel"
    {
        UniformGrid [Columns=2]
    }

    // ── Toolbox tile template ───────────────────────────────────────
    //
    // ONE tile template — the picture is a ContentControl hosting the
    // ToolboxShape's PreviewNode (a per-Kind Figure sized 48×48).
    // ContentControl's Visual-content path slots the Figure directly
    // (no DataTemplate dispatch) and the Figure renders itself.
    DataTemplate x:key="DiagramTileTemplate" [DataType=ToolboxShape] {
        Border x:root [IsDraggable=true, OnDragStart=$BeginKindDragData,
                       Background=@Surface, BorderBrush=@OutlineVariant,
                       BorderThickness=(1), CornerRadius=4,
                       Padding=(4,8,4,8), Margin=(2,0,2,4)]{
            StackPanel [Orientation=Vertical, HorizontalAlignment=Center]{
                ContentControl [Content=$PreviewNode,
                                Width=48, Height=48,
                                HorizontalAlignment=Center]
                TextBlock [Text=$Label, FontSize=10,
                           Foreground=@OnSurface, Margin=(0,4,0,0),
                           HorizontalAlignment=Center]
            }
        }
    }

    // ── Diagram workspace ──────────────────────────────────────────
    DataTemplate x:key="DiagramTemplate" [DataType=DiagramDocument] {
        Border x:root [Background=@Surface, BorderBrush=@OutlineVariant,
                       BorderThickness=(1)]{
            DockPanel {

                // Header strip.
                Border[DockPanel.Dock=Top, Height=44,
                       Background=@Primary]{
                    StackPanel[Orientation=Horizontal,
                               Margin=(16,0,0,0)]{
                        Icon[Source=@home, Foreground=@OnPrimary,
                             VerticalAlignment=Center]
                        TextBlock[Text="Diagrammer",
                                  FontSize=15, FontWeight=Bold,
                                  Foreground=@OnPrimary,
                                  VerticalAlignment=Center,
                                  Margin=(8,0,0,0)]
                        TextBlock[Text=$Status,
                                  FontSize=12,
                                  Foreground=@OnPrimary,
                                  VerticalAlignment=Center,
                                  Margin=(20,0,0,0)]
                    }
                }

                // Align / Distribute / Group / Combine toolbar. Each
                // button binds to one of the framework Diagram's
                // RelayCommands via the named `nodes` x:name forward
                // reference (compiler 2-pass scan resolves it before
                // the Diagram element is constructed in markup).
                Border[DockPanel.Dock=Top, Height=48,
                       Background=@SurfaceContainer,
                       BorderBrush=@OutlineVariant,
                       BorderThickness=(0,0,0,1),
                       Padding=(8,4,8,4)]{
                    StackPanel[Orientation=Horizontal]{
                        IconButton [Variant=Standard, Command=$nodes.AlignLeftCommand]{
                            Icon[Source=@alignLeft, Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.AlignRightCommand]{
                            Icon[Source=@alignRight, Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.AlignTopCommand,
                                    Margin=(8,0,0,0)]{
                            Icon[Source=@alignTop, Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.AlignMiddleCommand]{
                            Icon[Source=@alignMiddle, Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.AlignCenterCommand]{
                            Icon[Source=@alignCenter, Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.DistributeHorizontalCommand,
                                    Margin=(8,0,0,0)]{
                            Icon[Source=@distributeHorizontal, Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.DistributeVerticalCommand]{
                            Icon[Source=@distributeVertical, Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.GroupCommand,
                                    Margin=(8,0,0,0)]{
                            Icon[Source=@group, Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.UngroupCommand]{
                            Icon[Source=@ungroup, Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard,
                                    Command=$nodes.CombineUnionCommand,
                                    Margin=(8,0,0,0)]{
                            TextBlock[Text="∪", FontSize=16, FontWeight=Bold,
                                      Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.CombineIntersectCommand]{
                            TextBlock[Text="∩", FontSize=16, FontWeight=Bold,
                                      Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.CombineSubtractCommand]{
                            TextBlock[Text="−", FontSize=16, FontWeight=Bold,
                                      Foreground=@OnSurfaceVariant]
                        }
                        IconButton [Variant=Standard, Command=$nodes.CombineExcludeCommand]{
                            TextBlock[Text="⊕", FontSize=16, FontWeight=Bold,
                                      Foreground=@OnSurfaceVariant]
                        }
                    }
                }

                // Toolbox strip — Document.ToolboxShapes drives an
                // ItemsControl bound through DiagramTileTemplate.
                Border[DockPanel.Dock=Left, Width=200,
                       Background=@SurfaceContainerLow,
                       BorderBrush=@OutlineVariant,
                       BorderThickness=(0,0,1,0),
                       Padding=(8)]{
                    DockPanel{
                        TextBlock[DockPanel.Dock=Top, Text="Shapes",
                                  FontSize=11, FontWeight=Bold,
                                  Foreground=@OnSurfaceVariant,
                                  Margin=(2,0,0,8)]
                        StackPanel[DockPanel.Dock=Bottom]{
                            TextBlock[Text="Document",
                                      FontSize=11, FontWeight=Bold,
                                      Foreground=@OnSurfaceVariant,
                                      Margin=(2,12,0,8)]
                            StackPanel[Orientation=Horizontal,
                                       Margin=(0,0,0,8)]{
                                Button [Command=$SaveCommand,
                                        Margin=(0,0,4,0)]{
                                    TextBlock[Text="Save", FontSize=11]
                                }
                                Button [Command=$LoadCommand]{
                                    TextBlock[Text="Load", FontSize=11]
                                }
                            }
                            TextBlock[Text="Drag a shape onto the canvas to
                                            place it. Click a node to
                                            select; Ctrl-click to toggle;
                                            Shift-click to range-extend.
                                            Drag-rectangle on empty space
                                            for marquee. Click empty space
                                            to clear. Delete removes every
                                            selected node.",
                                      TextWrapping=Wrap,
                                      FontSize=10, Foreground=@OnSurfaceVariant,
                                      Margin=(2,4,2,0)]
                        }
                        ScrollViewer [IsAutoHideScrollBars=false]{
                            ItemsControl [ItemsSource=$ToolboxShapes,
                                          ItemsPanel=@DiagramToolboxPanel]
                        }
                    }
                }

                // Right-side Format Shape pane — bound to the framework
                // Diagram's SelectionFormatFill / SelectionFormatStroke
                // (the FormatMirror collaborator seeds these from the
                // first selected leaf and broadcasts edits onto every
                // selected leaf).
                Border [DockPanel.Dock=Right, Width=320,
                        Background=@SurfaceContainerLow,
                        BorderBrush=@OutlineVariant,
                        BorderThickness=(1,0,0,0),
                        Padding=(12)]{
                    DockPanel{
                        TextBlock[DockPanel.Dock=Top, Text="Format Shape",
                                  FontSize=12, FontWeight=Bold,
                                  Foreground=@OnSurfaceVariant,
                                  Margin=(0,0,0,8)]
                        ScrollViewer [IsAutoHideScrollBars=false]{
                            ShapeFormatControl [Fill=$nodes.SelectionFormatFill,
                                                Stroke=$nodes.SelectionFormatStroke]
                        }
                    }
                }
                Splitter[DockPanel.Dock=Right, Width=6,
                         Orientation=Vertical,
                         ReverseDirection=true]

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
                       [ItemsSource = $Nodes,
                        Connectors = $Connectors,
                        ItemsPanel = @DiagramCanvasPanel,
                        SelectionMode = Extended,
                        AllowMarqueeSelection = true,
                        AlignmentGuidesEnabled = true,
                        SelectionResizeEnabled = true,
                        ConnectorInteractionsEnabled = true,
                        ReflectSelectionToItems = true,
                        DropReceiver = $Self,
                        Focusable = true]
            }
        }
    }
}
