// Default theme entries for the tool-bar family — ToolBar (the
// horizontal command strip with inline-vs-overflow chevron) plus
// its connected-bar item types (ToolBarButton, ToolBarToggleButton,
// ToolBarSeparator).
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources ToolBars {
    // ── ToolBarButton: connected-bar chrome ────────────────────────
    // A ToolBarButton lives inside a ToolBar's inline strip alongside
    // peer buttons and ToolBarSeparators. The strip is meant to read as
    // one connected bar (Google Docs / Material 3 toolbar look), not a
    // row of disconnected pill buttons — so the default CornerRadius is
    // 0 (square), and the owning ToolBar rewrites the button's Position
    // DP after each layout pass to surface where it sits in its group:
    //
    //   * Position = Only   — sole button in its group → fully pill
    //   * Position = First  — leftmost in a multi-button group →
    //                          outer-left corners rounded, inner right
    //                          corners square (flush with the next
    //                          button).
    //   * Position = Last   — rightmost in a multi-button group → mirror
    //                          of First.
    //   * Position = Middle — interior of a group → every corner square.
    //   * Position = None   — standalone (no owning ToolBar) or in the
    //                          overflow popup → square corners.
    //
    // Padding is the M3 icon-button spec (4-square padding around a 24px
    // glyph); a ToolBarButton with `ShowText=true` carries enough room
    // for the label via the inner StackPanel's margin (set by
    // rebuildContent in tool-bar-items.ts).
    Template x:key="DefaultToolBarButton" [TargetType = ToolBarButton] {
        Border x:name="PART_Border"
            [ Background      = @SurfaceContainerHigh,
              BorderThickness = (0),
              CornerRadius    = 0,
              Padding         = (12,8,12,8) ] {
            ContentPresenter
        }
        // Opaque steps on the M3 SurfaceContainer ladder — going UP
        // for hover gives the button visibly more emphasis vs. the
        // surrounding @Surface toolbar, going DOWN for press signals
        // the "depressed" tap feedback. Using @StateHoverOverlay /
        // @StatePressOverlay here would be barely visible because
        // those tokens are translucent OnSurface tints; REPLACING the
        // resting @SurfaceContainerHigh with a translucent overlay
        // shows the toolbar's @Surface bleeding through, making hover
        // look LESS opaque than rest. MenuItem rows can use the
        // overlays because they're transparent at rest — see the
        // comment on DefaultMenuItemRow.
        when ( IsMouseOver ) { PART_Border.Background = @SurfaceContainerHighest; }
        when ( IsPressed ) { PART_Border.Background = @SurfaceContainer; }
        when ( Position = Only ) { PART_Border.CornerRadius = CornerRadius.Full; }
        when ( Position = First ) { PART_Border.CornerRadius = CornerRadius.LeftRounded; }
        when ( Position = Last ) { PART_Border.CornerRadius = CornerRadius.RightRounded; }
        // Adaptive layout — tighter in Compact, larger touch target
        // on coarse-pointer devices.
        when ( ThemeManager.Density = Compact ) { PART_Border.Padding = (8,4,8,4); }
        when ( ThemeManager.Density = Comfortable ) { PART_Border.Padding = (16,10,16,10); }
        when ( ThemeManager.Pointer = Coarse ) { PART_Border.Padding = (16,14,16,14); }
    }

    Style [TargetType = ToolBarButton] {
        Template = @DefaultToolBarButton;
    }

    // ── ToolBarToggleButton: connected-bar chrome ──────────────────
    // Same shape as ToolBarButton but with an IsChecked trigger on top —
    // the chrome reads as "Filled Tonal" while checked so a sticky
    // toggle (Bold, Italic, …) stays visible against the surrounding
    // square buttons. The position triggers ride on top of IsChecked
    // because they target a different DP (CornerRadius vs Background).
    Template x:key="DefaultToolBarToggleButton" [TargetType = ToolBarToggleButton] {
        Border x:name="PART_Border"
            [ Background      = @SurfaceContainerHigh,
              BorderThickness = (0),
              CornerRadius    = 0,
              Padding         = (12,8,12,8) ] {
            ContentPresenter
        }
        // Same SurfaceContainer-ladder pattern as DefaultToolBarButton
        // (see the comment there for why opaque steps beat overlays
        // for this template). IsChecked is declared LAST so its
        // @SecondaryContainer setter outranks hover / press when the
        // toggle is checked — matches the "checked beats hover" intent
        // the previous template carried.
        when ( IsMouseOver ) { PART_Border.Background = @SurfaceContainerHighest; }
        when ( IsPressed ) { PART_Border.Background = @SurfaceContainer; }
        when ( IsChecked ) { PART_Border.Background = @SecondaryContainer; }
        when ( Position = Only ) { PART_Border.CornerRadius = CornerRadius.Full; }
        when ( Position = First ) { PART_Border.CornerRadius = CornerRadius.LeftRounded; }
        when ( Position = Last ) { PART_Border.CornerRadius = CornerRadius.RightRounded; }
        // Adaptive layout (§ 17.7) — match DefaultToolBarButton's
        // density / pointer triggers so the connected-bar group stays
        // visually consistent when one button is a toggle.
        when ( ThemeManager.Density = Compact ) { PART_Border.Padding = (8,4,8,4); }
        when ( ThemeManager.Density = Comfortable ) { PART_Border.Padding = (16,10,16,10); }
        when ( ThemeManager.Pointer = Coarse ) { PART_Border.Padding = (16,14,16,14); }
    }

    Style [TargetType = ToolBarToggleButton] {
        Template = @DefaultToolBarToggleButton;
    }

    // ── ToolBarSeparator (vertical divider) ────────────────────────
    // 1-px line painted by the class's RenderOverride. The Style
    // supplies Width / MinHeight / LineBrush so divider tints follow
    // the active theme. Same shape MenuSeparator / StatusBarSeparator
    // use — the imperative `LineBrush ?? Theme.fieldBorder` fallback
    // is gone now that the DP default rides through DynamicResource.
    Style [TargetType = ToolBarSeparator] {
        Width = 9;
        MinHeight = 16;
        LineBrush = @Outline;
    }

    // ── ToolBar: inline chrome ─────────────────────────────────────
    // Border + DockPanel + chevron + ItemsPresenter. ToolBar's ctor
    // calls applyDefaultStyle, then FindNames each PART_ — the chevron
    // gets its click handler wired here, the popup is materialised
    // separately via @DefaultToolBarPopup.
    //
    // The chevron is a plain Button (Filled variant — gets its M3 pill
    // chrome from the basic theme). Its width is toggled between
    // Number.NaN (auto) and 0 by ToolBar.applyChevronVisibility based
    // on whether any items have overflowed.
    Template x:key="DefaultToolBar" [TargetType = ToolBar] {
        Border x:name="PART_Border"
            [ Background      = @Surface,
              BorderBrush     = @Outline,
              BorderThickness = (1),
              Padding         = (4) ] {
            DockPanel x:name="PART_Layout" [ LastChildFill = true ] {
                Button x:name="PART_Chevron" [ DockPanel.Dock = Right ] {
                    TextBlock [ Text = "⋯" ]
                }
                ItemsPresenter x:name="PART_ItemsPresenter"
            }
        }
    }

    // ── ToolBar: overflow popup ────────────────────────────────────
    // Mounted onto the PresentationTarget's OverlayLayer when
    // IsOverflowOpen flips true. PART_PopupList is an internal
    // ItemsControl bound to ToolBar._overflowedItems (the items that
    // moved off the inline strip because they wouldn't fit).
    // PART_PopupHost.anchor is wired to the chevron in ToolBar's ctor.
    Template x:key="DefaultToolBarPopup" [TargetType = ToolBar] {
        ToolBarPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupContainer"
                [ Background      = @SurfaceContainerHigh,
                  BorderBrush     = @OutlineVariant,
                  BorderThickness = (1),
                  Padding         = (4) ] {
                ToolBarOverflowItemsControl x:name="PART_PopupList"
            }
        }

        // High-contrast popup chrome — see DefaultMenuButtonPopup for
        // the rationale.
        when ( ThemeManager.PrefersContrast = More ) { PART_PopupContainer.BorderThickness = (2); }
    }

    Style [TargetType = ToolBar] {
        Template = @DefaultToolBar;
        PopupTemplate = @DefaultToolBarPopup;
    }
}
