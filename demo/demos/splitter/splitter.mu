import SplitterVM from "./splitter-vm.mjs"

// splitter.mu — standalone Splitter showcase.
//
// Two shapes:
//   * VERTICAL splitter in a horizontal StackPanel — drag horizontally
//     resizes the previous sibling's Width.
//   * HORIZONTAL splitter in a DockPanel — drag vertically resizes the
//     previous sibling's Height.
//
// GridSplitter (the WPF-parity sibling control for Grid cells) ships
// alongside but isn't shown here because the compiler doesn't yet
// support the `ColumnDefinitions { … }` collection-child syntax in
// markup — see backlog 5.x. GridSplitter is fully covered by the
// grid-splitter.test.ts suite.

ResourceDictionary {

    DataTemplate x:key="SplitterTemplate" [DataType=SplitterVM] {
        Border [Background=#ffffff, BorderBrush=#e2e8f0, BorderThickness=(1)] {

            DockPanel {

                // Header strip.
                Border [DockPanel.Dock=Top,
                        Background=#1976d2, Padding=(16,12,16,12)] {
                    StackPanel [Orientation=Vertical] {
                        TextBlock [Text="Splitter demo — standalone draggable bar",
                                   FontSize=15, FontWeight=Bold,
                                   Foreground=#ffffff]
                        TextBlock [Text="Drag the gray bars to resize. ArrowLeft / ArrowRight (or Up / Down) nudge by 10px when focused.",
                                   FontSize=11, Foreground=#cbd5e1,
                                   Margin=(0,4,0,0)]
                    }
                }

                StackPanel [Orientation=Vertical, Margin=(16)] {

                    // ── VERTICAL splitter — horizontal-axis resize ────
                    TextBlock [Text="Vertical Splitter — horizontal StackPanel sibling resize",
                               FontSize=12, FontWeight=Bold,
                               Margin=(0,8,0,8)]
                    Border [Height=140, BorderBrush=#cbd5e1, BorderThickness=(1)] {
                        StackPanel [Orientation=Horizontal] {
                            Border [Width=200, Height=138, Background=#dbeafe] {
                                TextBlock [Text="Width=200",
                                           FontSize=14, FontWeight=Bold,
                                           HorizontalAlignment=Center,
                                           VerticalAlignment=Center,
                                           Foreground=#1e3a8a]
                            }
                            Splitter [Width=8, Height=138]
                            Border [Width=300, Height=138, Background=#e0f2fe] {
                                TextBlock [Text="Width=300 — drag the gray bar to resize the LEFT pane",
                                           FontSize=13,
                                           HorizontalAlignment=Center,
                                           VerticalAlignment=Center,
                                           Foreground=#075985,
                                           TextWrapping=Wrap]
                            }
                        }
                    }

                    // ── HORIZONTAL splitter — vertical-axis resize ────
                    TextBlock [Text="Horizontal Splitter — DockPanel top-sibling resize",
                               FontSize=12, FontWeight=Bold,
                               Margin=(0,24,0,8)]
                    Border [Height=260, BorderBrush=#cbd5e1, BorderThickness=(1)] {
                        DockPanel {
                            Border [DockPanel.Dock=Top, Height=80, Background=#dcfce7] {
                                TextBlock [Text="Height=80",
                                           FontSize=14, FontWeight=Bold,
                                           HorizontalAlignment=Center,
                                           VerticalAlignment=Center,
                                           Foreground=#166534]
                            }
                            Splitter [DockPanel.Dock=Top,
                                      Orientation=Horizontal,
                                      Height=8]
                            Border [Background=#bbf7d0] {
                                TextBlock [Text="Drag the gray bar to resize the TOP pane.",
                                           FontSize=13,
                                           HorizontalAlignment=Center,
                                           VerticalAlignment=Center,
                                           Foreground=#14532d,
                                           TextWrapping=Wrap]
                            }
                        }
                    }
                }
            }
        }
    }
}
