// Default template for PageView — a Material "page" chrome: bold title
// (with on-demand subtitle), 1-DIP divider, then the slottable Content
// area, all laid out with a DockPanel so the Content fills the residue.
//
// The subtitle TextBlock is NOT in this template — PageView's TS code
// adds it to PART_HeaderStack on demand when the Subtitle DP is
// non-empty, and removes it otherwise. Authoring it as a runtime add
// keeps an empty Subtitle from reserving vertical space for an
// invisible row.
//
// Template parts:
//   * PART_Dock              — the outer DockPanel.
//   * PART_Header            — top-docked header strip (Border).
//   * PART_HeaderStack       — vertical stack holding title (and the
//                              subtitle if PageView decides to attach
//                              it).
//   * PART_TitleText         — bold heading.
//   * PART_Divider           — 1-DIP hairline.
//   * PART_ContentHost       — the LastChildFill Border that hosts the
//                              consumer's Content via PART_Content.
//   * (ContentPresenter is named-less; ControlTemplate.Apply discovers
//     it via its first-presenter walk and PageView routes Content
//     through it.)

ResourceDictionary {
    template x:key="DefaultPageView"[targettype=PageView]{
        DockPanel x:name="PART_Dock"{
            Border x:name="PART_Header" [ DockPanel.Dock = Top,
                                          Padding        = (20,16,20,12) ]{
                StackPanel x:name="PART_HeaderStack" [ Orientation = Vertical ]{
                    TextBlock x:name="PART_TitleText"
                              [ Foreground = #0f172a,
                                FontSize   = 18,
                                FontWeight = Bold ]
                }
            }
            Border x:name="PART_Divider" [ DockPanel.Dock  = Top,
                                           Background      = #e2e8f0,
                                           BorderThickness = (0),
                                           Height          = 1 ]
            Border x:name="PART_ContentHost" [ Padding = (0) ]{
                ContentPresenter
            }
        }
    }
}
