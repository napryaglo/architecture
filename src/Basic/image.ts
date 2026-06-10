import { MetaData, Model, Rect, Size, Visual, type DrawingContext } from '../runtime/index.js';
import { ImageSource, Stretch } from '../visual-engine/index.js';

// Image control — paints an ImageSource into its layout slot, scaled
// according to Stretch. WPF parity for System.Windows.Controls.Image.
//
// Layout:
//   * MeasureOverride returns Source.NaturalSize when the source has
//     populated it; otherwise Size.Zero. Explicit Width / Height on
//     Visual override this in the usual way.
//   * ArrangeOverride returns finalSize unchanged — the image fills
//     whatever rect the parent assigned.
//
// Render:
//   * RenderOverride calls dc.DrawImage(Source, RenderSize, Stretch).
//     The DC (and the host renderer below it) is responsible for
//     fetching / decoding / rasterizing the source.
//
// Out of scope for v1:
//   * Async decode hook that auto-populates Source.NaturalSize. Consumers
//     that want layout to size to the bitmap currently set NaturalSize
//     explicitly when constructing the BitmapImage.
//   * Tinting / colour transforms — consumers needing those wrap the
//     image in a sibling Brush layer or a future Effect.
export class Image extends Visual
{
    public static readonly SourceKey  = Model.RegisterProperty<ImageSource | undefined>(
        Image, 'Source', undefined, MetaData.Measure | MetaData.Render);
    public static readonly StretchKey = Model.RegisterProperty<Stretch>(
        Image, 'Stretch', Stretch.Uniform, MetaData.Render);

    constructor(source?: ImageSource)
    {
        super();
        if (source !== undefined) this.Source = source;
    }

    public get Source(): ImageSource | undefined { return this.get_property_value(Image.SourceKey); }
    public set Source(value: ImageSource | undefined) { this.set_property_value(Image.SourceKey, value); }

    public get Stretch(): Stretch { return this.get_property_value(Image.StretchKey); }
    public set Stretch(value: Stretch) { this.set_property_value(Image.StretchKey, value); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        const src = this.Source;
        if (src === undefined) return Size.Zero;
        // Source's NaturalSize is the intrinsic image dimensions if the
        // consumer (or a future decode hook) set them. When unset, return
        // zero so the explicit Width/Height on Visual (or a Stretch slot
        // from the parent) drives layout entirely.
        return src.NaturalSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const src = this.Source;
        if (src === undefined) return;
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;
        dc.DrawImage(src, new Rect(0, 0, size.Width, size.Height), this.Stretch);
    }
}
