// VM type references — every [DataType=…] below must be backed by an
// import so the compiler emits a real Function key, not a string.
import DiagramVM       from "./diagram-vm.mjs"
import RectNodeVM      from "./diagram-vm.mjs"
import EllipseNodeVM   from "./diagram-vm.mjs"
import NoteNodeVM      from "./diagram-vm.mjs"
import ToolboxShapeVM  from "./diagram-vm.mjs"

// diagram.mu — node-only Visio-/drawio-style scene. The container is a
// DiagramNode (custom ContentControl) — DiagramNode bakes drag-to-move
// AND click-to-select (via Selector.HandleContainerClick) into the
// control itself, so no per-node behavior wiring is needed. Position
// rides through TwoWay bindings on DiagramNode.X / Y (both DPs are
// flagged BindsTwoWayByDefault), so a drag mutates the VM's NodeVM.X /
// Y directly through the ItemContainerStyle.
//
// Diagram is a Selector (subclass), so:
//   * SelectionMode=Extended enables Ctrl-click toggle / Shift-click
//     range / plain-click replace.
//   * AllowMarqueeSelection=true wires the framework's rubber-band
//     behavior on the items panel — drag on empty area selects
//     intersecting nodes; click on empty area clears (Explorer parity).
//   * Per-NodeVM IsSelected stays the chrome trigger source — the
//     bootstrap mirrors Selector.SelectedItems → NodeVM.IsSelected on
//     SelectionChanged, so the existing `when($IsSelected)` triggers
//     keep working without per-shape template changes.

ResourceDictionary {

    // ── Per-node container style ────────────────────────────────────
    //
    // The Diagram ItemsControl materializes a DiagramNode per item;
    // this Style runs on each materialized DiagramNode. X / Y are
    // BindsTwoWayByDefault so the `$X` / `$Y` bindings flow drag-time
    // mutations back to the bound NodeVM. No PointerDown trigger here —
    // DiagramNode.OnPointerUp dispatches to Selector.HandleContainerClick
    // directly when the gesture didn't cross the drag threshold.
    Style x:key="DiagramNodeStyle" [TargetType=DiagramNode] {
        X = $X;
        Y = $Y;
    }

    // ── Shared Canvas ItemsPanel ────────────────────────────────────
    ItemsPanelTemplate x:key="DiagramCanvasPanel" 
    {
        Canvas
    }

    // ── Vertical StackPanel used by the toolbox ItemsControl ────────
    ItemsPanelTemplate x:key="DiagramToolboxPanel" 
    {
        StackPanel
    }

    // ── Default chrome styles per shape kind ─────────────────────────
    Style x:key="DiagramRectChromeStyle" [TargetType=Border] {
        BorderBrush = #1d4ed8;
    }
    Style x:key="DiagramNoteChromeStyle" [TargetType=Border] {
        BorderBrush = #a16207;
    }
    Style x:key="DiagramEllipseChromeStyle" [TargetType=Ellipse] {
        Stroke = #15803d;
    }

    // ── Toolbox tile template ───────────────────────────────────────
    DataTemplate x:key="DiagramTileTemplate" [DataType=ToolboxShapeVM] {
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

    // ── Per-shape DataTemplates — no ports, no edges ────────────────
    DataTemplate [DataType=RectNodeVM] {
        Border x:name="chrome"
              [Style=@DiagramRectChromeStyle,
               Width=130, Height=60,
               Background=$FillBrush,
               BorderThickness=(1.5), CornerRadius=4]{
            TextBlock [Text=$LabelText, FontSize=13,
                       Foreground=#1f2937,
                       HorizontalAlignment=Center,
                       VerticalAlignment=Center]
        }
        when( $IsSelected ){
            chrome.BorderBrush = #f97316;
        }
    }

    DataTemplate [DataType=EllipseNodeVM] {
        Canvas x:root [Width=130, Height=60]{
            Ellipse x:name="chrome"
                   [Style=@DiagramEllipseChromeStyle,
                    Width=130, Height=60,
                    Fill=$FillBrush,
                    StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=130, Height=60,
                       Text=$LabelText, FontSize=13,
                       Foreground=#1f2937,
                       HorizontalAlignment=Center,
                       VerticalAlignment=Center]
        }
        when( $IsSelected ){
            chrome.Stroke = #f97316;
        }
    }

    DataTemplate [DataType=NoteNodeVM] {
        Border x:name="chrome"
              [Style=@DiagramNoteChromeStyle,
               Width=130, Height=60,
               Background=$FillBrush,
               BorderThickness=(1.5), CornerRadius=2]{
            TextBlock [Text=$LabelText, FontSize=13,
                       Foreground=#1f2937,
                       HorizontalAlignment=Center,
                       VerticalAlignment=Center]
        }
        when( $IsSelected ){
            chrome.BorderBrush = #f97316;
        }
    }

    // ── Diagram shell ───────────────────────────────────────────────
    DataTemplate x:key="DiagramTemplate" [DataType=DiagramVM] {
        Border x:root [Background=#ffffff, BorderBrush=#e2e8f0,
                       BorderThickness=(1)]{
            DockPanel {

                // Header strip.
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
                // bound through DiagramTileTemplate. Drag a tile onto
                // the canvas to place a new node.
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
                        TextBlock[Text="Drag a shape onto the canvas to
                                        place it. Click a node to
                                        select; Ctrl-click to toggle;
                                        Shift-click to range-extend.
                                        Drag-rectangle on empty space
                                        for marquee. Click empty space
                                        to clear. Drag a node to move.
                                        Delete removes every selected
                                        node.",
                                  TextWrapping=Wrap,
                                  FontSize=10, Foreground=#6b7280,
                                  Margin=(2,16,2,0)]
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
                Border x:name="surface" [Background=#f1f5f9]
                {
                    Diagram x:name="nodes"
                           [ItemsSource = $Nodes,
                            ItemsPanel = @DiagramCanvasPanel,
                            ItemContainerStyle = @DiagramNodeStyle,
                            SelectionMode = Extended,
                            AllowMarqueeSelection = true]
                }
            }
        }
    }
}
