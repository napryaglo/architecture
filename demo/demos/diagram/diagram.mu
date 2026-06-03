// diagram.mu — Visio-/drawio-style diagrammer shell.
//
// Layout: a single DockPanel with three regions.
//
//   * Top    — header strip (44px) with the title.
//   * Left   — toolbox strip (140px) listing the shape templates the
//              user can drag onto the canvas; an ItemsControl bound by
//              the VM to an array of shape templates.
//   * Fill   — drawing area, a Border framing a Canvas (`x:name="canvas"`)
//              where nodes (Border / Ellipse children) live at
//              Canvas.Left / Canvas.Top, alongside connector Lines.
//
// All interactivity lives on DiagramVM.OnViewMounted — toolbox tile
// drag-to-create, canvas-node drag-to-move, port drag-to-connect,
// keyboard delete, Save / Load to localStorage.
//
// Packaged as a DataTemplate keyed off DiagramVM.

ResourceDictionary {
    datatemplate x:key="DiagramTemplate" [datatype=DiagramVM] {
        Border x:root [Background=#ffffff, BorderBrush=#e2e8f0,
                       BorderThickness=(1)]{
            DockPanel {

                // ── Header strip ─────────────────────────────────
                Border[DockPanel.Dock=Top, Height=44,
                       Background=#1976d2]{
                    StackPanel[Orientation=Horizontal,
                               Margin=(16,10,0,0)]{
                        TextBlock[Text="Diagrammer",
                                  FontSize=15, FontWeight=Bold,
                                  Foreground=#ffffff]
                        TextBlock x:name="status"
                                 [Text="drag a shape from the toolbox →",
                                  FontSize=12,
                                  Foreground=#ffffff,
                                  Margin=(20,3,0,0)]
                    }
                }

                // ── Toolbox strip (left) ────────────────────────
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

                        TextBlock[Text="Document",
                                  FontSize=11, FontWeight=Bold,
                                  Foreground=#6b7280,
                                  Margin=(2,12,0,8)]
                        StackPanel[Orientation=Horizontal,
                                   Margin=(0,0,0,8)]{
                            Button x:name="btnSave"
                                   [Margin=(0,0,4,0)]{
                                TextBlock[Text="Save", FontSize=11]
                            }
                            Button x:name="btnLoad"{
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

                // ── Drawing area (LastChildFill) ─────────────────
                Border x:name="surface"
                       [Background=#f1f5f9]{
                    Canvas x:name="canvas"
                }
            }
        }
    }
}
