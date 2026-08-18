import RichTextBlockVM from "./rich-text-block-vm.mjs"

// rich-text-block.mu — a read-only RichTextBlock over a FlowDocument
// authored entirely in markup. It showcases two things the block-tier
// text host does that a plain TextBlock can't:
//
//   * Mixed inline text styles — Bold / Italic / Underline convenience
//     spans, plus arbitrary Span overrides for Foreground colour, FontSize,
//     and combined bold-italic — all reflowing together inside one
//     wrapping paragraph.
//   * Inline chips — a Chip embedded mid-sentence via InlineUIContainer.
//     RichTextBlock probes each embedded object's first-text baseline and
//     sits it on the line baseline, so a chip's label reads level with the
//     surrounding copy while the pill hangs below (baseline alignment, not
//     a crude middle-align).

resources RichTextBlockDemo {
    DataTemplate [DataType = RichTextBlockVM] {
        Border x:root [ Fill = @Surface ] {
            DockPanel {
                // ── Header ─────────────────────────────────────────
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (20,14,20,14) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "Rich text block",
                              FontSize   = 18,
                              FontWeight = Bold,
                              Foreground = @OnPrimary ]
                        TextBlock
                            [ Text         = "A read-only RichTextBlock: mixed inline styles and baseline-aligned chips flowing over one FlowDocument.",
                              FontSize      = 12,
                              Foreground    = @OnPrimary,
                              TextWrapping  = Wrap,
                              Margin        = (0,4,0,0) ]
                    }
                }

                // ── Showcase surface ───────────────────────────────
                // MaxWidth keeps the measure line readable; the RichTextBlock
                // wraps to whatever finite width it's given.
                Border [ Padding = (28,24,28,24) ] {
                    RichTextBlock
                        [ VerticalAlignment  = Top,
                          HorizontalAlignment = Left,
                          MaxWidth            = 560,
                          FontSize            = 15 ] {
                        FlowDocument {
                            // Heading — a single coloured, oversized, bold Span.
                            Paragraph {
                                Span [ FontSize = 24, FontWeight = Bold, Foreground = @Primary ] { "One flow, many styles" }
                            }

                            // Body — every convenience span plus arbitrary
                            // Span overrides, all reflowing on shared lines.
                            Paragraph {
                                "This paragraph mixes "
                                Bold { "bold" } ", "
                                Italic { "italic" } ", "
                                Underline { "underlined" } ", and "
                                Span [ FontWeight = Bold, FontStyle = Italic ] { "bold-italic" }
                                " runs. It also carries "
                                Span [ Foreground = @Error ] { "coloured" }
                                " and "
                                Span [ FontSize = 21, Foreground = @Tertiary ] { "larger" }
                                " text — the line box grows to fit the tallest run and the rest sit on the same baseline."
                            }

                            // Inline chips — embedded mid-sentence, baseline
                            // aligned with the surrounding text.
                            Paragraph {
                                "Chips embed inline too — filter by "
                                InlineUIContainer { Chip [ Kind = Assist ] { TextBlock [ Text = "Design" ] } }
                                " "
                                InlineUIContainer { Chip [ Kind = Assist ] { TextBlock [ Text = "Engineering" ] } }
                                " or a selected "
                                InlineUIContainer { Chip [ Kind = Filter, IsChecked = true ] { TextBlock [ Text = "Favorites" ] } }
                                " chip. Each Chip is wrapped in an InlineUIContainer, and its label baseline lands on the text baseline while the pill hangs below."
                            }

                            // Closing note — a smaller, muted caption run.
                            Paragraph {
                                Span [ FontSize = 12, Foreground = @OnSurfaceVariant ] {
                                    "All of the above is authored declaratively as a FlowDocument of Paragraphs, Runs, Spans, and InlineUIContainers — no per-run layout code."
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
