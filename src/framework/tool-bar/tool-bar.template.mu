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
              CornerRadius    = 0 ] {
            // Transparent inner state layer (M3 state-layer model): the
            // resting @SurfaceContainerHigh base stays put and hover / press
            // paint a translucent OnSurfaceVariant tint ON TOP of it here,
            // rather than swapping the base to a darker container step — which
            // read as an abrupt "goes dark" flash. The layer carries the
            // button padding so the tint covers the whole button; Border does
            // NOT clip its child to CornerRadius, so the Position triggers
            // round this layer in lock-step with PART_Border.
            Border x:name="PART_StateLayer"
                [ Background   = #00000000,
                  CornerRadius = 0,
                  Padding      = (12,8,12,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Background = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Background = @OnSurfaceVariantPressLayer; }
        when ( Position = Only ) { PART_Border.CornerRadius = CornerRadius.Full; PART_StateLayer.CornerRadius = CornerRadius.Full; }
        when ( Position = First ) { PART_Border.CornerRadius = CornerRadius.LeftRounded; PART_StateLayer.CornerRadius = CornerRadius.LeftRounded; }
        when ( Position = Last ) { PART_Border.CornerRadius = CornerRadius.RightRounded; PART_StateLayer.CornerRadius = CornerRadius.RightRounded; }
        // Adaptive layout — tighter in Compact, larger touch target
        // on coarse-pointer devices.
        when ( ThemeManager.Density = Compact ) { PART_StateLayer.Padding = (8,4,8,4); }
        when ( ThemeManager.Density = Comfortable ) { PART_StateLayer.Padding = (16,10,16,10); }
        when ( ThemeManager.Pointer = Coarse ) { PART_StateLayer.Padding = (16,14,16,14); }
    }

    Style [TargetType = ToolBarButton] {
        Template = @DefaultToolBarButton;
        // Establish the toolbar ink on the button so it cascades into the
        // slotted content: a bare icon Shape (Fill unset) paints through
        // effectiveFill's inherited-Foreground fallback. Text labels and
        // colour emoji ignore it; only geometry icons depend on it. A
        // 2-segment attached-on-self setter (a ControlTemplate trigger
        // can't reach the 3-segment PART_Border.TextBlock.Foreground path).
        TextBlock.Foreground = @OnSurfaceVariant;
    }

    // ── ToolBarToggleButton: connected-bar chrome ──────────────────
    // Same shape as ToolBarButton but with an IsChecked trigger on top —
    // the chrome reads as "Filled" (@Primary) while checked so a sticky
    // toggle (Bold, Italic, …) reads unmistakably against the surrounding
    // square buttons. The position triggers ride on top of IsChecked
    // because they target a different DP (CornerRadius vs Background).
    //
    // Checked ink: the Style below flips the inherited TextBlock.Foreground
    // to @OnPrimary while checked, so a bare icon Shape (Fill unset) painted
    // through effectiveFill's Foreground fallback stays legible on the
    // @Primary fill. The flip lives in the Style (a 2-segment attached-on-
    // self setter) because a ControlTemplate trigger can't target the
    // 3-segment PART_Border.TextBlock.Foreground path — same reason the
    // IconButtonToggle Style carries its checked foregrounds.
    Template x:key="DefaultToolBarToggleButton" [TargetType = ToolBarToggleButton] {
        Border x:name="PART_Border"
            [ Background      = @SurfaceContainerHigh,
              BorderThickness = (0),
              CornerRadius    = 0 ] {
            // Same transparent state layer as DefaultToolBarButton — hover /
            // press ride a translucent OnSurfaceVariant tint ON TOP of the
            // base, matching the Filled IconButtonToggle. IsChecked swaps the
            // base fill (PART_Border.Background) to @Primary; the state layer
            // overlays either base without touching it, so checked + hover
            // composes as Primary + tint instead of one darkening the other.
            Border x:name="PART_StateLayer"
                [ Background   = #00000000,
                  CornerRadius = 0,
                  Padding      = (12,8,12,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Background = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Background = @OnSurfaceVariantPressLayer; }
        when ( IsChecked ) { PART_Border.Background = @Primary; }
        when ( Position = Only ) { PART_Border.CornerRadius = CornerRadius.Full; PART_StateLayer.CornerRadius = CornerRadius.Full; }
        when ( Position = First ) { PART_Border.CornerRadius = CornerRadius.LeftRounded; PART_StateLayer.CornerRadius = CornerRadius.LeftRounded; }
        when ( Position = Last ) { PART_Border.CornerRadius = CornerRadius.RightRounded; PART_StateLayer.CornerRadius = CornerRadius.RightRounded; }
        // Adaptive layout (§ 17.7) — match DefaultToolBarButton's
        // density / pointer triggers so the connected-bar group stays
        // visually consistent when one button is a toggle.
        when ( ThemeManager.Density = Compact ) { PART_StateLayer.Padding = (8,4,8,4); }
        when ( ThemeManager.Density = Comfortable ) { PART_StateLayer.Padding = (16,10,16,10); }
        when ( ThemeManager.Pointer = Coarse ) { PART_StateLayer.Padding = (16,14,16,14); }
    }

    Style [TargetType = ToolBarToggleButton] {
        Template = @DefaultToolBarToggleButton;
        // Icon ink. Resting = @OnSurfaceVariant (matches the peer
        // ToolBarButtons); checked = @OnPrimary so a bare icon Shape stays
        // legible on the @Primary checked fill. Set as the control's own
        // inherited TextBlock.Foreground so it cascades into the slotted
        // icon (Shape.effectiveFill falls back to the inherited Foreground
        // when Fill is unset). A checked-state trigger can't live in the
        // ControlTemplate (3-segment part path), so it rides here.
        TextBlock.Foreground = @OnSurfaceVariant;
        when ( IsChecked ) { TextBlock.Foreground = @OnPrimary; }
    }

    // ── ToolBarSplitButton ─────────────────────────────────────────
    // A connected-pair split button: PART_Primary fires the primary Command,
    // PART_Arrow opens the dropdown of MenuItem children (auto-closing on
    // click). Two flat halves share the toolbar's @SurfaceContainerHigh base
    // with the same translucent state-layer hover/press the peer buttons use
    // (per-half so each highlights independently); a faint divider between
    // them cues the two targets, and the outer corners round into one pill.
    //
    // Vertical stack for the dropdown rows.
    ItemsPanelTemplate x:key="DefaultToolBarMenuPanel" {
        StackPanel [ Orientation = Vertical ]
    }
    // Trigger chrome (visible split button) — set as TriggerTemplate; the
    // control's primary Template slot hosts the popup below.
    Template x:key="DefaultToolBarSplitTrigger" [TargetType = ToolBarSplitButton] {
        StackPanel [ Orientation = Horizontal ] {
            Border x:name="PART_Primary"
                [ Background      = @SurfaceContainerHigh,
                  CornerRadius    = (@ShapeFull,0,0,@ShapeFull),
                  BorderThickness = (0) ] {
                Border x:name="PART_PrimaryState"
                    [ Background   = #00000000,
                      CornerRadius = (@ShapeFull,0,0,@ShapeFull),
                      Padding      = (12,8,10,8) ] {
                    Border x:name="PART_Content" [ HorizontalAlignment = Center, VerticalAlignment = Center ]
                }
            }
            Border x:name="PART_Arrow"
                [ Background      = @SurfaceContainerHigh,
                  CornerRadius    = (0,@ShapeFull,@ShapeFull,0),
                  BorderThickness = (1,0,0,0),
                  BorderBrush     = @OutlineVariant ] {
                Border x:name="PART_ArrowState"
                    [ Background   = #00000000,
                      CornerRadius = (0,@ShapeFull,@ShapeFull,0),
                      Padding      = (6,8,8,8) ] {
                    Shape [ Geometry = @ChevronDown, Fill = @OnSurfaceVariant, Width = 12, Height = 12, VerticalAlignment = Center ]
                }
            }
        }
        when ( PART_Primary.IsMouseOver ) { PART_PrimaryState.Background = @OnSurfaceVariantHoverLayer; }
        when ( PART_Primary.IsPressed ) { PART_PrimaryState.Background = @OnSurfaceVariantPressLayer; }
        when ( PART_Arrow.IsMouseOver ) { PART_ArrowState.Background = @OnSurfaceVariantHoverLayer; }
        when ( PART_Arrow.IsPressed ) { PART_ArrowState.Background = @OnSurfaceVariantPressLayer; }
        when ( IsEnabled = false ) { PART_Primary.Opacity = @DisabledContentOpacity; PART_Arrow.Opacity = @DisabledContentOpacity; }
    }
    // Dropdown chrome (single-part) — adopted when the split button has NO
    // Command, so the whole button is one hit region that opens the popup.
    // One rounded Border (no primary/arrow divide), content + chevron inline;
    // PART_Primary is the whole surface (the control wires it; there's no
    // PART_Arrow in this variant).
    Template x:key="DefaultToolBarDropdownTrigger" [TargetType = ToolBarSplitButton] {
        Border x:name="PART_Primary"
            [ Background      = @SurfaceContainerHigh,
              CornerRadius    = @ShapeFull,
              BorderThickness = (0) ] {
            Border x:name="PART_PrimaryState"
                [ Background   = #00000000,
                  CornerRadius = @ShapeFull,
                  Padding      = (12,8,10,8) ] {
                StackPanel [ Orientation = Horizontal, VerticalAlignment = Center ] {
                    Border x:name="PART_Content" [ HorizontalAlignment = Center, VerticalAlignment = Center ]
                    Shape [ Geometry = @ChevronDown, Fill = @OnSurfaceVariant, Width = 12, Height = 12, VerticalAlignment = Center, Margin = (6,0,0,0) ]
                }
            }
        }
        when ( PART_Primary.IsMouseOver ) { PART_PrimaryState.Background = @OnSurfaceVariantHoverLayer; }
        when ( PART_Primary.IsPressed ) { PART_PrimaryState.Background = @OnSurfaceVariantPressLayer; }
        when ( IsEnabled = false ) { PART_Primary.Opacity = @DisabledContentOpacity; }
    }
    // Popup chrome — MenuPopupHost positions PART_PopupContainer below the
    // primary half; ItemsPresenter renders the MenuItem children.
    Template x:key="DefaultToolBarSplitPopup" [TargetType = ToolBarSplitButton] {
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupContainer"
                [ Background      = @SurfaceContainerHigh,
                  BorderBrush     = @OutlineVariant,
                  BorderThickness = (1),
                  CornerRadius    = @ShapeExtraSmall,
                  Effect          = @Elevation2,
                  Padding         = (4) ] {
                ItemsPresenter
            }
        }
        when ( ThemeManager.PrefersContrast = More ) { PART_PopupContainer.BorderThickness = (2); }
    }
    Style [TargetType = ToolBarSplitButton] {
        Template = @DefaultToolBarSplitPopup;
        TriggerTemplate = @DefaultToolBarSplitTrigger;
        // No Command → degenerate to a single-chrome dropdown (one hit region,
        // whole button opens the popup). The control re-adopts on the swap.
        when ( Command is unset ) { TriggerTemplate = @DefaultToolBarDropdownTrigger; }
        ItemsPanel = @DefaultToolBarMenuPanel;
        VerticalAlignment = Center;
        // Toolbar ink for slotted content — a bare icon Shape in the
        // primary Content paints through effectiveFill's inherited-
        // Foreground fallback (same as ToolBarButton).
        TextBlock.Foreground = @OnSurfaceVariant;
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
    // Chrome is borderless + fill-free by default: the connected-bar
    // buttons carry their own @SurfaceContainerHigh chrome and rounded
    // group ends (via ToolBarButton.Position), so an outlined @Surface box
    // around the strip just reads as a redundant rectangle — especially
    // when several ToolBars sit side by side. The bar therefore blends into
    // whatever surface hosts it and only the button pills show. High
    // contrast re-instates a 1px outline so the strip stays delineated for
    // users who need the edge cue. BorderBrush stays declared so that
    // trigger has a stroke to switch on.
    Template x:key="DefaultToolBar" [TargetType = ToolBar] {
        Border x:name="PART_Border"
            [ BorderBrush     = @Outline,
              BorderThickness = (0),
              Padding         = (4) ] {
            DockPanel x:name="PART_Layout" [ LastChildFill = true ] {
                Button x:name="PART_Chevron" [ DockPanel.Dock = Right ] {
                    TextBlock [ Text = "⋯" ]
                }
                ItemsPresenter x:name="PART_ItemsPresenter"
            }
        }

        when ( ThemeManager.PrefersContrast = More ) { PART_Border.BorderThickness = (1); }
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
