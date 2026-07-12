import FillEditorDemoVM from "./fill-editor-vm.mjs"

// fill-editor.mu — PowerPoint-style inline fill editor demo. Left
// column = the editor; right column = a preview Shape (Rectangle
// rounded into a square) whose Fill rides on the VM's $Fill DP. A
// thin Pen outline keeps the shape's silhouette readable even when
// Variant=None clears the fill.

resources FillEditorDemo {
    DataTemplate [DataType = FillEditorDemoVM] {
        Border x:root [ Background = @Surface ] {
            DockPanel {
                // ── Header ────────────────────────────────────────
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (20,14,20,14) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "PowerPoint-style Fill editor",
                              FontSize   = 18,
                              FontWeight = Bold,
                              Foreground = @OnPrimary ]
                        TextBlock
                            [ Text       = "Inline panel: None / Solid / Linear / Radial / Pattern / Picture + transparency.",
                              FontSize   = 12,
                              Foreground = @OnPrimary,
                              Margin     = (0,4,0,0) ]
                    }
                }

                // ── Status strip ──────────────────────────────────
                Border
                    [ DockPanel.Dock  = Bottom,
                      Background      = @SurfaceContainerLow,
                      BorderBrush     = @OutlineVariant,
                      BorderThickness = (0,1,0,0),
                      Padding         = (20,10,20,10) ] {
                    TextBlock [ Text = $FillSummary, FontSize = 11, Foreground = @OnSurfaceVariant ]
                }

                // ── Body ──────────────────────────────────────────
                Border [ Background = @SurfaceContainerLowest, Padding = (20,20,20,20) ] {
                    StackPanel [ Orientation = Horizontal ] {
                        // Left column — the editor.
                        Border
                            [ Width           = 380,
                              Padding         = (16,16,16,16),
                              Background      = @SurfaceContainerLow,
                              BorderBrush     = @OutlineVariant,
                              BorderThickness = (1),
                              CornerRadius    = 8,
                              Margin          = (0,0,20,0) ] {
                            StackPanel [ Orientation = Vertical ] {
                                TextBlock
                                    [ Text       = "Fill",
                                      FontSize   = 14,
                                      FontWeight = Bold,
                                      Foreground = @OnSurface,
                                      Margin     = (0,0,0,12) ]
                                FillEditor [ Fill = $Fill ]
                            }
                        }

                        // Right column — live preview. Rectangle so
                        // the fill brush reads against a stable
                        // rectangular bbox (round / heart shapes
                        // distort gradient direction perception).
                        Border
                            [ Width           = 520,
                              Height          = 420,
                              Padding         = (20),
                              Background      = @SurfaceContainer,
                              BorderBrush     = @OutlineVariant,
                              BorderThickness = (1),
                              CornerRadius    = 8 ] {
                            Rectangle
                                [ Width  = 480,
                                  Height = 380,
                                  Fill   = $Fill,
                                  Stroke = $OutlinePen ]
                        }
                    }
                }
            }
        }
    }
}
