import {
    Easings,
    MetaData,
    MuralBase,
    Panel,
    Rect,
    Size,
    Visual,
    type EasingFunction,
    type PointerEventArgs,
} from '../../runtime/index.js';

// M3 Button Group — horizontal row of action buttons whose widths
// interpolate on hover. The hovered child grows to `HoverWidth`; the
// non-hovered children shrink uniformly to absorb the gain. On
// PointerLeave the row returns to its resting `BaseWidth` layout.
//
// Children are declared in markup like any Panel — usually `Button`s
// but anything goes. ButtonGroup wires PointerEnter / Leave listeners
// on every added child so hover state flows from the children up; the
// row itself just owns the arrange-time width allocation.
//
// Animation: hover only flips the plain `_hovered` field and invalidates
// arrange — the smooth expand/collapse is Panel's clock-driven
// `ArrangeChild` transition (§18.3). ButtonGroup's `ArrangeOverride`
// computes each child's TARGET rect (hovered at HoverWidth, siblings
// shrunk to absorb) and hands it to `ArrangeChild`; the base tweens from
// the currently-displayed rect over `DurationMs` with `Easing`, on the
// shared animation clock. Retargeting mid-flight (hover jumping to a
// sibling) is handled by the base. No setTimeout, no per-child lerp map.
//
// Vertical orientation isn't shipped — M3 spec calls for horizontal
// rows. A vertical variant would re-direction the lerp axis; add it
// when a demo motivates it.
export class ButtonGroup extends Panel
{
    public static readonly BaseWidthKey   = MuralBase.RegisterProperty<number>(ButtonGroup, 'BaseWidth',    80, MetaData.Measure | MetaData.Arrange);
    public static readonly HoverWidthKey  = MuralBase.RegisterProperty<number>(ButtonGroup, 'HoverWidth',  120, MetaData.Measure | MetaData.Arrange);
    public static readonly SpacingKey     = MuralBase.RegisterProperty<number>(ButtonGroup, 'Spacing',       4, MetaData.Measure | MetaData.Arrange);
    public static readonly DurationMsKey  = MuralBase.RegisterProperty<number>(ButtonGroup, 'DurationMs',  200, MetaData.None);
    public static readonly EasingKey      = MuralBase.RegisterProperty<EasingFunction>(ButtonGroup, 'Easing', Easings.Standard, MetaData.None);

    public get BaseWidth():  number { return this.get_property_value(ButtonGroup.BaseWidthKey); }
    public set BaseWidth(v:  number) { this.set_property_value(ButtonGroup.BaseWidthKey, v); }

    public get HoverWidth(): number { return this.get_property_value(ButtonGroup.HoverWidthKey); }
    public set HoverWidth(v: number) { this.set_property_value(ButtonGroup.HoverWidthKey, v); }

    public get Spacing():    number { return this.get_property_value(ButtonGroup.SpacingKey); }
    public set Spacing(v:    number) { this.set_property_value(ButtonGroup.SpacingKey, v); }

    public get DurationMs(): number { return this.get_property_value(ButtonGroup.DurationMsKey); }
    public set DurationMs(v: number) { this.set_property_value(ButtonGroup.DurationMsKey, v); }

    /** Easing curve for the hover expand/collapse. Defaults to M3
     *  `Standard`; consumers can swap in any `Easings.*` (or a custom
     *  `(t) => number`) for a non-default cadence. Feeds Panel's
     *  `ArrangeTransitionEasing`. */
    public get Easing():     EasingFunction { return this.get_property_value(ButtonGroup.EasingKey); }
    public set Easing(v:     EasingFunction) { this.set_property_value(ButtonGroup.EasingKey, v); }

    // Currently-hovered child (undefined = resting). View-invisible
    // transient — the animated geometry lives in Panel's arrange-transition
    // state, not here.
    private _hovered: Visual | undefined;

    // Feed ButtonGroup's public knobs into Panel's arrange-transition hook.
    protected override get ArrangeTransitionDurationMs(): number { return this.DurationMs; }
    protected override get ArrangeTransitionEasing():     EasingFunction { return this.Easing; }

    public override AddChild(child: Visual): void
    {
        super.AddChild(child);
        // PointerEnter / PointerLeave on each child just record the hover
        // target and invalidate arrange; Panel's ArrangeChild does the
        // smooth interpolation on the next pass.
        child.AddRoutedEventListener('PointerEnter',
            (args => this.onChildEnter(child, args as PointerEventArgs)) as (a: unknown) => void);
        child.AddRoutedEventListener('PointerLeave',
            (args => this.onChildLeave(child, args as PointerEventArgs)) as (a: unknown) => void);
    }

    private onChildEnter(child: Visual, _args: PointerEventArgs): void
    {
        this._hovered = child;
        this.InvalidateArrange();
    }

    private onChildLeave(_child: Visual, _args: PointerEventArgs): void
    {
        // Pointer left a child — return to rest. A PointerEnter on a
        // sibling that fires next invalidation re-targets mid-tween; the
        // base transition handles the overlap.
        this._hovered = undefined;
        this.InvalidateArrange();
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // Every child is measured at HoverWidth — they need to know
        // their max-possible footprint so a hover expansion doesn't
        // force an out-of-bounds layout.
        const childSize = new Size(this.HoverWidth, availableSize.Height);
        let maxH = 0;
        let count = 0;
        for (const child of this.Children)
        {
            child.Measure(childSize);
            if (child.DesiredSize.Height > maxH) maxH = child.DesiredSize.Height;
            count++;
        }
        // Resting width — every child at BaseWidth. The hover expansion
        // shifts children left/right but the row's total width stays
        // pinned at the resting size; the hovered child grows by
        // (HoverWidth − BaseWidth), siblings shrink uniformly to absorb.
        const restWidth = count === 0
            ? 0
            : count * this.BaseWidth + (count - 1) * this.Spacing;
        return new Size(restWidth, maxH);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const children = this.Children;
        const n = children.Count;
        if (n === 0) return finalSize;

        const base    = this.BaseWidth;
        const hoverΔ  = this.HoverWidth - base;
        const spacing = this.Spacing;
        const hovered = this._hovered;

        // TARGET layout — computed as if the hover state were already
        // settled. The hovered child grows by hoverΔ; that gain is absorbed
        // uniformly by the (n − 1) siblings so the row's total width stays
        // pinned at the resting size. Panel's ArrangeChild tweens each
        // child from its currently-displayed rect toward this target.
        const shrink = hovered !== undefined && n > 1 ? hoverΔ / (n - 1) : 0;

        let x = 0;
        for (const child of children)
        {
            const w = child === hovered ? base + hoverΔ : base - shrink;
            this.ArrangeChild(child, new Rect(x, 0, w, finalSize.Height));
            x += w + spacing;
        }
        return finalSize;
    }

}
