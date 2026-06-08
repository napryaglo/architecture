import TextBoxVM from "./text-box-vm.mjs"

// text-box.mu — TextBox overflow showcase.
//
// Three fields demonstrating the overflow behaviours we ship:
//   * Single-line "Name" field whose text scrolls horizontally beneath
//     a clip when it exceeds the field width.
//   * Multi-line "Notes (soft-wrap)" — default TextWrapping=Wrap. Long
//     lines break at word boundaries; only vertical scroll is enabled.
//   * Multi-line "Notes (no-wrap)" — TextWrapping=NoWrap. Long lines
//     extend horizontally and both scrollbars come up.
//
// All scrollbars are auto-hide (IsAutoHideScrollBars=true on the inner
// ScrollViewer) so they appear on scroll activity and fade out after
// ~1.5 s idle.
//
// Packaged as a DataTemplate keyed off TextBoxVM so the demo platform's
// ContentControl auto-resolves it when PlatformVM.Content is set to a
// TextBoxVM instance.

ResourceDictionary {
    DataTemplate x:key="TextBoxTemplate" [DataType=TextBoxVM] {
        Border [Background=@Surface, BorderBrush=@OutlineVariant,
                BorderThickness=(1)]{

            // Header + body via a vertical DockPanel so the header gets
            // its natural height and the editor area fills the rest.
            DockPanel{
                // Header strip
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="TextBox demo — single-line + multi-line",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@OnPrimary]
                }

                // Two-up split: single-line on the left, multi-line on
                // the right. Both share the available residual height
                // via a horizontal StackPanel filling the LastChildFill
                // slot of the dock.
                StackPanel[Orientation=Horizontal]{

                    // Single-line: long text scrolls invisibly with the
                    // caret. No scrollbar — matches native <input>.
                    StackPanel[Orientation=Vertical, Width=300, Margin=(16,16,8,16)]{
                        TextBlock[Text="Single-line:",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,6)]
                        TextBox [Width=260,
                                 Text="This is a single-line TextBox whose content overflows the field width."]
                        TextBlock[Text="No scrollbar. Type / Home / End — text follows the caret.",
                                  FontSize=11, Foreground=@OnSurfaceVariant,
                                  Margin=(0,8,0,0)]
                    }

                    // Multi-line WRAP — long lines break at word
                    // boundaries; only vertical scroll is enabled.
                    StackPanel[Orientation=Vertical, Width=300, Margin=(8,16,8,16)]{
                        TextBlock[Text="Multi-line — Wrap:",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,6)]
                        TextBox [Width=280, Height=160,
                                 AcceptsReturn=true,
                                 Text="Default wrap mode: this paragraph is long enough that it should break across several visual lines at word boundaries. ArrowDown moves down visual rows.\nA hard newline starts a new logical line that also wraps on overflow."]
                        TextBlock[Text="Word-wrap. Resize the column to see lines re-flow.",
                                  FontSize=11, Foreground=@OnSurfaceVariant,
                                  Margin=(0,8,0,0)]
                    }

                    // Multi-line NO-WRAP — lines extend horizontally,
                    // both scrollbars come up. Code-editor feel.
                    StackPanel[Orientation=Vertical, Width=300, Margin=(8,16,16,16)]{
                        TextBlock[Text="Multi-line — NoWrap:",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,6)]
                        TextBox [Width=280, Height=160,
                                 AcceptsReturn=true,
                                 AcceptsTab=true,
                                 TextWrapping=NoWrap,
                                 Text="function example() {\n    const longLineThatWillNotWrap = 'extends past the viewport horizontally';\n    return longLineThatWillNotWrap;\n}"]
                        TextBlock[Text="Both axes scroll; lines never break.",
                                  FontSize=11, Foreground=@OnSurfaceVariant,
                                  Margin=(0,8,0,0)]
                    }
                }
            }
        }
    }
}
