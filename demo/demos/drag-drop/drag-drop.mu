// drag-drop.mu — two ListBoxes, items move between them via drag.
//
// Each ListBoxItem is a declarative drag source via the
// DragDropItemContainerStyle (IsDraggable=true + OnDragStart bound to
// ItemVM.BeginDragData). The drop receivers (the two ListBoxes) are
// wired by listbox-drop-behavior from the bootstrap — pure-markup
// drop-target wiring isn't yet available, hence the Behavior.

ResourceDictionary {
    // Each item renders as a left-padded label. ListBox routes
    // ItemTemplate through ContentControl when a matching DataTemplate
    // is registered for the item's type (DataType=ItemVM here).
    DataTemplate x:key="DragDropItemTemplate" [datatype=ItemVM] {
        TextBlock [Text=$Label, Margin=(8,4,8,4), FontSize=12]
    }

    // ListBoxItem container style — declarative drag source. ListBox
    // sets the container's DataContext to the per-row item, so the
    // OnDragStart=$BeginDragData binding resolves against ItemVM and
    // finds the function-DP.
    Style x:key="DragDropItemContainerStyle" [targettype=ListBoxItem] {
        IsDraggable = true;
        OnDragStart = $BeginDragData;
    }

    // Demo shell.
    DataTemplate x:key="DragDropTemplate" [datatype=DragDropVM] {
        Border x:root [Background=#ffffff, BorderBrush=#e2e8f0,
                       BorderThickness=(1)]{
            DockPanel{
                // Header strip.
                Border[DockPanel.Dock=Top,
                       Background=#1976d2, Padding=(16,12,16,12)]{
                    StackPanel[Orientation=Horizontal]{
                        TextBlock[Text="Drag-drop between lists",
                                  FontSize=15, FontWeight=Bold,
                                  Foreground=#ffffff]
                        TextBlock[Text=$Status,
                                  FontSize=12,
                                  Foreground=#ffffff,
                                  Margin=(20,4,0,0)]
                    }
                }

                // Two-up split. Each side is a fixed-size Border
                // hosting a DockPanel — the column header is docked
                // Top, and the ListBox takes LastChildFill so its
                // arranged rect covers the whole drop area. Without
                // the fixed Height, the outer Border shrink-wraps to
                // its content and the ListBox arranges to just the
                // items' height, so drops only land over actual rows.
                StackPanel[Orientation=Horizontal, Margin=(20)]{
                    Border[Width=220, Height=240,
                           Margin=(0,0,16,0),
                           BorderBrush=#e2e8f0, BorderThickness=(1)]{
                        DockPanel{
                            TextBlock[DockPanel.Dock=Top,
                                      Text="Left", FontWeight=Bold,
                                      FontSize=12, Foreground=#374151,
                                      Margin=(10,8,8,4)]
                            ListBox x:name="leftList"
                                    [ItemsSource=$LeftItems,
                                     ItemTemplate=@DragDropItemTemplate,
                                     ItemContainerStyle=@DragDropItemContainerStyle]
                        }
                    }
                    Border[Width=220, Height=240,
                           BorderBrush=#e2e8f0, BorderThickness=(1)]{
                        DockPanel{
                            TextBlock[DockPanel.Dock=Top,
                                      Text="Right", FontWeight=Bold,
                                      FontSize=12, Foreground=#374151,
                                      Margin=(10,8,8,4)]
                            ListBox x:name="rightList"
                                    [ItemsSource=$RightItems,
                                     ItemTemplate=@DragDropItemTemplate,
                                     ItemContainerStyle=@DragDropItemContainerStyle]
                        }
                    }
                }

                TextBlock[Margin=(20,4,20,16),
                          FontSize=11, Foreground=#6b7280,
                          TextWrapping=Wrap,
                          Text="Drag any item from one list to the other to move it. The framework's IsDraggable + OnDragStart binding starts the drag; a Behavior on each ListBox handles DragOver/Drop and dispatches to VM commands."]
            }
        }
    }
}
