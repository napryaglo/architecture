import ContextMenuVM from "./context-menu-vm.mjs"

// context-menu.mu — ContextMenu attached-property showcase. Three
// coloured panels each carry their OWN ContextMenu via the attached
// `ContextMenuService.ContextMenu` DP (or the ergonomic
// `Visual.ContextMenu` instance accessor). Right-click any panel to
// open its menu at the cursor position.
//
// The status line at the bottom updates as commands fire — each
// MenuItem passes a CommandParameter the VM uses to format the
// per-panel status string.

ResourceDictionary {

    // One ContextMenu per panel, keyed so the panels can reference
    // them through the attached property. Items differ across the
    // three menus to make it clear that route-walking found the
    // right ancestor.
    ContextMenu x:key="RedMenu" {
        MenuItem[Header="Red — Cut",  Command=$RedCommand, CommandParameter="Cut"]
        MenuItem[Header="Red — Copy", Command=$RedCommand, CommandParameter="Copy"]
        MenuSeparator
        MenuItem[Header="Red — Delete", Command=$RedCommand, CommandParameter="Delete"]
    }
    ContextMenu x:key="GreenMenu" {
        MenuItem[Header="Green — Inspect",   Command=$GreenCommand, CommandParameter="Inspect"]
        MenuItem[Header="Green — Highlight", Command=$GreenCommand, CommandParameter="Highlight"]
        MenuSeparator
        MenuItem[Header="Green — Rename", Command=$GreenCommand, CommandParameter="Rename"]
    }
    ContextMenu x:key="BlueMenu" {
        MenuItem[Header="Blue — Open",     Command=$BlueCommand, CommandParameter="Open"]
        MenuItem[Header="Blue — Bookmark", Command=$BlueCommand, CommandParameter="Bookmark"]
        MenuSeparator
        MenuItem[Header="Blue — Share",    Command=$BlueCommand, CommandParameter="Share"]
    }

    DataTemplate x:key="ContextMenuTemplate" [DataType=ContextMenuVM] {
        Border [Background=#ffffff, BorderBrush=#e2e8f0,
                BorderThickness=(1)]{

            DockPanel{
                // Header
                Border[DockPanel.Dock=Top,
                       Background=#1976d2, Padding=(16,12,16,12)]{
                    TextBlock[Text="ContextMenu — right-click any panel; the nearest ancestor's menu opens at the cursor.",
                              FontSize=15, FontWeight=Bold,
                              Foreground=#ffffff]
                }

                StackPanel[Orientation=Vertical, Margin=(16,16,16,16)]{
                    StackPanel[Orientation=Horizontal, Margin=(0,0,0,16)]{
                        Border[Background=#ef4444, Width=180, Height=120,
                               Margin=(0,0,12,0),
                               ContextMenuService.ContextMenu=@RedMenu]{
                            TextBlock[Text="Right-click me",
                                      Foreground=#ffffff, FontSize=14,
                                      FontWeight=Bold,
                                      HorizontalAlignment=Center,
                                      VerticalAlignment=Center]
                        }
                        Border[Background=#22c55e, Width=180, Height=120,
                               Margin=(0,0,12,0),
                               ContextMenuService.ContextMenu=@GreenMenu]{
                            TextBlock[Text="Right-click me",
                                      Foreground=#ffffff, FontSize=14,
                                      FontWeight=Bold,
                                      HorizontalAlignment=Center,
                                      VerticalAlignment=Center]
                        }
                        Border[Background=#3b82f6, Width=180, Height=120,
                               ContextMenuService.ContextMenu=@BlueMenu]{
                            TextBlock[Text="Right-click me",
                                      Foreground=#ffffff, FontSize=14,
                                      FontWeight=Bold,
                                      HorizontalAlignment=Center,
                                      VerticalAlignment=Center]
                        }
                    }

                    TextBlock[Text=$Status, FontSize=13,
                              Foreground=#1f2937]
                }
            }
        }
    }
}
