// Default in-flow pane template for Drawer.
//
// Used by every variant (Permanent / Persistent / Temporary). Permanent
// and Persistent attach the pane to the Drawer directly; Temporary
// re-parents the same pane onto the overlay host (see
// `drawer-overlay.template.mu`). The pane instance is single — no
// duplicate pane in Temporary.
//
// Template parts:
//   * PART_Pane    — the white pane Border (1-DIP hairline edge).
//   * (The ContentPresenter is discovered by ControlTemplate.Apply via
//     its first-presenter walk; the consumer-supplied Drawer.Content
//     gets slotted into it from code.)

ResourceDictionary {
    template x:key="DefaultDrawerPane"[targettype=Drawer]{
        Border x:name="PART_Pane"
              [ Background      = #ffffff,
                BorderBrush     = #e0e0e0,
                BorderThickness = (1) ]{
            ContentPresenter
        }
    }
}
