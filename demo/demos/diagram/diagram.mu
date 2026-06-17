// VM type references — every [DataType=…] below must be backed by an
// import so the compiler emits a real Function key, not a string.
// The per-Kind shape VMs (RectangleShapeVM, EllipseShapeVM, …) used to
// live here for the shape DataTemplates; those moved with their templates
// to `diagram-shape-templates.mu`. Only the diagrammer-shell VMs need
// imports here now.
import DiagramVM              from "./diagram-vm.mjs"
import ToolboxShapeVM         from "./diagram-vm.mjs"

// diagram.mu — node-only Visio-/drawio-style scene backed by the full
// 35-shape M3 shape library. The toolbox rail enumerates every shape
// (48×48 picture + label below), and dropping any tile onto the canvas
// creates a node of that kind. Per-Kind DataTemplate dispatch paints
// each shape with its actual primitive (Squircle, Pill, Diamond, …)
// rather than a generic Border-with-swatch.
//
// Diagram is a Selector (subclass), so:
//   * SelectionMode=Extended enables Ctrl-click toggle / Shift-click
//     range / plain-click replace.
//   * AllowMarqueeSelection=true wires the framework's rubber-band
//     behavior on the items panel — drag on empty area selects
//     intersecting nodes; click on empty area clears (Explorer parity).
//   * Per-ShapeNodeVM IsSelected stays the chrome trigger source — the
//     bootstrap mirrors Selector.SelectedItems → IsSelected on
//     SelectionChanged, so the existing `when($IsSelected)` triggers
//     keep working without per-shape template changes.

resources DiagramDemo {

    // ── Per-node container style ────────────────────────────────────
    Style x:key="DiagramNodeStyle" [TargetType=DiagramNode] {
        X = $X;
        Y = $Y;
    }

    // ── Shared Canvas ItemsPanel ────────────────────────────────────
    //
    // Canvas.MeasureOverride returns the union bounding box of its
    // children — so the canvas extent grows automatically as nodes are
    // moved / dropped past the previous bounds. The surrounding
    // ScrollViewer's scrollable extent tracks that growth because
    // Canvas.Left / Canvas.Top are flagged Measure | Arrange (see
    // src/basic/panels/canvas.ts); a position change cascades the
    // child's InvalidateMeasure up to the Canvas itself, the new
    // DesiredSize bubbles up to the ScrollViewer, and a new scrollbar
    // thumb extent is published in the same layout pass.
    ItemsPanelTemplate x:key="DiagramCanvasPanel"
    {
        PaginatedCanvas [PageWidth=800, PageHeight=600]
    }

    // ── Toolbox ItemsPanel — 2-column UniformGrid so 35 tiles fit in
    // a reasonable vertical footprint inside the 140-wide rail.
    ItemsPanelTemplate x:key="DiagramToolboxPanel"
    {
        UniformGrid [Columns=2]
    }

    // ── Toolbox tile template ───────────────────────────────────────
    //
    // ONE tile template — the picture is rendered by a ContentControl
    // hosting the ToolboxShapeVM's PreviewNode (a per-Kind ShapeNodeVM
    // sized at 48×48). The ContentControl dispatches by PreviewNode's
    // DataType, picking the matching per-Kind shape DataTemplate below.
    // That keeps the tile generic — adding a new shape Kind only needs
    // one new DataTemplate, not a new tile.
    DataTemplate x:key="DiagramTileTemplate" [DataType=ToolboxShapeVM] {
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

    // ── Per-Kind canvas DataTemplates ────────────────────────────────
    //
    // Extracted into `diagram-shape-templates.mu` (the
    // `DiagramShapeTemplates` resource dictionary) so diagram.mu stays
    // focused on the diagrammer shell. The bundle is merged into
    // Application.Resources by diagram.mjs alongside `DiagramDemo`.


    // ── Diagram shell ───────────────────────────────────────────────
    DataTemplate x:key="DiagramTemplate" [DataType=DiagramVM] {
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

                // Align / Distribute toolbar — PowerPoint-style strip
                // sitting between the header and the body row. Each
                // button binds to one of the alignment ICommands on the
                // VM; CanExecute gating drives the disabled chrome (a
                // single-shape selection disables all align buttons; <3
                // shapes disables both distribute buttons).
                //
                // Glyphs are Material Symbols Outlined ligatures —
                // matches the icon-font approach FAB uses. Each tile
                // pads the icon to a comfortable 32×32 hit target.
                Border[DockPanel.Dock=Top, Height=48,
                       Background=@SurfaceContainer,
                       BorderBrush=@OutlineVariant,
                       BorderThickness=(0,0,0,1),
                       Padding=(8,4,8,4)]{
                    StackPanel[Orientation=Horizontal]{
                        IconButton x:name="btnAlignLeft"
                                   [Variant=Standard, Command=$AlignLeftCommand]{
                            Icon[Source=@alignLeft, Foreground=@OnSurfaceVariant]
                        }
                        IconButton x:name="btnAlignRight"
                                   [Variant=Standard, Command=$AlignRightCommand]{
                            Icon[Source=@alignRight, Foreground=@OnSurfaceVariant]
                        }
                        IconButton x:name="btnAlignTop"
                                   [Variant=Standard, Command=$AlignTopCommand,
                                    Margin=(8,0,0,0)]{
                            Icon[Source=@alignTop, Foreground=@OnSurfaceVariant]
                        }
                        IconButton x:name="btnAlignMiddle"
                                   [Variant=Standard, Command=$AlignMiddleCommand]{
                            Icon[Source=@alignMiddle, Foreground=@OnSurfaceVariant]
                        }
                        IconButton x:name="btnAlignCenter"
                                   [Variant=Standard, Command=$AlignCenterCommand]{
                            Icon[Source=@alignCenter, Foreground=@OnSurfaceVariant]
                        }
                        IconButton x:name="btnDistH"
                                   [Variant=Standard, Command=$DistributeHorizontalCommand,
                                    Margin=(8,0,0,0)]{
                            Icon[Source=@distributeHorizontal, Foreground=@OnSurfaceVariant]
                        }
                        IconButton x:name="btnDistV"
                                   [Variant=Standard, Command=$DistributeVerticalCommand]{
                            Icon[Source=@distributeVertical, Foreground=@OnSurfaceVariant]
                        }
                        // Ctrl+G / Ctrl+Shift+G also wired via the
                        // KeyDown listener in diagram.mjs. The buttons
                        // mirror those shortcuts onto the toolbar; their
                        // CanExecute gates come straight from the ICommand
                        // so they disable when the selection doesn't fit
                        // (Group needs ≥ 2 top-level entities; Ungroup
                        // needs ≥ 1 selected top-level group).
                        IconButton x:name="btnGroup"
                                   [Variant=Standard, Command=$GroupCommand,
                                    Margin=(8,0,0,0)]{
                            Icon[Source=@group, Foreground=@OnSurfaceVariant]
                        }
                        IconButton x:name="btnUngroup"
                                   [Variant=Standard, Command=$UngroupCommand]{
                            Icon[Source=@ungroup, Foreground=@OnSurfaceVariant]
                        }
                    }
                }

                // Toolbox strip — ToolboxShapes drives an ItemsControl
                // bound through DiagramTileTemplate. ScrollViewer
                // accommodates the 35 tiles in the 2-column rail.
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
                                Button x:name="btnSave"
                                       [Command=$SaveCommand,
                                        Margin=(0,0,4,0)]{
                                    TextBlock[Text="Save", FontSize=11]
                                }
                                Button x:name="btnLoad"
                                       [Command=$LoadCommand]{
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
                            ItemsControl x:name="toolbox"
                                        [ItemsSource=$ToolboxShapes,
                                         ItemsPanel=@DiagramToolboxPanel]
                        }
                    }
                }

                // Drawing area — the Diagram fills the surface Border
                // directly. Its ItemsPanel is a Canvas, so DiagramNode
                // containers position themselves via Canvas.Left /
                // Canvas.Top (DiagramNode mirrors X / Y onto those
                // attached properties on each write).
                //
                // Selection wiring is declarative:
                //   * SelectionMode=Extended      — Ctrl-/Shift-click on nodes work as expected.
                //   * AllowMarqueeSelection=true  — rubber-band on the empty Canvas surface;
                //                                    plain click on empty area clears.
                //   * MarqueeBoundsPolicy=Intersect (default) — Explorer-style "touch to
                //                                    include" rather than Finder's "must enclose".
                // ScrollViewer-wrapped surface — the Canvas ItemsPanel's
                // MeasureOverride returns the union bounding box of every
                // child (max Canvas.Left + Width, max Canvas.Top + Height),
                // so dragging a node off the visible viewport (or dropping
                // one beyond the rail) grows the scrollable extent rather
                // than clipping it. `IsAutoHideScrollBars=false` keeps the
                // bars visible whenever there's overflow — handy on a
                // canvas where the user needs to know the surface extends
                // beyond what they see.
                Border x:name="surface"
                {
                    ScrollViewer x:name="scroll" [IsAutoHideScrollBars=false]{
                        Diagram x:name="nodes"
                               [ItemsSource = $Nodes,
                                ItemsPanel = @DiagramCanvasPanel,
                                ItemContainerStyle = @DiagramNodeStyle,
                                SelectionMode = Extended,
                                AllowMarqueeSelection = true,
                                Focusable = true]
                    }
                }
            }
        }
    }
}
