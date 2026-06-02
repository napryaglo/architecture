// Default popup-overlay template for ComboBox.
//
// Distinct from the selection-box template because its root is the
// ComboBoxPopupHost — a full-overlay-slot Panel that lives on the
// PresentationTarget's OverlayLayer when the dropdown is open. The
// selection box lives in-flow under the ComboBox itself; the popup
// host paints on top of everything.
//
// Template parts:
//   * PART_PopupHost   — the overlay-slot panel. ComboBox writes its
//                        `combo`, `selectionBox`, and `popup` refs
//                        after Apply so the host's ArrangeOverride can
//                        anchor the popup just below the selection
//                        box.
//   * PART_Scrim       — invisible full-overlay click-away absorber.
//                        Sits behind the popup (first child); a click
//                        anywhere outside the popup closes the
//                        dropdown.
//   * PART_Popup       — the visible popup container; sized by the
//                        ComboBoxPopupHost's arrange logic.
//   * PART_PopupStack  — the vertical stack that ComboBox refills with
//                        ClickableBorder rows whenever Items changes.

ResourceDictionary {
    template x:key="DefaultComboBoxPopup"[targettype=ComboBox]{
        ComboBoxPopupHost x:name="PART_PopupHost"{
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_Popup"
                  [ Background      = #ffffff,
                    BorderBrush     = #e0e0e0,
                    BorderThickness = (1),
                    CornerRadius    = 4,
                    Padding         = (0,4,0,4) ]{
                StackPanel x:name="PART_PopupStack" [ Orientation = Vertical ]
            }
        }
    }
}
