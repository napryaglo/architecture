import { Element, MuralBase } from '../../runtime/index.js';
import { IconButton } from '../buttons/icon-button.js';

// PanelButton — the rounded-rectangle icon button for shell panel headers
// (the pop-out / collapse / add affordances in a ShellSideContentPane's
// Commands slot). Extends IconButton, so the Click / Command / IsPressed
// machinery and the glyph Content slot come for free.
//
// The only difference from a bare IconButton is chrome, and it lives on
// the default Style (shell.template.mu, `Style[TargetType=PanelButton]`):
// the Standard (chrome-less, transparent-at-rest) fill plus a small
// @ShapeSmall (8dp) corner instead of IconButton's @ShapeFull circle —
// the rounded-square look. That Style reuses the Standard IconButton
// template verbatim (PanelButton IS an IconButton, so a
// [TargetType=IconButton] template applies) and rides the template's
// `$$CornerRadius` TemplateBinding to reshape the corner.
//
// Authoring shape:
//
//   PanelButton [ Command = $PopOutCommand ] {
//       Shape [ Geometry = @IconPopOut, Fill = @OnSurfaceVariant, Width = 16, Height = 16 ]
//   }
export class PanelButton extends IconButton
{
    static
    {
        // PanelButton instances resolve their own default Style — the
        // shell dictionary holds `Style[TargetType=PanelButton]` keyed by
        // this class function. Without this override applyDefaultStyle()
        // (run from Button's ctor) would resolve the IconButton Style and
        // render a circle.
        MuralBase.OverrideMetadata(PanelButton, Element.DefaultStyleKeyKey, { default_value: PanelButton });
    }
}
