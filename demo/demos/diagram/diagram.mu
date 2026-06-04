// diagram.mu — Visio-/drawio-style diagrammer, MVVM rewrite.
//
// Layout: a single DockPanel with three regions (Top header strip,
// Left toolbox strip, LastChildFill drawing area).
//
// The drawing area is a Canvas hosting two stacked ItemsControls —
// edges below, nodes above. Each uses Canvas as its ItemsPanel; the
// node container's Canvas.Left / Canvas.Top come from a bound
// ItemContainerStyle (`@DiagramNodeContainerStyle`), so a node moves
// on the canvas simply by mutating NodeVM.X / Y on the VM. Edges
// position themselves through Line.X1/Y1/X2/Y2 bindings on EdgeVM.
//
// Per-shape DataTemplates (`@DiagramRectTemplate`,
// `@DiagramEllipseTemplate`, `@DiagramNoteTemplate`) carry the shape
// chrome and four ports. The VM's ItemTemplateSelector dispatches by
// NodeVM.Kind.

ResourceDictionary {

    // ── Per-node container style ────────────────────────────────────
    //
    // Applied by the nodes ItemsControl to each generated container
    // (a ContentPresenter). The presenter's DataContext is set to the
    // item (NodeVM) at content-resolve time, so $X / $Y resolve to
    // NodeVM.X / Y here.
    //
    // Drag source: IsDraggable + OnDragStart turn each container into
    // a declarative drag source for body-move. The framework's 4px
    // threshold latch keeps a tap from accidentally starting a drag.
    // Click-to-select rides PointerDown via InvokeCommand — both
    // listeners run alongside the latch.
    Style x:key="DiagramNodeContainerStyle" [targettype=ContentPresenter] {
        Canvas.Left = $X;
        Canvas.Top  = $Y;
        IsDraggable = true;
        OnDragStart = $BeginMoveDragData;
        on PointerDown { InvokeCommand[Command=$SelectNodeCommand] }
    }

    // ── Shared Canvas-as-ItemsPanel for both edges and nodes ────────
    ItemsPanelTemplate x:key="DiagramCanvasPanel" {
        Canvas
    }

    // ── Vertical StackPanel used by the toolbox ItemsControl ────────
    ItemsPanelTemplate x:key="DiagramToolboxPanel" {
        StackPanel
    }

    // ── Default chrome styles per shape kind ─────────────────────────
    //
    // The shape DataTemplates apply these to their chrome element so
    // the per-shape default BorderBrush / Stroke sits at the Style
    // tier. That leaves the Trigger tier free for the `when($IsSelected)`
    // setters at the bottom of each template — Trigger > Style, so
    // selection re-skinning takes effect without LocalValue inline
    // attributes shadowing it.
    Style x:key="DiagramRectChromeStyle" [targettype=Border] {
        BorderBrush = #1d4ed8;
    }
    Style x:key="DiagramNoteChromeStyle" [targettype=Border] {
        BorderBrush = #a16207;
    }
    Style x:key="DiagramEllipseChromeStyle" [targettype=Ellipse] {
        Stroke = #15803d;
    }

    // ── Toolbox tile template ───────────────────────────────────────
    //
    // IsDraggable + OnDragStart turn each tile into a declarative drag
    // source. The bound BeginKindDragData on ToolboxShapeVM returns the
    // {data, effects} payload at trip time.
    DataTemplate x:key="DiagramTileTemplate" [datatype=ToolboxShapeVM] {
        Border x:root [IsDraggable=true, OnDragStart=$BeginKindDragData,
                       Background=#ffffff, BorderBrush=#e2e8f0,
                       BorderThickness=(1), Padding=(8),
                       Margin=(0,0,0,8)]{
            StackPanel [Orientation=Horizontal]{
                Border [Width=28, Height=18, Background=$Swatch,
                        Margin=(0,4,8,0)]
                TextBlock [Text=$Label, FontSize=12,
                           Foreground=#1f2937, Margin=(0,6,0,0)]
            }
        }
    }

    // ── Rectangle shape template ───────────────────────────────────
    //
    // Selection highlight rides through the DataTemplate's `when($IsSelected)`
    // trigger at the bottom of the template body. Default border colour
    // is hardcoded; the trigger overrides BorderBrush at the Trigger
    // priority tier when NodeVM.IsSelected flips true.
    DataTemplate x:key="DiagramRectTemplate" [datatype=NodeVM] {
        Canvas x:root [Width=130, Height=60]{
            Border x:name="chrome"
                  [Style=@DiagramRectChromeStyle,
                   Width=130, Height=60,
                   Background=$FillBrush,
                   BorderThickness=(1.5), CornerRadius=(4)]{
                TextBlock [Text=$LabelText, FontSize=13,
                           Foreground=#1f2937,
                           HorizontalAlignment=center,
                           VerticalAlignment=center]
            }
            // Four ports — VM wires PointerEnter/Leave/Down handlers
            // after the container is realized. Visibility lives on the
            // VM side (idle brushes are cleared / restored).
            Border x:name="port0" [Canvas.Left=58, Canvas.Top=-7,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot0" [Width=10, Height=10]
            }
            Border x:name="port1" [Canvas.Left=123, Canvas.Top=23,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot1" [Width=10, Height=10]
            }
            Border x:name="port2" [Canvas.Left=58, Canvas.Top=53,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot2" [Width=10, Height=10]
            }
            Border x:name="port3" [Canvas.Left=-7, Canvas.Top=23,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot3" [Width=10, Height=10]
            }
        }
        when( $IsSelected ){
            chrome.BorderBrush = #f97316;
        }
    }

    // ── Ellipse shape template ─────────────────────────────────────
    DataTemplate x:key="DiagramEllipseTemplate" [datatype=NodeVM] {
        Canvas x:root [Width=130, Height=60]{
            Ellipse x:name="chrome"
                   [Style=@DiagramEllipseChromeStyle,
                    Width=130, Height=60,
                    Fill=$FillBrush,
                    StrokeThickness=(1.5)]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=130, Height=60,
                       Text=$LabelText, FontSize=13,
                       Foreground=#1f2937,
                       HorizontalAlignment=center,
                       VerticalAlignment=center]
            Border x:name="port0" [Canvas.Left=58, Canvas.Top=-7,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot0" [Width=10, Height=10]
            }
            Border x:name="port1" [Canvas.Left=123, Canvas.Top=23,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot1" [Width=10, Height=10]
            }
            Border x:name="port2" [Canvas.Left=58, Canvas.Top=53,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot2" [Width=10, Height=10]
            }
            Border x:name="port3" [Canvas.Left=-7, Canvas.Top=23,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot3" [Width=10, Height=10]
            }
        }
        when( $IsSelected ){
            chrome.Stroke = #f97316;
        }
    }

    // ── Note shape template ────────────────────────────────────────
    DataTemplate x:key="DiagramNoteTemplate" [datatype=NodeVM] {
        Canvas x:root [Width=130, Height=60]{
            Border x:name="chrome"
                  [Style=@DiagramNoteChromeStyle,
                   Width=130, Height=60,
                   Background=$FillBrush,
                   BorderThickness=(1.5), CornerRadius=(2)]{
                TextBlock [Text=$LabelText, FontSize=13,
                           Foreground=#1f2937,
                           HorizontalAlignment=center,
                           VerticalAlignment=center]
            }
            Border x:name="port0" [Canvas.Left=58, Canvas.Top=-7,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot0" [Width=10, Height=10]
            }
            Border x:name="port1" [Canvas.Left=123, Canvas.Top=23,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot1" [Width=10, Height=10]
            }
            Border x:name="port2" [Canvas.Left=58, Canvas.Top=53,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot2" [Width=10, Height=10]
            }
            Border x:name="port3" [Canvas.Left=-7, Canvas.Top=23,
                                   Width=14, Height=14,
                                   CornerRadius=(7), BorderThickness=(2)]{
                Ellipse x:name="dot3" [Width=10, Height=10]
            }
        }
        when( $IsSelected ){
            chrome.BorderBrush = #f97316;
        }
    }

    // ── Edge template ───────────────────────────────────────────────
    //
    // A single Line bound to EdgeVM.X1..Y2. The Line lives at Canvas.Left=0,
    // Canvas.Top=0 inside the edges-Canvas — coordinates are taken from
    // X1/Y1/X2/Y2 in the same coordinate space the nodes live in.
    DataTemplate x:key="DiagramEdgeTemplate" [datatype=EdgeVM] {
        Line [Stroke=$Stroke, StrokeThickness=$StrokeThickness,
              X1=$X1, Y1=$Y1, X2=$X2, Y2=$Y2]
    }

    // ── Diagram shell ───────────────────────────────────────────────
    DataTemplate x:key="DiagramTemplate" [datatype=DiagramVM] {
        Border x:root [Background=#ffffff, BorderBrush=#e2e8f0,
                       BorderThickness=(1)]{
            DockPanel {

                // Header strip — Status text is bound so VM updates
                // ($Status) flow into the header without any imperative
                // FindName.
                Border[DockPanel.Dock=Top, Height=44,
                       Background=#1976d2]{
                    StackPanel[Orientation=Horizontal,
                               Margin=(16,10,0,0)]{
                        TextBlock[Text="Diagrammer",
                                  FontSize=15, FontWeight=Bold,
                                  Foreground=#ffffff]
                        TextBlock[Text=$Status,
                                  FontSize=12,
                                  Foreground=#ffffff,
                                  Margin=(20,3,0,0)]
                    }
                }

                // Toolbox strip — ToolboxShapes drives an ItemsControl
                // bound through DiagramTileTemplate. VM wires per-tile
                // PointerDown handlers after materialization.
                Border[DockPanel.Dock=Left, Width=140,
                       Background=#f8fafc,
                       BorderBrush=#e2e8f0,
                       BorderThickness=(0,0,1,0),
                       Padding=(12)]{
                    StackPanel{
                        TextBlock[Text="Shapes",
                                  FontSize=11, FontWeight=Bold,
                                  Foreground=#6b7280,
                                  Margin=(2,0,0,8)]
                        ItemsControl x:name="toolbox"
                                    [ItemsSource=$ToolboxShapes,
                                     ItemsPanel=@DiagramToolboxPanel]
                        TextBlock[Text="Document",
                                  FontSize=11, FontWeight=Bold,
                                  Foreground=#6b7280,
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
                        TextBlock[Text="Drag onto the canvas. Click a
                                        node to select it; drag to move.
                                        Hover to reveal connection ports
                                        — drag a port to another node to
                                        wire them. Press Delete to remove
                                        the selected node and its edges.
                                        Save / Load persist to local
                                        storage.",
                                  TextWrapping=Wrap,
                                  FontSize=10, Foreground=#6b7280,
                                  Margin=(2,16,2,0)]
                    }
                }

                // Drawing area. The outer Canvas (`canvas`) owns the
                // gesture handlers; the two ItemsControls overlay at
                // (0,0) and render edges below nodes.
                Border x:name="surface"
                       [Background=#f1f5f9]{
                    Canvas x:name="canvas"{
                        ItemsControl x:name="edges"
                                    [ItemsSource=$Edges,
                                     ItemsPanel=@DiagramCanvasPanel]
                        ItemsControl x:name="nodes"
                                    [ItemsSource=$Nodes,
                                     ItemsPanel=@DiagramCanvasPanel,
                                     ItemContainerStyle=@DiagramNodeContainerStyle]
                    }
                }
            }
        }
    }
}
