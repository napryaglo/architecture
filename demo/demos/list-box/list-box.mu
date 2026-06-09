import ListBoxVM from "./list-box-vm.mjs"

// list-box.mu — ListBox demo: composed-markup rows on the left, a
// counterpart bound to the Items convenience path on the right. Both
// share a single DockPanel header strip.
//
// The right pane's data wiring + Sort/Filter button handlers live on
// ListBoxVM.OnViewMounted, which uses FindName on the freshly-built
// template subtree (resolved through DataTemplate by data type).
//
// Packaged as a DataTemplate keyed off ListBoxVM.

resources ListBoxDemo {
    DataTemplate x:key="ListBoxTemplate" [DataType=ListBoxVM] {
        // x:root marks this Border as the NameScope owner so x:name
        // attributes inside register against its scope — VM's
        // OnViewMounted then resolves them via FindName.
        Border x:root [Background=@Surface, BorderBrush=@OutlineVariant,
                       BorderThickness=(1)]{

            // DockPanel — a header strip on top, a horizontal split
            // below. Gives both ListBoxes finite-height slots so the
            // built-in ScrollViewers have a bounded viewport.
            DockPanel{
                // Header strip
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="ListBox demo — declarative vs. Items",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@OnPrimary]
                }

                // Two-up split — declarative on the left, Items on the
                // right, separated by a hairline divider. Each side
                // takes half the residual width via a horizontal
                // StackPanel sized inside the dock's LastChildFill slot.
                StackPanel[Orientation=Horizontal]{

                    // Left: composed-markup ListBoxItems with
                    // Windows-Explorer-style marquee multi-select.
                    // SelectionMode=Extended + AllowMarqueeSelection=true
                    // enables drag-rectangle selection: drag on the
                    // empty space between rows to rubber-band a group.
                    // Ctrl-drag adds to the existing selection;
                    // Shift-drag extends from the prior snapshot.
                    StackPanel[Orientation=Vertical, Width=240, Margin=(12,12,6,12)]{
                        TextBlock[Text="Declarative + marquee select",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,4)]
                        TextBlock[Text="Drag in empty space to marquee-select. Ctrl=add. Shift=extend.",
                                  FontSize=10, Foreground=@OnSurfaceVariant,
                                  TextWrapping=Wrap,
                                  Margin=(0,0,0,8)]
                        ListBox [SelectionMode=Extended,
                                 AllowMarqueeSelection=true]{
                            ListBoxItem{ TextBlock[Text="Apples"]   }
                            ListBoxItem{ TextBlock[Text="Bananas"]  }
                            ListBoxItem{ TextBlock[Text="Cherries"] }
                            ListBoxItem{ TextBlock[Text="Durian"]   }
                            ListBoxItem{ TextBlock[Text="Elderberry"]}
                            ListBoxItem{ TextBlock[Text="Fig"]      }
                            ListBoxItem{ TextBlock[Text="Grape"]    }
                            ListBoxItem{ TextBlock[Text="Honeydew"] }
                            ListBoxItem{ TextBlock[Text="Kiwi"]     }
                            ListBoxItem{ TextBlock[Text="Lemon"]    }
                        }
                    }

                    // Divider
                    Border[Width=1, Background=@OutlineVariant, Margin=(0,12,0,12)]

                    // Middle: Items convenience path. The host walks the
                    // attached Items array (string values) and auto-
                    // generates one ListBoxItem per element, with Tag
                    // = the source value. Single-select by default.
                    StackPanel[Orientation=Vertical, Width=240, Margin=(6,12,6,12)]{
                        TextBlock[Text="Items=[…] convenience",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,8)]
                        ListBox [Items=["Red","Green","Blue","Yellow","Magenta","Cyan"]]
                    }

                    // Divider
                    Border[Width=1, Background=@OutlineVariant, Margin=(0,12,0,12)]

                    // Right: ItemsSource + CollectionView. VM wires
                    // CollectionView with Filter + Sort applied;
                    // buttons toggle them on/off. Demonstrates the
                    // Tier 3 surface: filtering and sorting a data
                    // source without touching the underlying array.
                    StackPanel[Orientation=Vertical, Width=240, Margin=(6,12,12,12)]{
                        TextBlock[Text="ItemsSource + CollectionView",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,8)]
                        StackPanel[Orientation=Horizontal, Margin=(0,0,0,8)]{
                            Button x:name="btnSort"   [Margin=(0,0,4,0)]{
                                TextBlock[Text="Sort A↕Z", FontSize=11]
                            }
                            Button x:name="btnFilter"{
                                TextBlock[Text="Engineers only", FontSize=11]
                            }
                        }
                        TextBlock x:name="statusLine"
                                  [Text="6 of 6 visible",
                                   FontSize=10, Foreground=@Primary,
                                   Margin=(0,0,0,4)]
                        ListBox x:name="bound"
                    }
                }
            }
        }
    }
}
