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
    Template x:key="DefaultSwitch" [TargetType = Switch] {
        // PART_HitTarget — transparent fill wrapper (§18.6). Stretches to
        // fill the control's bounds; the visible 36.4×22.4 track sits centred
        // inside. The touch target grows by enlarging the CONTROL's own
        // Height (Style triggers below) — the Switch pins its Width/Height
        // defaults, so THAT is what the render size clamps to; this wrapper
        // then spans the grown bounds while the track (and its margin-
        // anchored thumb) stay centred and unclipped.
        Border x:name="PART_HitTarget"
            [ Fill          = #00000000,
              HorizontalAlignment = Stretch,
              VerticalAlignment   = Stretch ] {
            Border x:name="PART_Track"
                [ Fill          = @SurfaceContainerHighest,
                  Stroke         = Pen [ Brush = @Outline, Thickness = 2 ],
                  CornerRadius        = @ShapeFull,
                  Width               = 36.4,
                  Height              = 22.4,
                  HorizontalAlignment = Center,
                  VerticalAlignment   = Center ] {
                // Thumb is a circle (ShapeFull) inside the absolutely-sized
                // track. Margin (Left, Top, Right, Bottom) anchors it to the
                // left edge, vertically centred. All sizes here are the M3
                // 52×32 switch scaled to 70% (30% smaller). The IsChecked
                // trigger shifts to right-anchored + a larger thumb.
                Border x:name="PART_Thumb"
                    [ Fill          = @Outline,
                      CornerRadius        = @ShapeFull,
                      Width               = 11.2,
                      Height              = 11.2,
                      VerticalAlignment   = Center,
                      HorizontalAlignment = Left,
                      Margin              = (5.6,0,0,0) ]
            }
        }
        // IsChecked — track + thumb both flip palette; the thumb grows
        // and re-anchors to the right edge.
        when ( IsChecked ) {
            PART_Track.Fill = @Primary;
            PART_Track.Stroke = Pen [ Brush = @Primary, Thickness = 2 ];
            PART_Thumb.Fill = @OnPrimary;
            PART_Thumb.Width = 16.8;
            PART_Thumb.Height = 16.8;
            PART_Thumb.Margin = (16.8,0,0,0);
        }
        // State-layer ladder. Hover / focus / press tint the thumb at
        // the Primary state-layer opacities so the affordance reads
        // even when the track is unchecked.
        when ( IsMouseOver ) { PART_Thumb.Fill = @OnSurface; }
        when ( IsFocused ) { PART_Thumb.Fill = @OnSurface; }
        when ( IsPressed ) {
            PART_Thumb.Width = 19.6;
            PART_Thumb.Height = 19.6;
        }
        when ( IsEnabled = false ) { PART_Track.Opacity = @DisabledContentOpacity; }
    }
    Style [TargetType = Switch] {
        Template = @DefaultSwitch;
        // Adaptive touch target — the Switch pins its own Width/Height
        // (36.4×22.4), which the render size clamps to, so the hit target grows
        // by enlarging the CONTROL's Width/Height here; PART_HitTarget then
        // fills the grown bounds and the 36.4×22.4 track stays centred (no thumb
        // clipping). Both dimensions grow now that the 30%-smaller track is
        // below the 40/48 touch floor on each axis (same as Checkbox/Radio).
        // Coarse declared last so it wins a coincident Comfortable+Coarse
        // (a11y-favouring).
        when ( ThemeManager.Density = Comfortable ) { Width = 40; Height = 40; }
        when ( ThemeManager.Pointer = Coarse ) { Width = 48; Height = 48; }
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
    Template x:key="DefaultCheckbox" [TargetType = Checkbox] {
        // PART_HitTarget — transparent fill wrapper (§18.6). Stretches to
        // fill the control; the 18×18 box centres inside. The touch target
        // grows via the CONTROL's Width/Height (Style triggers below), not
        // this wrapper — the Checkbox pins its 18×18 defaults, so that's what
        // the render size clamps to. The box keeps its 2dp border unscaled.
        Border x:name="PART_HitTarget"
            [ Fill          = #00000000,
              HorizontalAlignment = Stretch,
              VerticalAlignment   = Stretch ] {
            Border x:name="PART_Box"
                [ Fill          = #00000000,
                  Stroke         = Pen [ Brush = @OnSurfaceVariant, Thickness = 2 ],
                  CornerRadius        = @ShapeExtraSmall,
                  Width               = 18,
                  Height              = 18,
                  HorizontalAlignment = Center,
                  VerticalAlignment   = Center ] {
                Shape x:name="PART_Mark"
                    [ Geometry            = @IconCheck,
                      Fill                = @OnPrimary,
                      Width               = 16,
                      Height              = 16,
                      HorizontalAlignment = Center,
                      VerticalAlignment   = Center,
                      Opacity             = 0 ]
            }
        }
        // IsChecked — fill the box and reveal the glyph.
        when ( IsChecked ) {
            PART_Box.Fill = @Primary;
            PART_Box.Stroke = Pen [ Brush = @Primary, Thickness = 2 ];
            PART_Mark.Opacity = 1;
        }
        // State-layer ladder. Hover / focus / press tint the box's
        // border (unchecked path) or pump the fill toward a press
        // tint (checked path). Disabled dims the whole control.
        when ( IsMouseOver ) { PART_Box.Stroke = Pen [ Brush = @OnSurface, Thickness = 2 ]; }
        when ( IsFocused ) { PART_Box.Stroke = Pen [ Brush = @Primary, Thickness = 2 ]; }
        when ( IsPressed ) { PART_Box.Stroke = Pen [ Brush = @Primary, Thickness = 2 ]; }
        when ( IsEnabled = false ) { PART_Box.Opacity = @DisabledContentOpacity; }
    }
    Style [TargetType = Checkbox] {
        Template = @DefaultCheckbox;
        // Adaptive touch target — grow the CONTROL's Width/Height so the
        // 18×18 box (kept centred by PART_HitTarget) sits inside a larger
        // tappable bound. Compact omitted (18dp is the a11y floor). Coarse
        // last so it wins a coincident Comfortable+Coarse.
        when ( ThemeManager.Density = Comfortable ) { Width = 40; Height = 40; }
        when ( ThemeManager.Pointer = Coarse ) { Width = 48; Height = 48; }
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
    Template x:key="DefaultRadioButton" [TargetType = RadioButton] {
        // PART_HitTarget — transparent fill wrapper (§18.6). Stretches to
        // fill the control; the 20×20 ring centres inside. The touch target
        // grows via the CONTROL's Width/Height (Style triggers below), not
        // this wrapper — the ring's 2dp stroke stays unscaled.
        Border x:name="PART_HitTarget"
            [ Fill          = #00000000,
              HorizontalAlignment = Stretch,
              VerticalAlignment   = Stretch ] {
            Border x:name="PART_Ring"
                [ Fill          = #00000000,
                  Stroke         = Pen [ Brush = @OnSurfaceVariant, Thickness = 2 ],
                  CornerRadius        = @ShapeFull,
                  Width               = 20,
                  Height              = 20,
                  HorizontalAlignment = Center,
                  VerticalAlignment   = Center ] {
                Border x:name="PART_Dot"
                    [ Fill          = @Primary,
                      CornerRadius        = @ShapeFull,
                      Width               = 10,
                      Height              = 10,
                      HorizontalAlignment = Center,
                      VerticalAlignment   = Center,
                      Opacity             = 0 ]
            }
        }
        when ( IsChecked ) {
            PART_Ring.Stroke = Pen [ Brush = @Primary, Thickness = 2 ];
            PART_Dot.Opacity = 1;
        }
        when ( IsMouseOver ) { PART_Ring.Stroke = Pen [ Brush = @OnSurface, Thickness = 2 ]; }
        when ( IsFocused ) { PART_Ring.Stroke = Pen [ Brush = @Primary, Thickness = 2 ]; }
        when ( IsPressed ) { PART_Ring.Stroke = Pen [ Brush = @Primary, Thickness = 2 ]; }
        when ( IsEnabled = false ) { PART_Ring.Opacity = @DisabledContentOpacity; }
    }
    Style [TargetType = RadioButton] {
        Template = @DefaultRadioButton;
        // Adaptive touch target — grow the CONTROL's Width/Height so the
        // 20×20 ring (kept centred by PART_HitTarget) sits inside a larger
        // tappable bound. Compact omitted (20dp is the a11y floor). Coarse
        // last so it wins a coincident Comfortable+Coarse.
        when ( ThemeManager.Density = Comfortable ) { Width = 40; Height = 40; }
        when ( ThemeManager.Pointer = Coarse ) { Width = 48; Height = 48; }
    }

    // ── RadioButtonGroup: single-select column of labelled radio rows ──
    // A Selector shell (like SegmentedButton) — the per-row chrome lives
    // on DefaultRadioButtonItem; the group just stacks its item containers
    // vertically. Selection / exclusion is owned by the Selector, so the
    // group needs no chrome of its own beyond the ItemsPresenter.
    Template x:key="DefaultRadioButtonGroup" [TargetType = RadioButtonGroup] {
        ItemsPresenter
    }
    ItemsPanelTemplate x:key="DefaultRadioButtonGroupPanel" {
        StackPanel [ Orientation = Vertical ]
    }
    Style [TargetType = RadioButtonGroup] {
        Template = @DefaultRadioButtonGroup;
        ItemsPanel = @DefaultRadioButtonGroupPanel;
    }

    // ── RadioButtonItem: one "circle + label" row ──────────────────────
    // Ring + dot on the left, label (ContentPresenter) on the right. The
    // indicator is drawn here rather than by embedding a RadioButton —
    // same self-drawn-chrome pattern as SegmentedItem — and tracks the
    // row's IsSelected (which the owning Selector flips on click). The dot
    // is always present at Opacity 0 so the implicit-transition engine
    // fades it in / out on select without a Storyboard. The whole row is
    // the hit target (PART_Row); its Fill carries the state-layer
    // ladder so hover / focus / press read across the full row, not just
    // the 20dp circle.
    Template x:key="DefaultRadioButtonItem" [TargetType = RadioButtonItem] {
        Border x:name="PART_Row"
            [ Fill      = #00000000,
              CornerRadius    = @ShapeSmall,
              Padding         = (@Spacing2,@Spacing1,@Spacing3,@Spacing1) ] {
            // DockPanel (not a horizontal StackPanel): a horizontal StackPanel
            // measures children with INFINITE width, so wrapping row content
            // (a ContentPresenter hosting a multi-line label + description) never
            // wraps — it runs full-length and gets clipped. Docking the ring Left
            // and letting the ContentPresenter fill gives it a FINITE width, so
            // TextWrapping engages and tall rows grow instead of overflowing.
            DockPanel [ LastChildFill = true ] {
                Border x:name="PART_Ring"
                    [ DockPanel.Dock      = Left,
                      Fill          = #00000000,
                      Stroke         = Pen [ Brush = @OnSurfaceVariant, Thickness = 2 ],
                      CornerRadius        = @ShapeFull,
                      Width               = 20,
                      Height              = 20,
                      VerticalAlignment   = Center ] {
                    Border x:name="PART_Dot"
                        [ Fill          = @Primary,
                          CornerRadius        = @ShapeFull,
                          Width               = 10,
                          Height              = 10,
                          HorizontalAlignment = Center,
                          VerticalAlignment   = Center,
                          Opacity             = 0 ]
                }
                ContentPresenter
                    [ VerticalAlignment = Center,
                      Margin            = (@Spacing3,0,0,0) ]
            }
        }
        // Selection — light the ring + dot at @Primary.
        when ( IsSelected ) {
            PART_Ring.Stroke = Pen [ Brush = @Primary, Thickness = 2 ];
            PART_Dot.Opacity = 1;
        }
        // State-layer ladder — overlay the full row (ordered after Selected
        // so the pressed/hover tint sits on top of the resting fill).
        when ( IsMouseOver ) { PART_Row.Fill = @StateHoverOverlay; }
        when ( IsFocused ) { PART_Row.Fill = @StateFocusOverlay; }
        when ( IsPressed ) { PART_Row.Fill = @StatePressOverlay; }
        when ( IsEnabled = false ) { PART_Row.Opacity = @DisabledContentOpacity; }

        // Adaptive layout (§ 18.6) — the row is the hit target, so density /
        // pointer retuning writes its Padding. Resting (8,4,12,4). Compact
        // tightens, Comfortable / Coarse loosen the vertical touch band.
        when ( ThemeManager.Density = Compact ) {
            PART_Row.Padding = (@Spacing1,@Spacing1,@Spacing2,@Spacing1);
        }
        when ( ThemeManager.Density = Comfortable ) {
            PART_Row.Padding = (@Spacing2,@Spacing2,@Spacing3,@Spacing2);
        }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Row.Padding = (@Spacing2,@Spacing3,@Spacing3,@Spacing3);
        }
    }
    Style [TargetType = RadioButtonItem] {
        Template = @DefaultRadioButtonItem;
        Foreground = @OnSurface;
        // Full Label Large atom set (matches SegmentedItem — § 18.13).
        FontFamily = @LabelLargeFont;
        FontWeight = @LabelLargeWeight;
        FontSize = @LabelLargeSize;
        LineHeight = @LabelLargeLineHeight;
        LetterSpacing = @LabelLargeTracking;
    }
}
