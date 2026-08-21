import {
    MetaData,
    MuralBase,
    Rect,
    Size,
    Thickness,
    Element, Visual,
    Storyboard,
    DoubleAnimation,
    Easings,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { TranslateTransform, RectangleGeometry } from '../../visual-engine/index.js';
import { ItemsControl } from '../base/items-control.js';

// Material 3 Carousel — a horizontal scroller of hero cards (§18.9). The
// multi-browse layout: a clipped viewport shows `VisibleCount` fixed-width
// cards, and paging (prev / next, or an ActiveIndex write) slides the strip
// one card at a time with an eased transition on the shared animation clock.
//
// Carousel is list-based, so it descends from ItemsControl (CLAUDE.md): the
// cards are the Items, rendered through ItemTemplate. The control sizes each
// container to ItemWidth in PrepareContainerForItemOverride and translates
// the items panel to bring ActiveIndex to the leading edge.
//
// v1 scope: the multi-browse layout with snap-to-card paging. M3's other
// layouts (uncontained / hero item-size morphing at the edges, drag inertia)
// are deferred — the paging model here is the reusable core.
export class Carousel extends ItemsControl
{
    public static readonly ActiveIndexKey = MuralBase.RegisterProperty<number>(
        Carousel, 'ActiveIndex', 0, MetaData.None | MetaData.BindsTwoWayByDefault);
    public static readonly ItemWidthKey   = MuralBase.RegisterProperty<number>(Carousel, 'ItemWidth',   220, MetaData.Measure);
    public static readonly ItemSpacingKey = MuralBase.RegisterProperty<number>(Carousel, 'ItemSpacing',  12, MetaData.Measure);
    public static readonly ItemHeightKey  = MuralBase.RegisterProperty<number>(Carousel, 'ItemHeight',  260, MetaData.Measure);
    public static readonly VisibleCountKey = MuralBase.RegisterProperty<number>(Carousel, 'VisibleCount', 3, MetaData.Measure);

    public get ActiveIndex(): number { return this.get_property_value(Carousel.ActiveIndexKey); }
    public set ActiveIndex(v: number) { this.set_property_value(Carousel.ActiveIndexKey, v); }

    public get ItemWidth(): number { return this.get_property_value(Carousel.ItemWidthKey); }
    public set ItemWidth(v: number) { this.set_property_value(Carousel.ItemWidthKey, v); }

    public get ItemSpacing(): number { return this.get_property_value(Carousel.ItemSpacingKey); }
    public set ItemSpacing(v: number) { this.set_property_value(Carousel.ItemSpacingKey, v); }

    public get ItemHeight(): number { return this.get_property_value(Carousel.ItemHeightKey); }
    public set ItemHeight(v: number) { this.set_property_value(Carousel.ItemHeightKey, v); }

    public get VisibleCount(): number { return this.get_property_value(Carousel.VisibleCountKey); }
    public set VisibleCount(v: number) { this.set_property_value(Carousel.VisibleCountKey, v); }

    static
    {
        MuralBase.OverrideMetadata(Carousel, Element.DefaultStyleKeyKey, { default_value: Carousel });
    }

    private _viewport:  Element | undefined;
    private _translate: TranslateTransform | undefined;
    private _scrollSb:  Storyboard | undefined;

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.adoptParts();
    }

    private get stride(): number { return this.ItemWidth + this.ItemSpacing; }

    private adoptParts(): void
    {
        const root = this.templateRoot;
        if (root === undefined) throw new Error('Carousel template did not materialise (Template = @DefaultCarousel?).');
        this._viewport = root.FindName('PART_Viewport') as Element | undefined;

        const prev = root.FindName('PART_PrevButton') as (Visual & { AddClickHandler?: (h: () => void) => void }) | undefined;
        const next = root.FindName('PART_NextButton') as (Visual & { AddClickHandler?: (h: () => void) => void }) | undefined;
        prev?.AddClickHandler?.(() => this.page(-1));
        next?.AddClickHandler?.(() => this.page(1));

        this.refreshViewport();
    }

    // Size + clip the viewport to VisibleCount cards.
    private refreshViewport(): void
    {
        const vp = this._viewport;
        if (vp === undefined) return;
        const count = Math.max(1, this.VisibleCount);
        const width = count * this.ItemWidth + (count - 1) * this.ItemSpacing;
        vp.Width  = width;
        vp.Height = this.ItemHeight;
        vp.Clip   = new RectangleGeometry(new Rect(0, 0, width, this.ItemHeight));
    }

    private itemCount(): number
    {
        const items = this.Items;
        if (items === undefined) return 0;
        return Array.isArray(items) ? items.length : (items as { Count: number }).Count;
    }

    private clampIndex(i: number): number
    {
        const max = Math.max(0, this.itemCount() - 1);
        return Math.max(0, Math.min(max, i));
    }

    // Page by `delta` cards (clamped). Public so a keyboard behaviour or a
    // consumer button can drive it too.
    public page(delta: number): void
    {
        const target = this.clampIndex(this.ActiveIndex + delta);
        if (target !== this.ActiveIndex) this.ActiveIndex = target;
        else this.scrollToActive(true);   // re-settle if already at an edge
    }

    private scrollToActive(animate: boolean): void
    {
        const panel = this.ItemsPanelInstance;
        if (panel === undefined) return;
        if (this._translate === undefined)
        {
            this._translate = new TranslateTransform();
            panel.RenderTransform = this._translate;
        }
        const targetX = -this.clampIndex(this.ActiveIndex) * this.stride;

        this._scrollSb?.Stop();
        this._scrollSb = undefined;

        if (!animate)
        {
            this._translate.X = targetX;
            return;
        }
        const sb = new Storyboard();
        sb.Add(this._translate, 'X', new DoubleAnimation({
            From: this._translate.X, To: targetX, Duration: 320, Easing: Easings.Standard,
        }));
        sb.Begin();
        this._scrollSb = sb;
    }

    // Fix each card's stride: width = ItemWidth, trailing gap = ItemSpacing.
    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        const el = container as Element;
        el.Width  = this.ItemWidth;
        el.Height = this.ItemHeight;
        el.Margin = new Thickness(0, 0, this.ItemSpacing, 0);
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const s = super.MeasureOverride(availableSize);
        // The panel exists after the first measure — settle it (no anim) so
        // the initial ActiveIndex is honoured without a slide-in.
        this.scrollToActive(false);
        return s;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'Template' && newValue !== oldValue)
        {
            this.adoptParts();
            return;
        }
        if (descriptor.Owner !== Carousel) return;
        if (name === 'ActiveIndex') this.scrollToActive(true);
        else if (name === 'ItemWidth' || name === 'ItemSpacing' || name === 'ItemHeight' || name === 'VisibleCount')
        {
            this.refreshViewport();
            this.scrollToActive(false);
        }
    }
}
