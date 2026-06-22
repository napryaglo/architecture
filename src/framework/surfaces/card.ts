import { MetaData, Model, Element, Visual } from '../../runtime/index.js';
import { ContentControl } from '../base/content-control.js';

// Material 3 Card variants. Each variant ships its own ControlTemplate
// in basic.resources.mu; the default Card Style picks the template that
// matches the Variant DP value via a property trigger.
//
// The three variants distinguish themselves by container colour +
// border + resting elevation, NOT by interaction surface — every Card
// variant gets the same hover / press treatment (elevation +1 on hover,
// state-layer overlay tint over the resting container).
//
// Filled is the M3 baseline and the default value.
export enum CardVariant
{
    Filled   = 'Filled',
    Elevated = 'Elevated',
    Outlined = 'Outlined',
}

// M3 Card — a surface-tinted container that frames a primary piece of
// content. Mural's Card extends ContentControl (NOT Button) — cards
// don't fire Click; they're presentation surfaces. Interactive cards
// in M3 are still ContentControls — the press / hover state-layer
// chrome rides on the generic IsMouseOver / IsPressed DPs that
// InputManager flips for any visual under the pointer.
//
// What Card adds on top of ContentControl:
//   * Variant DP (Filled / Elevated / Outlined) — drives the default
//     Style's Template-picker trigger chain in basic.resources.mu.
//
// Default chrome per variant (M3 spec):
//   * Filled   : @SurfaceContainerHighest, no border, @ShapeMedium,
//                no resting Effect
//   * Elevated : @SurfaceContainerLow,     no border, @ShapeMedium,
//                resting Effect = @ElevationLevel1
//   * Outlined : @Surface, 1-DIP @Outline border, @ShapeMedium,
//                no resting Effect
//
// Hover / press behaviour (all variants):
//   * Hover bumps Effect to one level above resting (so Filled /
//     Outlined go Level0 → Level1, Elevated goes Level1 → Level2) and
//     composites @StateHoverOverlay over the resting container.
//   * Press composites @StatePressOverlay and lowers Effect back to the
//     resting value (matches M3's "press = recession" cue).
//
// Authoring shape:
//
//   const card = new Card();
//   card.Variant = CardVariant.Elevated;
//   card.Content = new StackPanel(...);
//
// Or in markup:
//
//   Card [Variant = Outlined] { TextBlock [Text = "Hello"] }
export class Card extends ContentControl
{
    public static readonly VariantKey = Model.RegisterProperty<CardVariant>(
        Card, 'Variant', CardVariant.Filled, MetaData.None,
    );

    static
    {
        // Card instances resolve their own default Style — the theme
        // dictionary holds Style[TargetType=Card] keyed by the Card
        // class function.
        Model.OverrideMetadata(Card, Element.DefaultStyleKeyKey, { default_value: Card });
    }

    constructor(content?: Visual)
    {
        super();
        if (content !== undefined) this.Content = content;
        this.applyDefaultStyle();
    }

    public get Variant():  CardVariant { return this.get_property_value(Card.VariantKey); }
    public set Variant(v: CardVariant) { this.set_property_value(Card.VariantKey, v); }
}
