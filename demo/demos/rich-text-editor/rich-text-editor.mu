import RichTextEditorVM from "./rich-text-editor-vm.mjs"

// rich-text-editor.mu — a live RichTextBox over a FlowDocument authored
// entirely in markup (mixed inline content: quoted strings are Runs, bare
// identifiers like Bold / Italic are inline elements; List / ListItem are
// block elements). The formatting toolbar's buttons are wired to the
// editor's public editing commands by the bootstrap behaviour on mount.

resources RichTextEditorDemo {
    DataTemplate [DataType = RichTextEditorVM] {
        Border x:root [ Fill = @Surface ] {
            DockPanel {
                // ── Header ─────────────────────────────────────────
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (20,14,20,14) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "Rich text editor",
                              FontSize   = 18,
                              FontWeight = Bold,
                              Foreground = @OnPrimary ]
                        TextBlock
                            [ Text       = "Click in, select text, and format with the toolbar or Ctrl+B / Ctrl+I / Ctrl+U. Enter splits a paragraph; Tab / Shift+Tab indent and outdent list items.",
                              FontSize    = 12,
                              Foreground  = @OnPrimary,
                              TextWrapping = Wrap,
                              Margin      = (0,4,0,0) ]
                    }
                }

                // ── Formatting toolbar ─────────────────────────────
                Border
                    [ DockPanel.Dock = Top,
                      Fill      = @SurfaceContainerLow,
                      Padding         = (16,8,16,8) ] {
                    StackPanel [ Orientation = Horizontal ] {
                        Button x:name="BoldBtn"      [ Variant = Tonal ]                    { TextBlock [ Text = "B", FontWeight = Bold, FontSize = 15 ] }
                        Button x:name="ItalicBtn"    [ Variant = Tonal, Margin = (6,0,0,0) ]  { TextBlock [ Text = "I", FontStyle = Italic, FontSize = 15 ] }
                        Button x:name="UnderlineBtn" [ Variant = Tonal, Margin = (6,0,0,0) ]  { TextBlock [ Text = "U", TextDecorations = Underline, FontSize = 15 ] }
                        Button x:name="IndentBtn"    [ Variant = Outlined, Margin = (16,0,0,0) ] { TextBlock [ Text = "Indent" ] }
                        Button x:name="OutdentBtn"   [ Variant = Outlined, Margin = (6,0,0,0) ]  { TextBlock [ Text = "Outdent" ] }
                    }
                }
                Line
                    [ DockPanel.Dock = Top,
                      Orientation    = Horizontal,
                      Stroke         = (@OutlineVariant, 1) ]

                // ── Editor surface ─────────────────────────────────
                // The FlowDocument is authored inline; the RichTextBox
                // normalises it on load and drives all editing from here.
                Border [ Padding = (28,24,28,24) ] {
                    RichTextBox x:name="Editor" [ VerticalAlignment = Top, FontSize = 15 ] {
                        FlowDocument {
                            Paragraph { "Rich text editing in " Bold { "@pragmatic-lab/mural" } "." }
                            Paragraph {
                                "Select any text and toggle "
                                Bold { "bold" } ", " Italic { "italic" } ", or " Underline { "underline" }
                                ". Press Enter to start a new paragraph, and keep typing to edit."
                            }
                            List [ MarkerStyle = Disc ] {
                                ListItem { Paragraph { "A bulleted list item" } }
                                ListItem { Paragraph { "Put the caret here and press Tab to nest it, Shift+Tab to outdent" } }
                            }
                            List [ MarkerStyle = Decimal ] {
                                ListItem { Paragraph { "An ordered item" } }
                                ListItem { Paragraph { "Another ordered item" } }
                            }
                        }
                    }
                }
            }
        }
    }
}
