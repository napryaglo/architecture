// Default theme entries for the toggles family — binary-state
// controls (Switch / Checkbox / RadioButton). All three extend
// ToggleButton (which lives in src/framework/toggle-button.ts) and
// share the IsChecked click-flip protocol; the chrome below is what
// makes each variant visually distinct.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu; the compiler folds
// every entry below into MuralFramework's keyed table at Clone() time.

resources Toggles {

    // ── Switch: M3 binary toggle (track + sliding thumb) ───────────
    // 52 × 32 dp pill track with a thumb that slides between the left
    // and right edges as IsChecked flips. The Margin-based positioning
    // hooks into Visual's implicit-transition engine — Thickness is one
    // of the types the engine interpolates — so the off/on flip
    // animates smoothly without a Storyboard.
    //
    // M3 spec colours:
    //   * off — track @SurfaceContainerHighest, thumb @Outline (16dp).
    //   * on  — track @Primary, thumb @OnPrimary (24dp). Thumb growth
    //           reads as the M3 "selected handle" affordance.
    //
    // State-layer triggers tint the thumb on hover / focus / press,
    // mirroring the Button family ladder. The press-state thumb size
    // bumps to 28dp (M3 "pressed" handle) but that requires the same
    // Margin trick as IsChecked — folded into the IsPressed trigger
    // below.
    Template x:key="DefaultSwitch" [TargetType=Switch] {
        Border x:name="PART_Track"
              [ Background      = @SurfaceContainerHighest,
                BorderBrush     = @Outline,
                BorderThickness = (2),
                CornerRadius    = @ShapeFull ] {
            // Thumb is a circle (ShapeFull) inside an absolutely-sized
            // 32dp track. Margin (Left, Top, Right, Bottom) anchors it
            // to the left edge with a 4dp inset top/bottom — the
            // resulting render size is 16×24 dp (24dp inner track
            // height, 16dp Width fixed below). The IsChecked trigger
            // shifts to right-anchored + 24dp width.
            Border x:name="PART_Thumb"
                  [ Background          = @Outline,
                    CornerRadius        = @ShapeFull,
                    BorderThickness     = (0),
                    Width               = 16,
                    Height              = 16,
                    VerticalAlignment   = Center,
                    HorizontalAlignment = Left,
                    Margin              = (8, 0, 0, 0) ]
        }
        // IsChecked — track + thumb both flip palette; the thumb grows
        // and re-anchors to the right edge.
        when ( IsChecked ) { PART_Track.Background    = @Primary;
                             PART_Track.BorderBrush   = @Primary;
                             PART_Thumb.Background    = @OnPrimary;
                             PART_Thumb.Width         = 24;
                             PART_Thumb.Height        = 24;
                             PART_Thumb.Margin        = (24, 0, 0, 0); }
        // State-layer ladder. Hover / focus / press tint the thumb at
        // the Primary state-layer opacities so the affordance reads
        // even when the track is unchecked.
        when ( IsMouseOver )       { PART_Thumb.Background = @OnSurface; }
        when ( IsFocused )         { PART_Thumb.Background = @OnSurface; }
        when ( IsPressed )         { PART_Thumb.Width      = 28;
                                     PART_Thumb.Height     = 28; }
        when ( IsEnabled = false ) { PART_Track.Opacity    = @DisabledContentOpacity; }
    }
    Style [TargetType=Switch] {
        Template = @DefaultSwitch;
    }

    // ── Checkbox: M3 18 × 18 dp square toggle ──────────────────────
    // Unchecked — empty box with @OnSurfaceVariant 2dp border. Checked
    // — solid @Primary fill with an @OnPrimary checkmark glyph. The
    // glyph is always present in the visual tree but its Opacity flips
    // from 0 → 1 on the IsChecked trigger so the implicit-transition
    // engine on Visual fades it in / out without a Storyboard (Opacity
    // is a number — one of the types the engine knows how to
    // interpolate).
    //
    // No tri-state (indeterminate) chrome — see Checkbox.ts for the
    // why-deferred rationale.
    Template x:key="DefaultCheckbox" [TargetType=Checkbox] {
        Border x:name="PART_Box"
              [ Background      = #00000000,
                BorderBrush     = @OnSurfaceVariant,
                BorderThickness = (2),
                CornerRadius    = @ShapeExtraSmall ] {
            TextBlock x:name="PART_Mark"
                     [ Text                = "✓",
                       FontFamily          = @LabelSmallFont,
                       FontWeight          = @TypefaceWeightBold,
                       FontSize             = @LabelLargeSize,
                       Foreground           = @OnPrimary,
                       HorizontalAlignment  = Center,
                       VerticalAlignment    = Center,
                       Opacity              = 0 ]
        }
        // IsChecked — fill the box and reveal the glyph.
        when ( IsChecked )         { PART_Box.Background     = @Primary;
                                     PART_Box.BorderBrush    = @Primary;
                                     PART_Mark.Opacity       = 1; }
        // State-layer ladder. Hover / focus / press tint the box's
        // border (unchecked path) or pump the fill toward a press
        // tint (checked path). Disabled dims the whole control.
        when ( IsMouseOver )       { PART_Box.BorderBrush    = @OnSurface; }
        when ( IsFocused )         { PART_Box.BorderBrush    = @Primary; }
        when ( IsPressed )         { PART_Box.BorderBrush    = @Primary; }
        when ( IsEnabled = false ) { PART_Box.Opacity        = @DisabledContentOpacity; }
    }
    Style [TargetType=Checkbox] {
        Template = @DefaultCheckbox;
    }

    // ── RadioButton: M3 20 × 20 dp circular toggle ─────────────────
    // Outer ring + inner dot. The dot is always present (a 10dp filled
    // circle inset by 5dp) but its Opacity flips from 0 → 1 on
    // IsChecked, so the implicit-transition engine fades it in / out
    // without a Storyboard. The outer ring re-tints to @Primary when
    // checked, matching the M3 affordance.
    //
    // Mutual exclusivity rides on the RadioButton class's
    // OnPropertyChanged hook — set `GroupName=foo` on multiple radios
    // and any sibling sharing that name in the same visual tree
    // automatically clears when this one is checked. See radio-
    // button.ts for the walker.
    Template x:key="DefaultRadioButton" [TargetType=RadioButton] {
        Border x:name="PART_Ring"
              [ Background      = #00000000,
                BorderBrush     = @OnSurfaceVariant,
                BorderThickness = (2),
                CornerRadius    = @ShapeFull ] {
            Border x:name="PART_Dot"
                  [ Background          = @Primary,
                    CornerRadius        = @ShapeFull,
                    BorderThickness     = (0),
                    Width               = 10,
                    Height              = 10,
                    HorizontalAlignment = Center,
                    VerticalAlignment   = Center,
                    Opacity             = 0 ]
        }
        when ( IsChecked )         { PART_Ring.BorderBrush = @Primary;
                                     PART_Dot.Opacity      = 1; }
        when ( IsMouseOver )       { PART_Ring.BorderBrush = @OnSurface; }
        when ( IsFocused )         { PART_Ring.BorderBrush = @Primary; }
        when ( IsPressed )         { PART_Ring.BorderBrush = @Primary; }
        when ( IsEnabled = false ) { PART_Ring.Opacity     = @DisabledContentOpacity; }
    }
    Style [TargetType=RadioButton] {
        Template = @DefaultRadioButton;
    }
}
