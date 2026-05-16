import { APPROXIMATE_TEXT_MEASURER, MetaData, Model } from '../runtime/index.js';
import type { TextMeasurer, Visual, VisualHost } from '../runtime/index.js';
import type { Brush } from './brush.js';

// Abstract base for the scene-description-plus-host-bridge classes
// (HtmlTarget, FileTarget, …). Follows the WPF
// PresentationSource pattern: one class per host environment, sharing a
// common scene description on the Model layer. Named "Target" rather
// than "Source" because in our split this class also fulfills WPF's
// CompositionTarget role — it's both where the Visual tree is hosted
// and where pixels are written.
//
// The base carries the renderer-agnostic state: Width, Height, Content
// (root Visual), Background, DeviceScale. Concrete subclasses add the
// host-specific concerns — HtmlTarget owns the DOM mount +
// resize observer + event delegate; FileTarget owns the
// output target + Save() method; etc. Each concrete subclass also
// picks and instantiates its renderer internally (SvgRenderer,
// CanvasRenderer, PdfRenderer, …) so the user constructs one object
// instead of pairing two.
//
// PresentationTarget is a Model (not a Visual) so its properties
// participate in the binding/change-notification system — the subclass's
// renderer subscribes to Width/Height to know when to re-measure and to
// Content to know when the visual root was replaced. There is NO
// parent/child relationship between PresentationTarget and Content;
// assigning the same Visual to two PresentationTargets is undefined
// behavior.
//
// MetaData flags on the properties are advisory only — Model's
// OnPropertyChanged is a no-op, so Mark*Dirty does not auto-fire.
// Subclasses' renderers subscribe via AddPropertyChangedListener.
//
// Coordinate system matches the rest of the engine: top-left origin,
// y-down, DIPs. DeviceScale multiplies DIPs to get device pixels for
// raster output (defaults to 1; HtmlTarget typically reads
// window.devicePixelRatio at construction and assigns it).
export abstract class PresentationTarget extends Model implements VisualHost
{
    static {
        Model.RegisterProperty(PresentationTarget, 'Width',       0,         MetaData.Measure);
        Model.RegisterProperty(PresentationTarget, 'Height',      0,         MetaData.Measure);
        Model.RegisterProperty(PresentationTarget, 'DeviceScale', 1,         MetaData.Measure);
        Model.RegisterProperty(PresentationTarget, 'Content',     undefined, MetaData.Render);
        Model.RegisterProperty(PresentationTarget, 'Background',  undefined, MetaData.Render);
    }

    protected constructor(width?: number, height?: number, content?: Visual)
    {
        super();
        if (width   !== undefined) this.Width = width;
        if (height  !== undefined) this.Height = height;
        if (content !== undefined) this.Content = content;
    }

    public get Width(): number { return this.get_property_value('Width'); }
    public set Width(value: number) { this.set_property_value('Width', value); }

    public get Height(): number { return this.get_property_value('Height'); }
    public set Height(value: number) { this.set_property_value('Height', value); }

    public get DeviceScale(): number { return this.get_property_value('DeviceScale'); }
    public set DeviceScale(value: number) { this.set_property_value('DeviceScale', value); }

    public get Content(): Visual | undefined { return this.get_property_value('Content'); }
    // Setter cascades the host back-pointer (`_target`) through the new
    // Visual subtree, and clears it on the old one. Bracket access on
    // SetTarget bypasses TS's protected-member check — same pattern as
    // Single / Panel call sites that reach into Visual's tree-walk hooks.
    public set Content(value: Visual | undefined)
    {
        const old = this.Content;
        if (old === value) return;
        old?.['SetTarget'](undefined);
        this.set_property_value('Content', value);
        value?.['SetTarget'](this);
    }

    // VisualHost hooks — Visuals attached to this PresentationTarget
    // call these when InvalidateMeasure / InvalidateArrange /
    // InvalidateVisual fire (which itself happens automatically through
    // OnPropertyChanged based on MetaData flags, or via explicit
    // Invalidate* calls). Base no-ops; concrete subclasses override to
    // push the Visual onto their renderer's per-phase dirty queue.
    // Wired once SvgRenderer lands (build-order step 12.8).
    public OnMeasureInvalidated(_visual: Visual): void { /* override in concrete subclasses */ }
    public OnArrangeInvalidated(_visual: Visual): void { /* override in concrete subclasses */ }
    public OnRenderInvalidated(_visual: Visual):  void { /* override in concrete subclasses */ }

    // Text measurement service exposed via VisualHost. Default is the
    // stateless approximation (no real font metrics); concrete subclasses
    // or consumers can swap in a FontMetricsMeasurer (opentype.js-backed)
    // or, when HtmlTarget lands, a CanvasTextMeasurer. The TextMeasurer
    // type on VisualHost is readonly, but this concrete field is
    // assignable — `target.TextMeasurer = new FontMetricsMeasurer()`.
    public TextMeasurer: TextMeasurer = APPROXIMATE_TEXT_MEASURER;

    // Convenience: load a font into whatever TextMeasurer is currently
    // installed. ApproximateTextMeasurer ignores the call; FontMetricsMeasurer
    // parses the buffer and stores the font keyed by (family, weight, style).
    // Weight / style are auto-detected from the font's OS/2 table when
    // omitted — explicit values override.
    public LoadFont(
        family: string,
        source: ArrayBuffer | Uint8Array,
        weight?: string,
        style?: string,
    ): void
    {
        this.TextMeasurer.LoadFont(family, source, weight, style);
    }

    public get Background(): Brush | undefined { return this.get_property_value('Background'); }
    public set Background(value: Brush | undefined) { this.set_property_value('Background', value); }
}
