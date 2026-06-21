import {
    MetaData,
    Model,
    Panel,
    Rect,
    Size,
    Visual,
    type PointerEventArgs,
} from '../../runtime/index.js';

function nowMs(): number { return Date.now(); }

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
// Animation: hover state animates the per-child expansion via a polled
// requestAnimationFrame tween (default 200ms). Each tick updates the
// internal _lerps map and invalidates Arrange; the next layout pass
// reads the lerped widths. Tween cancels cleanly when a new hover
// target lands inside the duration window.
//
// Vertical orientation isn't shipped — M3 spec calls for horizontal
// rows. A vertical variant would re-direction the lerp axis; add it
// when a demo motivates it.
export class ButtonGroup extends Panel
{
    public static readonly BaseWidthKey   = Model.RegisterProperty<number>(ButtonGroup, 'BaseWidth',    80, MetaData.Measure | MetaData.Arrange);
    public static readonly HoverWidthKey  = Model.RegisterProperty<number>(ButtonGroup, 'HoverWidth',  120, MetaData.Measure | MetaData.Arrange);
    public static readonly SpacingKey     = Model.RegisterProperty<number>(ButtonGroup, 'Spacing',       4, MetaData.Measure | MetaData.Arrange);
    public static readonly DurationMsKey  = Model.RegisterProperty<number>(ButtonGroup, 'DurationMs',  200, MetaData.None);

    public get BaseWidth():  number { return this.get_property_value(ButtonGroup.BaseWidthKey); }
    public set BaseWidth(v:  number) { this.set_property_value(ButtonGroup.BaseWidthKey, v); }

    public get HoverWidth(): number { return this.get_property_value(ButtonGroup.HoverWidthKey); }
    public set HoverWidth(v: number) { this.set_property_value(ButtonGroup.HoverWidthKey, v); }

    public get Spacing():    number { return this.get_property_value(ButtonGroup.SpacingKey); }
    public set Spacing(v:    number) { this.set_property_value(ButtonGroup.SpacingKey, v); }

    public get DurationMs(): number { return this.get_property_value(ButtonGroup.DurationMsKey); }
    public set DurationMs(v: number) { this.set_property_value(ButtonGroup.DurationMsKey, v); }

    // Per-child expansion lerp: 0 = at BaseWidth, 1 = at HoverWidth.
    // Filled lazily — children with no entry default to 0.
    private _lerps    = new Map<Visual, number>();
    // Per-child target lerp. The tween polls and converges _lerps[c]
    // toward _targets[c] over DurationMs.
    private _targets  = new Map<Visual, number>();
    private _tweenAt  = 0;        // wall-clock ms of the last tween start
    private _tickerId: ReturnType<typeof setTimeout> | undefined;

    public override AddChild(child: Visual): void
    {
        super.AddChild(child);
        // PointerEnter / PointerLeave on each child set the target lerp
        // for that child; the polled tween picks up the new target on
        // its next tick.
        child.AddRoutedEventListener('PointerEnter',
            (args => this.onChildEnter(child, args as PointerEventArgs)) as (a: unknown) => void);
        child.AddRoutedEventListener('PointerLeave',
            (args => this.onChildLeave(child, args as PointerEventArgs)) as (a: unknown) => void);
    }

    private onChildEnter(child: Visual, _args: PointerEventArgs): void
    {
        // Hovered child → target 1; everyone else → target 0.
        for (const c of this.Children)
        {
            this._targets.set(c, c === child ? 1 : 0);
        }
        this.startTween();
    }

    private onChildLeave(_child: Visual, _args: PointerEventArgs): void
    {
        // Pointer left a child — return EVERY child to 0. A future
        // PointerEnter on a sibling will flip its target back to 1
        // before this tween completes; the polled loop handles the
        // overlap by retargeting mid-tween.
        for (const c of this.Children)
        {
            this._targets.set(c, 0);
        }
        this.startTween();
    }

    private startTween(): void
    {
        this._tweenAt = nowMs();
        if (this._tickerId !== undefined) return;  // already ticking
        const tick = (): void => {
            const stillMoving = this.advanceTween();
            this.InvalidateArrange();
            if (stillMoving)
            {
                this._tickerId = setTimeout(tick, 16);
            }
            else
            {
                this._tickerId = undefined;
            }
        };
        this._tickerId = setTimeout(tick, 16);
    }

    private advanceTween(): boolean
    {
        const elapsed = nowMs() - this._tweenAt;
        const duration = Math.max(1, this.DurationMs);
        // Step toward target — fixed-rate per-tick advance (16ms / duration)
        // approximates the linear easing M3 spec uses for action surfaces.
        const stepSize = Math.min(1, 16 / duration);
        let moving = false;
        for (const c of this.Children)
        {
            const target = this._targets.get(c) ?? 0;
            const current = this._lerps.get(c) ?? 0;
            if (current === target) continue;
            const delta = target - current;
            const step  = Math.sign(delta) * Math.min(Math.abs(delta), stepSize);
            const next  = current + step;
            this._lerps.set(c, next);
            if (next !== target) moving = true;
        }
        if (elapsed > duration * 2) return false;  // safety: stop after 2× duration
        return moving;
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

        // Sum of all lerps — at rest = 0, at full hover = 1. Used to
        // size the shrink applied to non-hovered siblings.
        let totalLerp = 0;
        for (const c of children) totalLerp += this._lerps.get(c) ?? 0;
        const shrink = n > 1 ? (totalLerp * hoverΔ) / (n - 1) : 0;

        let x = 0;
        for (const child of children)
        {
            const lerp = this._lerps.get(child) ?? 0;
            const w    = base + lerp * hoverΔ - (1 - lerp) * shrink;
            child.Arrange(new Rect(x, 0, w, finalSize.Height));
            x += w + spacing;
        }
        return finalSize;
    }

}
