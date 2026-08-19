import PenEditorDemoVM from "./pen-editor-vm.mjs"

// pen-editor.mu — standalone demo for the PowerPoint-style inline Pen
// editor. Layout:
//   * Header at top.
//   * Main row split: left column = PenEditor panel; right column =
//     live preview Shape with its Stroke bound to the same Pen the
//     editor edits. The preview is intentionally a single Ellipse so
//     the chosen Brush / DashStyle / LineCap / LineJoin all read
//     against an unfussy outline.
//   * Footer status strip reads the live Pen values via the VM's
//     mirror DPs.

resources PenEditorDemo {
    DataTemplate [DataType = PenEditorDemoVM] {
        Border x:root [ Fill = @Surface ] {
            DockPanel {
                // ── Header ────────────────────────────────────────
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (20,14,20,14) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "PowerPoint-style Pen editor",
                              FontSize   = 18,
                              FontWeight = Bold,
                              Foreground = @OnPrimary ]
                        TextBlock
                            [ Text       = "Inline panel: brush + thickness + dash + cap + join + miter. Edits push live onto the preview Pen.",
                              FontSize   = 12,
                              Foreground = @OnPrimary,
                              Margin     = (0,4,0,0) ]
                    }
                }

                // ── Status strip ──────────────────────────────────
                Border
                    [ DockPanel.Dock  = Bottom,
                      Fill      = @SurfaceContainerLow,
                      Stroke     = Pen [ Brush = @OutlineVariant ],
                      BorderThickness = (0,1,0,0),
                      Padding         = (20,10,20,10) ] {
                    StackPanel [ Orientation = Horizontal ] {
                        TextBlock
                            [ Text       = $BrushSummary,
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,0,16,0) ]
                        TextBlock
                            [ Text       = $ThicknessReadout,
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,0,16,0) ]
                        TextBlock
                            [ Text       = $DashReadout,
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,0,16,0) ]
                        TextBlock
                            [ Text       = $CapReadout,
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,0,16,0) ]
                        TextBlock
                            [ Text       = $JoinReadout,
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,0,16,0) ]
                        TextBlock
                            [ Text       = $MiterReadout,
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant ]
                    }
                }

                // ── Body ──────────────────────────────────────────
                Border [ Fill = @SurfaceContainerLowest, Padding = (20,20,20,20) ] {
                    StackPanel [ Orientation = Horizontal ] {
                        // Left column — the editor.
                        Border
                            [ Width           = 320,
                              Padding         = (16,16,16,16),
                              Fill      = @SurfaceContainerLow,
                              Stroke     = Pen [ Brush = @OutlineVariant ],
                              BorderThickness = (1),
                              CornerRadius    = 8,
                              Margin          = (0,0,20,0) ] {
                            StackPanel [ Orientation = Vertical ] {
                                TextBlock
                                    [ Text       = "Pen",
                                      FontSize   = 14,
                                      FontWeight = Bold,
                                      Foreground = @OnSurface,
                                      Margin     = (0,0,0,12) ]
                                PenEditor [ Pen = $Pen ]
                            }
                        }

                        // Right column — the live preview surface. A
                        // single Ellipse with the bound Pen on its
                        // Stroke; a translucent Fill so the stroke
                        // reads against the background tint, not
                        // against a solid blob.
                        Border
                            [ Width           = 520,
                              Height          = 420,
                              Padding         = (20),
                              Fill      = @SurfaceContainer,
                              Stroke     = Pen [ Brush = @OutlineVariant ],
                              BorderThickness = (1),
                              CornerRadius    = 8 ] {
                            Ellipse [ Width = 480, Height = 380, Stroke = $Pen ]
                        }
                    }
                }
            }
        }
    }
}
