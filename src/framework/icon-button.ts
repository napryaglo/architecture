import { Model, Element } from '../runtime/index.js';
import { Button } from './button.js';

// M3 Icon Button — square 40×40 button whose Content is a glyph
// (TextBlock with an icon font, or a custom Visual). Extends Button
// so the Click protocol, Command wiring, IsPressed / IsMouseOver
// machinery, and Variant DP all come for free.
//
// Four M3 variants reuse the inherited ButtonVariant enum:
//   * Filled    — Primary container + OnPrimary glyph
//   * Tonal     — SecondaryContainer + OnSecondaryContainer glyph
//   * Outlined  — transparent + 1-DIP outline + OnSurfaceVariant glyph
//   * Standard  — fully transparent + OnSurfaceVariant glyph
//
// Default chrome:
//   * 40×40 touch target (Coarse pointer bumps to 48×48 via the
//     adaptive trigger in the template).
//   * @ShapeFull shape — pill at the chrome's true min(W,H)/2 = 20dp.
//   * No padding around the glyph; the Width / Height pin the size.
//
// Authoring shape:
//
//   const close = new IconButton(new TextBlock('×'));
//   close.Variant = ButtonVariant.Standard;
//
// Or in markup:
//
//   IconButton [Variant = Standard] { TextBlock [Text = "×"] }
//
// Variant defaults to Filled (inherited from Button). Use
// `Variant = Standard` for low-emphasis chrome-less icons (the most
// common icon-button shape in M3 — close buttons, toolbar icons).
export class IconButton extends Button
{
    static
    {
        // IconButton instances resolve their own default Style — the
        // theme dictionary holds `Style[TargetType=IconButton]` keyed
        // by the IconButton class function.
        Model.OverrideMetadata(IconButton, Element.DefaultStyleKeyKey, { default_value: IconButton });
    }
}
