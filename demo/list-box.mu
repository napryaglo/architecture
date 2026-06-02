// list-box.mu — ListBox demo: composed-markup rows on the left, a
// counterpart bound to the Items convenience path on the right. Both
// share a single DockPanel header strip.
//
// The platform host wires a SelectionChangedListener on the LEFT list
// after mount and writes its SelectedItem.Tag back into the demo's
// status strip; the RIGHT list runs unwatched as the auto-generation
// reference.

Application{
    resources: {
        @paper    = #ffffff
        @hairline = #e2e8f0
        @primary  = #1976d2
        @primInk  = #ffffff
        @divider  = #e0e0e0

        Border x:root [Background=@paper, BorderBrush=@hairline,
                       BorderThickness=(1)]{

            // DockPanel — a header strip on top, a horizontal split
            // below. Gives both ListBoxes finite-height slots so the
            // built-in ScrollViewers have a bounded viewport.
            DockPanel{
                // Header strip
                Border[DockPanel.Dock=Top,
                       Background=@primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="ListBox demo — declarative vs. Items",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@primInk]
                }

                // Two-up split — declarative on the left, Items on the
                // right, separated by a hairline divider. Each side
                // takes half the residual width via a horizontal
                // StackPanel sized inside the dock's LastChildFill slot.
                StackPanel[Orientation=Horizontal]{

                    // Left: composed-markup ListBoxItems. Each item's
                    // Content is a TextBlock; Tag is unset, so the
                    // host's SelectedItem read returns the ListBoxItem
                    // reference itself (matching WPF's declarative-mode
                    // SelectedItem convention).
                    StackPanel[Orientation=Vertical, Width=240, Margin=(12,12,6,12)]{
                        TextBlock[Text="Declarative", FontSize=12,
                                  FontWeight=Bold, Margin=(0,0,0,8)]
                        ListBox x:name="declarative" [SelectionMode=Extended]{
                            ListBoxItem{ TextBlock[Text="Apples"]   }
                            ListBoxItem{ TextBlock[Text="Bananas"]  }
                            ListBoxItem{ TextBlock[Text="Cherries"] }
                            ListBoxItem{ TextBlock[Text="Durian"]   }
                            ListBoxItem{ TextBlock[Text="Elderberry"]}
                            ListBoxItem{ TextBlock[Text="Fig"]      }
                        }
                    }

                    // Divider
                    Border[Width=1, Background=@divider, Margin=(0,12,0,12)]

                    // Right: Items convenience path. The host walks the
                    // attached Items array (string values) and auto-
                    // generates one ListBoxItem per element, with Tag
                    // = the source value. Single-select by default.
                    StackPanel[Orientation=Vertical, Width=240, Margin=(6,12,12,12)]{
                        TextBlock[Text="Items=[…] convenience",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,8)]
                        ListBox x:name="items"
                                [Items=["Red","Green","Blue","Yellow","Magenta","Cyan"]]
                    }
                }
            }
        }
    }
}
