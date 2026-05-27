import { APPROXIMATE_TEXT_MEASURER, MetaData, Model, Size } from '../runtime/index.js';
import { Rect } from '../runtime/index.js';
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
// Two sizing modes:
//   * Fixed   — Width / Height are set to numbers. The target tells
//               Content to Measure within those exact dimensions and
//               Arranges at (0, 0, Width, Height). ActualWidth /
//               ActualHeight mirror Width / Height after Render.
//   * Auto    — Either or both of Width / Height are left as NaN (the
//               default). The auto axis is measured with +Infinity so
//               Content reports its natural DesiredSize; the target's
//               surface for that axis becomes Content.DesiredSize and
//               Arrange uses it. Width / Height stay NaN (user input is
//               preserved), and ActualWidth / ActualHeight expose the
//               resolved surface dimensions after Render.
// Axes are independent — `target.Width = 800; target.Height = NaN`
// pins width and lets height grow with content (e.g. a known-width
// column whose height is determined by its contents).
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
        // NaN = "auto" — the axis sizes to Content.DesiredSize at
        // Render time. Any finite number = fixed mode for that axis.
        Model.RegisterProperty(PresentationTarget, 'Width',       Number.NaN, MetaData.Measure);
        Model.RegisterProperty(PresentationTarget, 'Height',      Number.NaN, MetaData.Measure);
        Model.RegisterProperty(PresentationTarget, 'DeviceScale', 1,          MetaData.Measure);
        Model.RegisterProperty(PresentationTarget, 'Content',     undefined,  MetaData.Render);
        Model.RegisterProperty(PresentationTarget, 'Background',  undefined,  MetaData.Render);
    }

    private _actualWidth:  number = 0;
    private _actualHeight: number = 0;

    protected constructor(width?: number, height?: number, content?: Visual)
    {
        super();
        if (width   !== undefined) this.Width = width;
        if (height  !== undefined) this.Height = height;
        if (content !== undefined) this.Content = content;
    }

    // User-set width. NaN (the default) means the width is resolved
    // from Content.DesiredSize at Render time. A finite value pins
    // the surface to exactly that width.
    public get Width(): number { return this.get_property_value('Width'); }
    public set Width(value: number) { this.set_property_value('Width', value); }

    // User-set height. NaN (the default) means the height is resolved
    // from Content.DesiredSize at Render time. A finite value pins
    // the surface to exactly that height.
    public get Height(): number { return this.get_property_value('Height'); }
    public set Height(value: number) { this.set_property_value('Height', value); }

    // Resolved surface dimensions in DIPs, updated by the concrete
    // target's Render pass. In fixed mode these equal Width / Height;
    // in auto mode they hold the Content.DesiredSize value chosen for
    // that axis. Zero on a freshly-constructed target — only meaningful
    // after at least one Render call.
    public get ActualWidth(): number  { return this._actualWidth; }
    public get ActualHeight(): number { return this._actualHeight; }

    // Called by concrete subclasses' Render pass after auto-mode
    // resolution. Separate from Width / Height so user inputs (NaN-as-
    // auto) survive re-rendering with a different Content.
    protected SetActualSize(width: number, height: number): void
    {
        this._actualWidth  = width;
        this._actualHeight = height;
    }

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

    // ------------------------------------------------------------------
    // Invalidation queue + coalesced flush
    // ------------------------------------------------------------------
    //
    // Visuals attached to this PresentationTarget call OnMeasureInvalidated /
    // OnArrangeInvalidated / OnRenderInvalidated when their corresponding
    // InvalidateMeasure / InvalidateArrange / InvalidateVisual fires (either
    // automatically through OnPropertyChanged + MetaData flags, or via
    // explicit Invalidate* calls).
    //
    // Each notification:
    //   1. Records the Visual in the matching per-phase Set (deduped).
    //   2. Schedules a single microtask Flush() if one isn't already pending.
    //
    // Flush() runs layout root-down (measure + arrange) on Content. Visual's
    // own _isMeasureValid / _isArrangeValid caches make untouched subtrees
    // O(1), so an "everything dirty" pass still costs only what genuinely
    // changed.
    //
    // The render set persists across Flush() — Flush() resolves layout but
    // doesn't paint (the base has no DrawingContext). A concrete subclass
    // with a renderer drains renderDirty during its render pass. The
    // built-in HeadlessTarget consumes it in Render(dc).

    protected readonly measureDirty: Set<Visual> = new Set();
    protected readonly arrangeDirty: Set<Visual> = new Set();
    protected readonly renderDirty:  Set<Visual> = new Set();
    private flushScheduled: boolean = false;

    public OnMeasureInvalidated(visual: Visual): void
    {
        this.measureDirty.add(visual);
        this.scheduleFlush();
    }

    public OnArrangeInvalidated(visual: Visual): void
    {
        this.arrangeDirty.add(visual);
        this.scheduleFlush();
    }

    public OnRenderInvalidated(visual: Visual): void
    {
        this.renderDirty.add(visual);
        this.scheduleFlush();
    }

    // True when measure or arrange has pending work. Cleared by Flush().
    // Exposed for tests and for renderers that want to skip a frame when
    // nothing has changed.
    public get HasPendingLayout(): boolean
    {
        return this.measureDirty.size > 0 || this.arrangeDirty.size > 0;
    }

    // True when render-only invalidations are queued. Not cleared by
    // Flush() — only a render pass consumes the render set. Exposed so
    // concrete subclasses can ask "is there paint work?" without
    // inspecting the Set directly.
    public get HasPendingRender(): boolean
    {
        return this.renderDirty.size > 0;
    }

    // First invalidation per task queues a microtask that drains. Repeated
    // invalidations within the same task share that one tick — that's the
    // whole point of the dirty Sets: coalescing.
    private scheduleFlush(): void
    {
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        queueMicrotask(() =>
        {
            this.flushScheduled = false;
            this.Flush();
        });
    }

    // Resolves layout for the Content subtree:
    //   1. Measure Content with the user-set Width / Height, swapping in
    //      +Infinity on any auto axis so Content reports its natural
    //      DesiredSize.
    //   2. Publish the resolved surface size via SetActualSize.
    //   3. Arrange Content at (0, 0, ActualWidth, ActualHeight).
    //
    // Callable explicitly (tests, sync code paths); also runs automatically
    // on the microtask after any invalidation. Idempotent — Visual's
    // _isMeasureValid / _isArrangeValid caches short-circuit if nothing
    // actually changed since the last Flush.
    //
    // Render-set state is preserved — a concrete subclass's renderer is
    // responsible for consuming it during paint.
    public Flush(): void
    {
        const content = this.Content;
        const autoW = Number.isNaN(this.Width);
        const autoH = Number.isNaN(this.Height);

        let surfaceW: number;
        let surfaceH: number;

        if (content !== undefined)
        {
            const availW = autoW ? Number.POSITIVE_INFINITY : this.Width;
            const availH = autoH ? Number.POSITIVE_INFINITY : this.Height;
            content.Measure(new Size(availW, availH));

            surfaceW = autoW ? content.DesiredSize.Width  : this.Width;
            surfaceH = autoH ? content.DesiredSize.Height : this.Height;
        }
        else
        {
            // No content: auto axes have nothing to measure → 0. Fixed
            // axes keep their value (Background still paints over them
            // when the subclass renders).
            surfaceW = autoW ? 0 : this.Width;
            surfaceH = autoH ? 0 : this.Height;
        }

        this.SetActualSize(surfaceW, surfaceH);

        if (content !== undefined)
        {
            content.Arrange(new Rect(0, 0, surfaceW, surfaceH));
        }

        this.measureDirty.clear();
        this.arrangeDirty.clear();
    }

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
