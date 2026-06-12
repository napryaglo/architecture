import {
    MetaData,
    Model,
    Visual,
    type PointerEventArgs,
} from '../runtime/index.js';
import { IconButton } from './icon-button.js';

// M3 Icon Button Toggle — an `IconButton` whose chrome flips between an
// "unchecked" and a "checked" state on every click. Mirrors what
// `ToggleButton` does for plain `Button`. The IsChecked DP + the
// pre-click flip are reimplemented here rather than inheriting from
// `ToggleButton` because single-inheritance forces a choice between
// `IconButton` (the 40×40 + variant-chrome contract) and `ToggleButton`
// (the checked-state contract). Keeping `IconButtonToggle extends
// IconButton` keeps `instanceof IconButton` working for code that
// branches on icon-button shape.
//
// State semantics (mirrors ToggleButton):
//   * Click flips IsChecked BEFORE firing Command / handlers / OnClick,
//     so the post-flip state is what consumers observe.
//   * Direct assignment to IsChecked does NOT fire Click.
//
// M3 unchecked → checked colour deltas per variant (see
// framework.resources.mu's `DefaultXxxIconButtonToggle` templates):
//
//   Filled    : SurfaceContainerHighest / OnSurfaceVariant → Primary / OnPrimary
//   Tonal     : SurfaceContainerHighest / OnSurfaceVariant → SecondaryContainer / OnSecondaryContainer
//   Outlined  : transparent + outline / OnSurfaceVariant   → InverseSurface (no border) / InverseOnSurface
//   Standard  : transparent / OnSurfaceVariant             → transparent / Primary
export class IconButtonToggle extends IconButton
{
    public static readonly IsCheckedKey = Model.RegisterProperty<boolean>(
        IconButtonToggle, 'IsChecked', false, MetaData.Render,
    );

    static
    {
        // Resolve `Style[TargetType=IconButtonToggle]` from the active
        // theme, not the parent IconButton style.
        Model.OverrideMetadata(
            IconButtonToggle,
            Visual.DefaultStyleKeyKey,
            { default_value: IconButtonToggle },
        );
    }

    public get IsChecked():  boolean { return this.get_property_value(IconButtonToggle.IsCheckedKey); }
    public set IsChecked(v: boolean) { this.set_property_value(IconButtonToggle.IsCheckedKey, v); }

    // Flip IsChecked at the pre-click stage so Command / ClickHandlers /
    // OnClick all observe the post-toggle state. Same wiring as
    // ToggleButton.OnPreClick.
    protected override OnPreClick(_args: PointerEventArgs): void
    {
        this.IsChecked = !this.IsChecked;
    }
}
