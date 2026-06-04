// drag-drop.mu — two ListBoxes, items move between them via drag.
//
// Each ListBoxItem is a declarative drag source via the
// DragDropItemContainerStyle (IsDraggable=true + OnDragStart bound to
// ItemVM.BeginDragData). The drop receivers (the two ListBoxes) are
// wired by listbox-drop-behavior from the bootstrap — pure-markup
// drop-target wiring isn't yet available, hence the Behavior.

ResourceDictionary {
    // Each item renders as a left-padded label. The container style
    // below adds the drag-source behavior; the template only carries
    // visualization.
    DataTemplate x:key="DragDropItemTemplate" [datatype=ItemVM] {
        TextBlock [Text=$Label, Padding=(8,4,8,4), FontSize=12]
    }

    // ListBoxItem container style — declarative drag source. The
    // framework's IsDraggable latch reads OnDragStart at the
    // 4px-threshold trip, calls the bound function, and starts a
    // DragSession with the returned {data, effects} payload.
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

                // Two-up split.
                StackPanel[Orientation=Horizontal, Margin=(20)]{
                    Border[Width=220, Margin=(0,0,16,0),
                           BorderBrush=#e2e8f0, BorderThickness=(1)]{
                        StackPanel{
                            TextBlock[Text="Left", FontWeight=Bold,
                                      FontSize=12, Foreground=#374151,
                                      Margin=(10,8,8,4)]
                            ListBox x:name="leftList"
                                    [ItemsSource=$LeftItems,
                                     ItemTemplate=@DragDropItemTemplate,
                                     ItemContainerStyle=@DragDropItemContainerStyle]
                        }
                    }
                    Border[Width=220, BorderBrush=#e2e8f0,
                           BorderThickness=(1)]{
                        StackPanel{
                            TextBlock[Text="Right", FontWeight=Bold,
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
