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
    Template x:key="DefaultSegmentedButton" [TargetType = SegmentedButton] {
        ItemsPresenter
    }
    ItemsPanelTemplate x:key="DefaultSegmentedButtonPanel" {
        StackPanel [ Orientation = Horizontal ]
    }
    Style [TargetType = SegmentedButton] {
        Template = @DefaultSegmentedButton;
        ItemsPanel = @DefaultSegmentedButtonPanel;
    }

    // ── SegmentedItem: per-segment chrome ────────────────────────────
    // Corner radius selection: Single rounds all four corners; Start
    // rounds left only; End rounds right only; Middle stays square.
    // BorderThickness sheds the right edge on Start / Middle so the
    // following segment's left edge becomes the visible divider —
    // the row reads as one continuous outline rather than a stack of
    // independent boxes.
    //
    // Selection chrome: filled with @SecondaryContainer; M3 spec uses
    // the same fill for both single- and multi-select segmented
    // variants. State-layer ladder (hover / focus / press) overlays
    // @SecondaryContainer on the selected case and @Surface otherwise.
    Template x:key="DefaultSegmentedItem" [TargetType = SegmentedItem] {
        Border x:name="PART_Border"
            [ Background      = @Surface,
              BorderBrush     = @Outline,
              BorderThickness = (1,1,0,1),
              CornerRadius    = (0),
              Padding         = (@Spacing3,@Spacing1,@Spacing3,@Spacing1),
              Height          = 40 ] {
            ContentPresenter [ VerticalAlignment = Center, HorizontalAlignment = Center ]
        }

        // ── Position triggers — corner / border shape ────────────────
        when ( Position = Single ) {
            PART_Border.CornerRadius = @ShapeSmall;
            PART_Border.BorderThickness = (1,1,1,1);
        }
        when ( Position = Start ) {
            PART_Border.CornerRadius = (@ShapeSmall,0,0,@ShapeSmall);
            PART_Border.BorderThickness = (1,1,0,1);
        }
        when ( Position = Middle ) {
            PART_Border.CornerRadius = (0);
            PART_Border.BorderThickness = (1,1,0,1);
        }
        when ( Position = End ) {
            PART_Border.CornerRadius = (0,@ShapeSmall,@ShapeSmall,0);
            PART_Border.BorderThickness = (1,1,1,1);
        }

        // ── Selection chrome ────────────────────────────────────────
        when ( IsSelected ) { PART_Border.Background = @SecondaryContainer; }

        // ── State layers (ordered after Position + Selected so the
        // pressed/hover tint overlays whichever resting fill applied) ──
        when ( IsMouseOver ) { PART_Border.Background = @StateHoverOverlay; }
        when ( IsFocused ) { PART_Border.Background = @StateFocusOverlay; }
        when ( IsPressed ) { PART_Border.Background = @StatePressOverlay; }
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
                [ Background      = @Primary,
                  CornerRadius    = (@ShapeSmall,0,0,@ShapeSmall),
                  Padding         = (@Spacing4,@Spacing2,@Spacing4,@Spacing2),
                  BorderThickness = (0) ] {
                ContentPresenter [ HorizontalAlignment = Center, VerticalAlignment = Center ]
            }
            Border x:name="PART_TriggerButton"
                [ Background      = @Primary,
                  CornerRadius    = (0,@ShapeSmall,@ShapeSmall,0),
                  Padding         = (@Spacing2,@Spacing2,@Spacing2,@Spacing2),
                  BorderThickness = (1,0,0,0),
                  BorderBrush     = @PrimaryContainer ] {
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
            PART_PrimaryButton.Background = @StateHoverOverlay;
        }
        when ( PART_PrimaryButton.IsPressed ) {
            PART_PrimaryButton.Background = @StatePressOverlay;
        }
        when ( PART_TriggerButton.IsMouseOver ) {
            PART_TriggerButton.Background = @StateHoverOverlay;
        }
        when ( PART_TriggerButton.IsPressed ) {
            PART_TriggerButton.Background = @StatePressOverlay;
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
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                [ Background      = @SurfaceContainerHigh,
                  BorderBrush     = @OutlineVariant,
                  BorderThickness = (1),
                  CornerRadius    = @ShapeExtraSmall,
                  Effect          = @Elevation2,
                  Padding         = (4) ]
        }

        // High-contrast popup chrome — see DefaultMenuButtonPopup for
        // the rationale.
        when ( ThemeManager.PrefersContrast = More ) { PART_PopupBody.BorderThickness = (2); }
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
