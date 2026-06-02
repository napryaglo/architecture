// Default overlay-host template for the Temporary Drawer variant.
//
// Applied lazily — only when a Temporary Drawer first transitions to
// IsOpen=true and needs to mount on PresentationTarget.OverlayRoot.
// The Permanent / Persistent variants never instantiate this template.
//
// The pane (built from `drawer.template.mu`) is NOT a child of this
// template; Drawer.ensureStructure() AddVisualChilds the pane after
// the host has been applied, so the same pane instance can flip
// between in-flow (Persistent) and overlay (Temporary) hosting without
// being rebuilt.
//
// Template parts:
//   * PART_OverlayHost — the TemporaryOverlayHost panel. Drawer writes
//                        its `drawer` back-reference after Apply so
//                        the host's ArrangeOverride can anchor the
//                        pane according to Anchor + DrawerSize.
//   * PART_Scrim       — the click-away surface; first visual child
//                        so it paints behind the pane. The scrim's
//                        Background is set in code from
//                        Drawer.ScrimBrush (defaults to 50% black
//                        overlay; consumer-overridable).

ResourceDictionary {
    template x:key="DefaultDrawerOverlay"[targettype=Drawer]{
        TemporaryOverlayHost x:name="PART_OverlayHost"{
            ScrimSurface x:name="PART_Scrim" [ BorderThickness = (0) ]
        }
    }
}
