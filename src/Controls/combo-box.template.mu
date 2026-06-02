// Default selection-box template for ComboBox — MUI Outlined Select.
//
// Visible in-flow surface only. The dropdown popup (mounted on the
// PresentationTarget's OverlayLayer when IsDropDownOpen=true) ships as
// a separate template — `combo-box-popup.template.mu` — because its
// root is the dropdown's overlay host, not a descendant of the
// selection box.
//
// Template parts:
//   * PART_SelectionBox    — the outer ClickableBorder; receives the
//                            open/close toggle click. ComboBox watches
//                            IsDropDownOpen and swaps BorderBrush.
//   * PART_SelectionText   — the left-aligned label; ComboBox writes
//                            the selected-item's display string into
//                            it (placeholder when nothing is chosen).
//   * PART_Chevron         — the right-aligned `▾` glyph.
//
// Resting palette (MUI field background / field border / placeholder
// text) is inlined; the same values live under
// `Theme.{fieldBg, fieldBorder, fieldBorderOpen, fieldText,
//   placeholder}` and are read from there by the TS side whenever it
// needs to swap a colour driven by state (open vs. closed).

ResourceDictionary {
    template x:key="DefaultComboBoxSelection"[targettype=ComboBox]{
        ClickableBorder x:name="PART_SelectionBox"
                      [ Background      = #ffffff,
                        BorderBrush     = #c4c4c4,
                        BorderThickness = (1),
                        CornerRadius    = 4,
                        Padding         = (14,8,14,8),
                        Height          = 40 ]{
            SplitRow{
                TextBlock x:name="PART_SelectionText" [ Foreground = #9e9e9e ]
                TextBlock x:name="PART_Chevron"       [ Foreground = #212121,
                                                        Text       = "▾" ]
            }
        }
    }
}
