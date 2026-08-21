import { MetaData, MuralBase, Element } from '../../runtime/index.js';
import { Button } from './button.js';

// Material 3 FloatingActionButton size variants.
//
// Mural authoring conventions:
//   * The 3 icon-only sizes (Small / Default / Large) are pure chrome
//     overrides — same Content shape, just a different width / height /
//     corner radius / glyph size.
//   * Extended is structurally the same Visual tree but slots a label
//     beside the icon. Mural models it as a fourth Size value rather
//     than a subclass so consumers can flip an existing FAB into and
//     out of its labelled form by writing one DP (e.g. the M3 pattern
//     where the FAB collapses to icon-only on scroll). The Extended
//     template's Content slot takes a StackPanel/Grid; the icon-only
//     templates take a single icon Visual.
export enum FabSize
{
    Small    = 'Small',
    Default  = 'Default',
    Large    = 'Large',
    Extended = 'Extended',
}

// M3 Floating Action Button — a primary screen-level action surface.
//
// Extends `Button` to inherit:
//   * The Click protocol (Command / ClickHandlers / OnClick).
//   * IsPressed / IsMouseOver bookkeeping (drag-off, drag-back).
//   * ICommandSource wiring (CanExecute gate, CanExecuteChanged refresh).
//
// FAB-specific surface:
//   * `Size` DP (small / default / large / extended) — drives the default
//     Style's Template-picker trigger chain in framework.resources.mu.
//
// FAB is monomorphic on container colour (M3 ships a single "Surface FAB"
// chrome — Primary container, OnPrimary ink), so there's no Variant DP
// like there is on Button. If M3 adds tonal / outlined FAB variants
// later, a Variant DP layered on Size handles that without breaking the
// Size contract.
//
// Default chrome (per M3 spec):
//   * Container: @PrimaryContainer
//   * Ink:       @OnPrimaryContainer
//   * Elevation: @ElevationLevel3 at rest, bumped to @ElevationLevel4
//     on hover. Press keeps Level3 and overlays the press state layer.
//
// Size table (M3 reference):
//   * Small    : 40dp × 40dp, @ShapeMedium (12dp corners)
//   * Default  : 56dp × 56dp, @ShapeLarge (16dp corners)
//   * Large    : 96dp × 96dp, @ShapeExtraLarge (28dp corners)
//   * Extended : 56dp tall, content-driven width, @ShapeLarge (16dp)
//                — slot accepts an icon-then-label Visual (typically a
//                StackPanel { Orientation = Horizontal }).
export class FloatingActionButton extends Button
{
    public static readonly SizeKey = MuralBase.RegisterProperty<FabSize>(
        FloatingActionButton, 'Size', FabSize.Default, MetaData.None,
    );

    static
    {
        // FloatingActionButton instances resolve their own default Style
        // — the theme dictionary holds Style[TargetType=FloatingActionButton]
        // keyed by the FloatingActionButton class function.
        MuralBase.OverrideMetadata(
            FloatingActionButton,
            Element.DefaultStyleKeyKey,
            { default_value: FloatingActionButton },
        );
    }

    public get Size():  FabSize { return this.get_property_value(FloatingActionButton.SizeKey); }
    public set Size(v: FabSize) { this.set_property_value(FloatingActionButton.SizeKey, v); }
}
