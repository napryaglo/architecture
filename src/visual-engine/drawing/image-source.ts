import { MetaData, Model } from '../../runtime/index.js';
import { Size } from '../primitives.js';

// How an Image's source bitmap fills its layout slot. Mirrors WPF's
// Stretch enum (System.Windows.Media.Stretch). The SVG renderer
// translates these to `preserveAspectRatio` values.
export enum Stretch
{
    /** No stretching. Image renders at its NaturalSize, anchored at the
     *  slot's top-left. Slot dimensions beyond NaturalSize stay empty. */
    None          = 'none',
    /** Fills the slot, distorting aspect ratio if needed. */
    Fill          = 'fill',
    /** Scales to fit the slot while preserving aspect ratio. The slot may
     *  have letterbox / pillarbox bands on one axis. */
    Uniform       = 'uniform',
    /** Scales to fill the slot while preserving aspect ratio. Excess
     *  pixels on one axis are clipped at the slot edges. */
    UniformToFill = 'uniformToFill',
}

// Abstract source for an Image's pixels. Concrete subclasses surface the
// URI (or bytes) and the intrinsic dimensions. Modeled on WPF's
// ImageSource — mural's v1 only ships BitmapImage, but the abstraction
// keeps room for DrawingImage / RenderTargetBitmap later without
// changing the Image control's API.
//
// NaturalSize is exposed as a Model DP so it participates in change
// notification — when the source's intrinsic dimensions become known
// (e.g. a future async-decode hook fires), every Image bound to it can
// invalidate measure through the binding plumbing.
export abstract class ImageSource extends Model
{
    public static readonly NaturalSizeKey = Model.RegisterProperty<Size>(
        ImageSource, 'NaturalSize', Size.Zero, MetaData.None);

    public get NaturalSize(): Size { return this.get_property_value(ImageSource.NaturalSizeKey); }
    public set NaturalSize(value: Size) { this.set_property_value(ImageSource.NaturalSizeKey, value); }

    /** URI the renderer should fetch. Concrete subclasses surface it as
     *  whatever string the host environment accepts — http/https URL,
     *  data URI, blob URL, etc. */
    public abstract get Uri(): string;
}

// A bitmap loaded from a URI. The URI can be:
//   * `http(s)://…`     — fetched by the browser
//   * `data:image/…`    — inline base64 data
//   * `blob:…`          — Blob URL (e.g. from a File API consumer)
//
// No decoding happens here; the renderer hands the URI straight to the
// host (SVG `<image href>`, canvas `drawImage`, etc.). NaturalSize stays
// at Size.Zero until the consumer assigns it explicitly — future
// versions can decode the source asynchronously and populate NaturalSize
// automatically.
export class BitmapImage extends ImageSource
{
    public static readonly UriKey = Model.RegisterProperty<string>(
        BitmapImage, 'Uri', '', MetaData.None);

    constructor(uri?: string, naturalSize?: Size)
    {
        super();
        if (uri !== undefined)         this._set_property_value_by_name('Uri', uri);
        if (naturalSize !== undefined) this.NaturalSize = naturalSize;
    }

    public get Uri(): string { return this.get_property_value(BitmapImage.UriKey); }
    public set Uri(value: string) { this.set_property_value(BitmapImage.UriKey, value); }
}
