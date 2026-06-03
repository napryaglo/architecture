// diagram.mu — Visio-/drawio-style diagrammer shell.
//
// Layout: a single DockPanel with three regions.
//
//   * Top    — header strip (24px) with the title.
//   * Left   — toolbox strip (140px) listing the shape templates the
//              user can drag onto the canvas. Each tile is named
//              `tool-<kind>` so the host can wire PointerDown on it.
//   * Fill   — drawing area, a Border framing a Canvas (`x:name="canvas"`)
//              where nodes (Border / Ellipse children) live at
//              Canvas.Left / Canvas.Top, alongside connector Lines.
//
// All interactivity is host-side (see demos/diagram.mjs):
//   * Toolbox tile PointerDown  → create a node under the pointer and
//                                 drag-place it onto the canvas.
//   * Canvas-node PointerDown    → grab + drag to reposition.
//   * Canvas-node hover          → host shows 4 port handles on the
//                                 node. PointerDown on a port begins
//                                 a connector-create gesture; release
//                                 over another node wires the edge.
//
// The shell stays markup; the interaction lives in JS because each
// gesture spans many Visuals + needs pointer capture.

Application{
    resources: {
        @paper     = #ffffff
        @ink       = #1f2937
        @hint      = #6b7280
        @hairline  = #e2e8f0
        @primary   = #1976d2
        @primaryInk= #ffffff
        @grid      = #f1f5f9
        @tile      = #f8fafc
        @tileHover = #eef2f7

        Border x:root [Background=@paper, BorderBrush=@hairline,
                       BorderThickness=(1)]{
            DockPanel {

                // ── Header strip ─────────────────────────────────
                Border[DockPanel.Dock=Top, Height=44,
                       Background=@primary]{
                    StackPanel[Orientation=Horizontal,
                               Margin=(16,10,0,0)]{
                        TextBlock[Text="Diagrammer",
                                  FontSize=15, FontWeight=Bold,
                                  Foreground=@primaryInk]
                        TextBlock x:name="status"
                                 [Text="drag a shape from the toolbox →",
                                  FontSize=12,
                                  Foreground=@primaryInk,
                                  Margin=(20,3,0,0)]
                    }
                }

                // ── Toolbox strip (left) ────────────────────────
                // The actual tile list is an ItemsControl bound to a
                // data array of shape templates (see diagram.mjs). Each
                // tile's outer chrome comes from an ItemContainerStyle;
                // its inner content (swatch + label) comes from the
                // DataTemplate. Adding a new shape kind is a one-line
                // push into the `shapes` array — no markup edit needed.
                Border[DockPanel.Dock=Left, Width=140,
                       Background=@tile,
                       BorderBrush=@hairline,
                       BorderThickness=(0,0,1,0),
                       Padding=(12)]{
                    StackPanel{
                        TextBlock[Text="Shapes",
                                  FontSize=11, FontWeight=Bold,
                                  Foreground=@hint,
                                  Margin=(2,0,0,8)]

                        ItemsControl x:name="toolbox"

                        TextBlock[Text="Drag onto the canvas. Click a
                                        node to select it; drag to move.
                                        Hover to reveal connection ports
                                        — drag a port to another node to
                                        wire them.",
                                  TextWrapping=Wrap,
                                  FontSize=10, Foreground=@hint,
                                  Margin=(2,16,2,0)]
                    }
                }

                // ── Drawing area (LastChildFill) ─────────────────
                // Inner Border supplies the grid backdrop; the Canvas
                // inside is where nodes + connectors mount. Naming the
                // Border so the host can subscribe to background clicks
                // (empty Canvas areas don't paint and therefore don't
                // hit-test — the backdrop is the actual click target).
                Border x:name="surface"
                       [Background=@grid]{
                    Canvas x:name="canvas"
                }
            }
        }
    }
}
