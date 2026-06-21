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
    Template x:key="DefaultSegmentedButton" [TargetType=SegmentedButton] {
        ItemsPresenter
    }
    ItemsPanelTemplate x:key="DefaultSegmentedButtonPanel" {
        StackPanel [Orientation=Horizontal]
    }
    Style [TargetType=SegmentedButton] {
        Template   = @DefaultSegmentedButton;
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
    Template x:key="DefaultSegmentedItem" [TargetType=SegmentedItem] {
        Border x:name="PART_Border"
              [ Background      = @Surface,
                BorderBrush     = @Outline,
                BorderThickness = (1, 1, 0, 1),
                CornerRadius    = (0),
                Padding         = (@Spacing3, @Spacing1, @Spacing3, @Spacing1),
                Height          = 40 ] {
            ContentPresenter [VerticalAlignment=Center, HorizontalAlignment=Center]
        }

        // ── Position triggers — corner / border shape ────────────────
        when ( Position = Single ) { PART_Border.CornerRadius    = @ShapeFull;
                                     PART_Border.BorderThickness = (1, 1, 1, 1); }
        when ( Position = Start )  { PART_Border.CornerRadius    = (@ShapeFull, 0, 0, @ShapeFull);
                                     PART_Border.BorderThickness = (1, 1, 0, 1); }
        when ( Position = Middle ) { PART_Border.CornerRadius    = (0);
                                     PART_Border.BorderThickness = (1, 1, 0, 1); }
        when ( Position = End )    { PART_Border.CornerRadius    = (0, @ShapeFull, @ShapeFull, 0);
                                     PART_Border.BorderThickness = (1, 1, 1, 1); }

        // ── Selection chrome ────────────────────────────────────────
        when ( IsSelected ) { PART_Border.Background = @SecondaryContainer; }

        // ── State layers (ordered after Position + Selected so the
        // pressed/hover tint overlays whichever resting fill applied) ──
        when ( IsMouseOver )       { PART_Border.Background = @StateHoverOverlay; }
        when ( IsFocused )         { PART_Border.Background = @StateFocusOverlay; }
        when ( IsPressed )         { PART_Border.Background = @StatePressOverlay; }
        when ( IsEnabled = false ) { PART_Border.Opacity    = @DisabledContentOpacity; }
    }
    Style [TargetType=SegmentedItem] {
        Template   = @DefaultSegmentedItem;
        Foreground = @OnSurface;
        FontFamily = @LabelLargeFont;
        FontWeight = @LabelLargeWeight;
        FontSize   = @LabelLargeSize;
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
    Template x:key="DefaultSplitButton" [TargetType=SplitButton] {
        StackPanel [Orientation=Horizontal] {
            Border x:name="PART_PrimaryButton"
                  [ Background      = @Primary,
                    CornerRadius    = (@ShapeFull, 0, 0, @ShapeFull),
                    Padding         = (@Spacing4, @Spacing2, @Spacing4, @Spacing2),
                    BorderThickness = (0) ] {
                ContentPresenter [HorizontalAlignment=Center,
                                  VerticalAlignment=Center]
            }
            Border x:name="PART_TriggerButton"
                  [ Background      = @Primary,
                    CornerRadius    = (0, @ShapeFull, @ShapeFull, 0),
                    Padding         = (@Spacing2, @Spacing2, @Spacing2, @Spacing2),
                    BorderThickness = (1, 0, 0, 0),
                    BorderBrush     = @PrimaryContainer ] {
                TextBlock [Text="▾",
                           FontSize    = @LabelLargeSize,
                           FontWeight  = @TypefaceWeightBold,
                           Foreground  = @OnPrimary,
                           HorizontalAlignment = Center,
                           VerticalAlignment   = Center]
            }
        }

        // State-layer ladder — both halves track hover / press
        // independently. M3 spec: hover overlays at 8%, press at 12%.
        when ( PART_PrimaryButton.IsMouseOver ) { PART_PrimaryButton.Background = @StateHoverOverlay; }
        when ( PART_PrimaryButton.IsPressed )   { PART_PrimaryButton.Background = @StatePressOverlay; }
        when ( PART_TriggerButton.IsMouseOver ) { PART_TriggerButton.Background = @StateHoverOverlay; }
        when ( PART_TriggerButton.IsPressed )   { PART_TriggerButton.Background = @StatePressOverlay; }

        // Disabled — dim both halves at the M3 content-opacity (38%).
        when ( IsEnabled = false ) { PART_PrimaryButton.Opacity = @DisabledContentOpacity;
                                     PART_TriggerButton.Opacity = @DisabledContentOpacity; }
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
    Template x:key="DefaultSplitButtonPopup" [TargetType=SplitButton] {
        MenuPopupHost x:name="PART_PopupHost"{
            ClickAwayScrim x:name="PART_Scrim" [BorderThickness = (0)]
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
    Style [TargetType=SplitButton] {
        Template      = @DefaultSplitButton;
        PopupTemplate = @DefaultSplitButtonPopup;
        Foreground    = @OnPrimary;
        FontFamily    = @LabelLargeFont;
        FontWeight    = @LabelLargeWeight;
        FontSize      = @LabelLargeSize;
    }
}
