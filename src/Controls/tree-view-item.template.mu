// Default template for TreeViewItem — a Material dense-list row with a
// chevron expand/collapse cell, followed by a collapsible sub-row
// stack.
//
// Sizing constants live in markup:
//   * Row height          = 32 DIP (Material dense-list)
//   * Row padding         = 8 H × 6 V
//   * Chevron cell width  = 20 DIP
//   * Default Header text = 14 pt, ink colour
//
// Template parts:
//   * PART_OuterStack  — vertical wrapper holding the row + sub-stack.
//   * PART_Row         — the ClickableRow; TreeViewItem binds onClick
//                        and IsMouseOver listeners for hover background.
//   * PART_RowInner    — horizontal stack: spacer, chevron, label.
//   * PART_Spacer      — width set to `depth × TreeView.Indent` from
//                        TreeViewItem.MeasureOverride.
//   * PART_Chevron     — ChevronTarget; TreeViewItem binds the toggle.
//   * PART_ChevronText — glyph swapped between ▸ / ▾ / blank by code.
//   * PART_Label       — Header text; updated when the Header DP
//                        changes.
//   * PART_ChildWrap   — CollapsibleStack hosting sub-rows; TreeViewItem
//                        toggles its collapsed state from IsExpanded.

ResourceDictionary {
    template x:key="DefaultTreeViewItem"[targettype=TreeViewItem]{
        StackPanel x:name="PART_OuterStack" [ Orientation = Vertical ]{
            ClickableRow x:name="PART_Row"
                        [ BorderThickness = (0),
                          Padding         = (8,6,8,6),
                          Height          = 32 ]{
                StackPanel x:name="PART_RowInner" [ Orientation = Horizontal ]{
                    Border x:name="PART_Spacer" [ Width = 0 ]
                    ChevronTarget x:name="PART_Chevron"
                                  [ Width           = 20,
                                    BorderThickness = (0) ]{
                        TextBlock x:name="PART_ChevronText"
                                  [ Foreground         = #616161,
                                    FontSize           = 12,
                                    VerticalAlignment  = Center,
                                    Text               = "▸" ]
                    }
                    TextBlock x:name="PART_Label"
                              [ Foreground         = #212121,
                                FontSize           = 14,
                                VerticalAlignment  = Center ]
                }
            }
            CollapsibleStack x:name="PART_ChildWrap" [ Orientation = Vertical ]
        }
    }
}
