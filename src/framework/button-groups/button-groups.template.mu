// Default theme entries for the button-groups family — SegmentedButton,
// SegmentedItem and SplitButton. ButtonGroup itself extends Panel and
// has no default Style, so it contributes nothing here.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu; the compiler turns
// that import into a Clone()-time fold so every entry below ends up
// in MuralFramework's keyed table.

resources ButtonGroups {
    // ── SegmentedButton: M3 connected-segment selection row ──────────
    // Items panel is a horizontal StackPanel; per-segment chrome lives
    // on DefaultSegmentedItem. SegmentedButton itself is a thin shell
    // — the outline + corner-rounding story is owned by the per-item
    // template since each segment's corners depend on Position
    // (Single / Start / Middle / End), which SegmentedButton stamps
    // onto each container after items change.
    // The group owns ONE uniform outer outline + the rounded outer
    // corners (@ShapeSmall). Individual segments no longer draw their own
    // 3-sided borders; the shared vertical hairline between adjacent
    // segments lives on DefaultSegmentedItem as a leading divider Line.
    // ClipToBounds keeps each segment's square-cornered fill inside the
    // outer rounded silhouette.
    Template x:key="DefaultSegmentedButton" [TargetType = SegmentedButton] {
        Border x:name="PART_GroupBorder"
            [ Fill        = #00000000,
              Stroke      = Pen [ Brush = @Outline ],
              CornerRadius = @ShapeSmall,
              ClipToBounds = true ] {
            ItemsPresenter
        }
    }
    ItemsPanelTemplate x:key="DefaultSegmentedButtonPanel" {
        StackPanel [ Orientation = Horizontal ]
    }
    Style [TargetType = SegmentedButton] {
        Template = @DefaultSegmentedButton;
        ItemsPanel = @DefaultSegmentedButtonPanel;
    }

    // ── SegmentedItem: per-segment chrome ────────────────────────────
    // The group outline + rounded outer corners now live on the
    // SegmentedButton shell (DefaultSegmentedButton / PART_GroupBorder),
    // so a segment no longer draws its own 3-sided border. Instead each
    // segment lays out as [ divider | fill ]: a leading vertical hairline
    // (PART_Divider) that reads as the shared boundary with the PREVIOUS
    // segment, plus PART_Border carrying the segment's fill + content. The
    // divider is collapsed on the first segment (Position = Start / Single)
    // where the group's own left edge is the boundary. The outer
    // ClipToBounds rounds the leftmost / rightmost square fills, so
    // per-segment CornerRadius is unnecessary.
    //
    // Selection chrome: filled with @SecondaryContainer; M3 spec uses
    // the same fill for both single- and multi-select segmented
    // variants. State-layer ladder (hover / focus / press) overlays
    // @SecondaryContainer on the selected case and @Surface otherwise.
    Template x:key="DefaultSegmentedItem" [TargetType = SegmentedItem] {
        StackPanel [ Orientation = Horizontal ] {
            // Shared boundary with the preceding segment. Vertical Line
            // stretches to the segment height; cross-axis size = 1dp pen.
            Line x:name="PART_Divider"
                [ Orientation = Vertical, Stroke = (@Outline, 1) ]
            Border x:name="PART_Border"
                [ Fill      = @Surface,
                  Padding         = (@Spacing3,@Spacing1,@Spacing3,@Spacing1),
                  Height          = 40 ] {
                ContentPresenter [ VerticalAlignment = Center, HorizontalAlignment = Center ]
            }
        }

        // ── Position triggers — first segment has no leading divider
        // (the group's own left edge is the boundary). Middle / End keep
        // the divider as the shared hairline with the previous segment.
        when ( Position = Single ) { PART_Divider.Visibility = Collapsed; }
        when ( Position = Start ) { PART_Divider.Visibility = Collapsed; }

        // ── Selection chrome ────────────────────────────────────────
        when ( IsSelected ) { PART_Border.Fill = @SecondaryContainer; }

        // ── State layers (ordered after Position + Selected so the
        // pressed/hover tint overlays whichever resting fill applied) ──
        when ( IsMouseOver ) { PART_Border.Fill = @StateHoverOverlay; }
        when ( IsFocused ) { PART_Border.Fill = @StateFocusOverlay; }
        when ( IsPressed ) { PART_Border.Fill = @StatePressOverlay; }
        when ( IsEnabled = false ) { PART_Border.Opacity = @DisabledContentOpacity; }

        // Adaptive layout (§ 18.6) — the hit target is the per-segment
        // PART_Border (SegmentedButton itself is a chrome-less shell), so
        // density / pointer retuning rides here. Resting is Padding
        // (12,4,12,4) + Height 40. Compact tightens, Comfortable loosens,
        // Coarse pointer bumps the segment height for a larger touch row.
        when ( ThemeManager.Density = Compact ) {
            PART_Border.Padding = (8,4,8,4);
            PART_Border.Height = 32;
        }
        when ( ThemeManager.Density = Comfortable ) {
            PART_Border.Padding = (16,6,16,6);
            PART_Border.Height = 48;
        }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Padding = (16,8,16,8);
            PART_Border.Height = 52;
        }
    }
    Style [TargetType = SegmentedItem] {
        Template = @DefaultSegmentedItem;
        Foreground = @OnSurface;
        // Full Label Large atom set (§ 18.13 — was Font/Weight/Size only).
        FontFamily = @LabelLargeFont;
        FontWeight = @LabelLargeWeight;
        FontSize = @LabelLargeSize;
        LineHeight = @LabelLargeLineHeight;
        LetterSpacing = @LabelLargeTracking;
    }

    // ── SplitButton: primary action + chevron menu trigger ──────────
    // Two distinct click targets share one container chrome. The
    // primary half (PART_PrimaryButton) fires Command; the chevron
    // half (PART_TriggerButton) toggles IsOpen, which mounts /
    // unmounts MenuContent on the OverlayLayer.
    //
    // Corner-radius split: the primary half rounds left only, the
    // chevron half rounds right only, so the row reads as a single
    // capsule.
    Template x:key="DefaultSplitButton" [TargetType = SplitButton] {
        StackPanel [ Orientation = Horizontal ] {
            Border x:name="PART_PrimaryButton"
                [ Fill      = @Primary,
                  CornerRadius    = (@ShapeSmall,0,0,@ShapeSmall),
                  Padding         = (@Spacing4,@Spacing2,@Spacing4,@Spacing2) ] {
                ContentPresenter [ HorizontalAlignment = Center, VerticalAlignment = Center ]
            }
            // Vertical hairline divider between the primary and chevron
            // halves — replaces PART_TriggerButton's old left-edge outline
            // (the former one-sided (1,0,0,0) rule). Stretches to the
            // capsule height; cross-axis size = the 1dp pen thickness.
            Line [ Orientation = Vertical, Stroke = (@PrimaryContainer, 1) ]
            Border x:name="PART_TriggerButton"
                [ Fill      = @Primary,
                  CornerRadius    = (0,@ShapeSmall,@ShapeSmall,0),
                  Padding         = (@Spacing2,@Spacing2,@Spacing2,@Spacing2) ] {
                Shape
                    [ Geometry            = @ChevronDown,
                      Fill                = @OnPrimary,
                      Width               = 14,
                      Height              = 14,
                      HorizontalAlignment = Center,
                      VerticalAlignment   = Center ]
            }
        }

        // State-layer ladder — both halves track hover / press
        // independently. M3 spec: hover overlays at 8%, press at 12%.
        when ( PART_PrimaryButton.IsMouseOver ) {
            PART_PrimaryButton.Fill = @StateHoverOverlay;
        }
        when ( PART_PrimaryButton.IsPressed ) {
            PART_PrimaryButton.Fill = @StatePressOverlay;
        }
        when ( PART_TriggerButton.IsMouseOver ) {
            PART_TriggerButton.Fill = @StateHoverOverlay;
        }
        when ( PART_TriggerButton.IsPressed ) {
            PART_TriggerButton.Fill = @StatePressOverlay;
        }

        // Disabled — dim both halves at the M3 content-opacity (38%).
        when ( IsEnabled = false ) {
            PART_PrimaryButton.Opacity = @DisabledContentOpacity;
            PART_TriggerButton.Opacity = @DisabledContentOpacity;
        }

        // Adaptive layout (§ 18.6) — both click halves carry their own
        // Padding (the capsule has no fixed height), so density / pointer
        // retuning writes both to keep the two halves the same height.
        // Resting: primary (16,8,16,8), trigger (8,8,8,8). Compact
        // tightens, Comfortable loosens, Coarse bumps the vertical touch
        // target.
        when ( ThemeManager.Density = Compact ) {
            PART_PrimaryButton.Padding = (12,5,12,5);
            PART_TriggerButton.Padding = (6,5,6,5);
        }
        when ( ThemeManager.Density = Comfortable ) {
            PART_PrimaryButton.Padding = (20,11,20,11);
            PART_TriggerButton.Padding = (11,11,11,11);
        }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_PrimaryButton.Padding = (18,12,18,12);
            PART_TriggerButton.Padding = (10,12,10,12);
        }
    }
    // Popup chrome — instantiated by SplitButton's mountPopup with the
    // SplitButton as templatedParent. Same shape as MenuButton / ContextMenu:
    //   * PART_PopupHost  — MenuPopupHost positions PART_PopupBody at the
    //                       anchor (the SplitButton). Its first child is
    //                       PART_Scrim (sized to the overlay surface to
    //                       absorb outside clicks); second child is the
    //                       chromed popup body (sized to its content +
    //                       arranged below the anchor).
    //   * PART_PopupBody  — the chrome Border that receives MenuContent
    //                       via SetChild at mount time.
    // Brushes / shape / elevation come from M3 tokens so the popup tracks
    // theme changes through the DynamicResource path the rest of the
    // framework uses — no JS-side resource lookups in the demo bootstrap.
    Template x:key="DefaultSplitButtonPopup" [TargetType = SplitButton] {
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim"
            Border x:name="PART_PopupBody"
                [ Fill      = @SurfaceContainerHigh,
                  Stroke     = Pen [ Brush = @OutlineVariant ],
                  CornerRadius    = @ShapeExtraSmall,
                  Effect          = @Elevation2,
                  Padding         = (4) ]
        }

        // High-contrast popup chrome — see DefaultMenuButtonPopup for
        // the rationale.
        when ( ThemeManager.PrefersContrast = More ) { PART_PopupBody.Stroke = (@OutlineVariant, 2); }
    }
    Style [TargetType = SplitButton] {
        Template = @DefaultSplitButton;
        PopupTemplate = @DefaultSplitButtonPopup;
        Foreground = @OnPrimary;
        // Full Label Large atom set (§ 18.13 — was Font/Weight/Size only).
        FontFamily = @LabelLargeFont;
        FontWeight = @LabelLargeWeight;
        FontSize = @LabelLargeSize;
        LineHeight = @LabelLargeLineHeight;
        LetterSpacing = @LabelLargeTracking;
    }
}
