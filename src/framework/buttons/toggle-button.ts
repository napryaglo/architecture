import {
    MetaData,
    MuralBase,
    type PointerEventArgs,
} from '../../runtime/index.js';
import { Button } from './button.js';

// ToggleButton — Button that tracks an `IsChecked` state, flipping it
// on every click. Mirrors WPF's ToggleButton: CheckBox and RadioButton
// both descend from it; here we ship it as a concrete control that the
// toolbar (ToolBarToggleButton) and future controls (CheckBox / Switch
// in the gallery) can build on.
//
// State semantics:
//   * `IsChecked` is a plain boolean (no nullable / indeterminate tri-
//     state in v1 — CheckBox can layer that on later).
//   * Click flips IsChecked BEFORE firing the Command / handlers / OnClick
//     so the protocol sees post-flip state. Reading IsChecked from a
//     ClickHandler or a Command body returns the new value.
//   * Direct assignment to IsChecked (`tb.IsChecked = true`) does NOT
//     fire Click — the click protocol is exclusively pointer-driven.
//     Programmatic state changes are silent toward click consumers
//     (binding sources still get a property-change notification).
//
// Visual: this base class doesn't ship a default template; consumers
// either apply their own ControlTemplate or subclass it (the toolbar's
// ToolBarToggleButton does) — same model as plain Button before its
// theme template was added.
export class ToggleButton extends Button
{
    // BindsTwoWayByDefault for WPF parity: WPF's ToggleButton.IsChecked binds
    // TwoWay by default, so a `IsChecked = $Flag` binding round-trips (click →
    // source) without an explicit Mode. Matches TextBox.Text / Slider.Value /
    // Selector.SelectedItem, which already declare it.
    public static readonly IsCheckedKey = MuralBase.RegisterProperty<boolean>(
        ToggleButton, 'IsChecked', false, MetaData.Render | MetaData.BindsTwoWayByDefault,
    );

    public get IsChecked():  boolean { return this.get_property_value(ToggleButton.IsCheckedKey); }
    public set IsChecked(v: boolean) { this.set_property_value(ToggleButton.IsCheckedKey, v); }

    // Flip IsChecked at the pre-click stage so Command / ClickHandlers /
    // OnClick all see the post-toggle state — matches WPF, where a
    // Click handler reading IsChecked sees the new value.
    protected override OnPreClick(_args: PointerEventArgs): void
    {
        this.IsChecked = !this.IsChecked;
    }
}
