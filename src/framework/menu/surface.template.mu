// Default theme entries for the command-surface controls — ToggleButton
// / ToolBar / Menu / MenuButton / ContextMenu. Kept separate from the
// main `controls.template.mu` because that file is loaded eagerly by
// Button's static block (via `ensureControlsTheme()`), and pulling any
// Button subclass into that cascade triggers a TDZ on the not-yet-
// initialised Button binding. See the Controls barrel comment around
// `surface.js` for the full explanation.
//
// This file is loaded only when the surface bundle is imported — its
// factory is registered with Application by `ensureSurfaceTheme()`,
// which surface controls call from their own static blocks.
//
// MenuButton and ContextMenu each ship TWO keyed templates (trigger +
// popup for MenuButton; just popup for ContextMenu) because they need
// to materialise two visual subtrees with different lifetimes — the
// trigger sits inline in the tree, while the popup is mounted onto the
// PresentationTarget's OverlayLayer when IsOpen flips true. WPF's
// MenuButton / ContextMenu carry an analogous split in their default
// styles; ComboBox + Drawer use the same dual-template shape (see
// controls.template.mu).

ResourceDictionary {

    // ── MenuButton: trigger button ─────────────────────────────────
    // The visible inline part of a MenuButton — a Button with a header
    // text label. MenuButton's ctor wires Click on PART_Trigger to flip
    // IsOpen; OnPropertyChanged keeps PART_HeaderText.Text in sync with
    // the Header DP, and rebuilds the inner stack when Icon changes.
    Template x:key="DefaultMenuButtonTrigger" [TargetType=MenuButton]{
        Button x:name="PART_Trigger"{
            StackPanel x:name="PART_TriggerStack" [Orientation = Horizontal]{
                TextBlock x:name="PART_HeaderText" [Foreground = #ffffff]
            }
        }
    }

    // ── MenuButton: popup overlay ──────────────────────────────────
    // Mounted onto the PresentationTarget's OverlayLayer when IsOpen
    // flips true; unmounted on close. PART_Scrim absorbs outside clicks,
    // PART_PopupContainer is the chrome around PART_Menu (the actual
    // MenuItem column). MenuButton's ctor sets PART_PopupHost.anchor to
    // PART_Trigger so the popup positions itself just below the trigger.
    Template x:key="DefaultMenuButtonPopup" [TargetType=MenuButton]{
        MenuPopupHost x:name="PART_PopupHost"{
            ClickAwayScrim x:name="PART_Scrim" [BorderThickness = (0)]
            Border x:name="PART_PopupContainer"
                  [Background      = #ffffff,
                   BorderBrush     = #e0e0e0,
                   BorderThickness = (1),
                   Padding         = (0)]{
                Menu x:name="PART_Menu"
            }
        }
    }

    // ── MenuButton: default Style ──────────────────────────────────
    // The popup host carries no in-flow chrome, so a single Template
    // setter would cover only the trigger. Instead, the popup is keyed
    // separately and read by name from the ctor (same shape ComboBox
    // and Drawer use for their split templates). This Style pins the
    // axis defaults so the MenuButton sizes to its trigger's natural
    // width rather than stretching to fill its parent.
    Style [TargetType=MenuButton] {
        HorizontalAlignment = Left;
        VerticalAlignment   = Top;
    }

    // ── ContextMenu: popup overlay ─────────────────────────────────
    // Same shape as the MenuButton popup, minus the anchor — ContextMenu
    // positions the popup at a fixed host-coords point set by OpenAt().
    Template x:key="DefaultContextMenuPopup" [TargetType=ContextMenu]{
        MenuPopupHost x:name="PART_PopupHost"{
            ClickAwayScrim x:name="PART_Scrim" [BorderThickness = (0)]
            Border x:name="PART_PopupContainer"
                  [Background      = #ffffff,
                   BorderBrush     = #e0e0e0,
                   BorderThickness = (1),
                   Padding         = (0)]{
                Menu x:name="PART_Menu"
            }
        }
    }
}
