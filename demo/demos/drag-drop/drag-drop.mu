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
        TextBlock [Text=$Label, Margin=(8,4,8,4), FontSize=12]
    }

    // Default ItemsControl has no Template, so the panel attaches
    // directly under the control — we need to set ItemsPanel
    // explicitly. Vertical StackPanel gives us the standard list
    // layout.
    ItemsPanelTemplate x:key="DragDropItemsPanel" {
        StackPanel
    }

    // ItemsControl wraps each item in a ContentPresenter — its
    // DataContext is set to the item when the ItemTemplate applies,
    // so the OnDragStart=$BeginDragData binding resolves against the
    // ItemVM and finds the function-DP. (ListBox's data path renders
    // via displayString() and would leave DataContext as the parent
    // VM, breaking the binding — that's why this demo uses
    // ItemsControl rather than ListBox.)
    Style x:key="DragDropItemContainerStyle" [targettype=ContentPresenter] {
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
                            ItemsControl x:name="leftList"
                                    [ItemsSource=$LeftItems,
                                     ItemsPanel=@DragDropItemsPanel,
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
                            ItemsControl x:name="rightList"
                                    [ItemsSource=$RightItems,
                                     ItemsPanel=@DragDropItemsPanel,
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
